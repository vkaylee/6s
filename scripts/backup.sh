#!/usr/bin/env bash
set -euo pipefail

# 6S production backup and restore validation.
#
# backup:  pg_dump custom format + uploads delta copy, bundled and encrypted
#          with a backup-only key, written to operator-supplied storage.
# restore: decrypts a bundle into a disposable database, restores it, and
#          validates foreign keys and row/FK counts before dropping it.
#
# Every required input fails closed: no destination, no DB credentials, no
# private encryption key, or no uploads directory aborts before anything runs.

usage() {
    cat <<'USAGE'
Usage:
  backup.sh backup
  backup.sh restore <bundle.tar.gpg>

Backup environment (all required):
  BACKUP_DESTINATION         Existing absolute, writable directory on separate storage.
  BACKUP_UPLOADS_DIR         Existing uploads directory (app-data volume mount).
  BACKUP_NETWORK             Container network that reaches PostgreSQL.
  BACKUP_ENCRYPTION_KEY_FILE Regular file, mode 600/400, holding the backup-only passphrase.
  PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLMODE
                             Dump credentials; DB_ADMIN_USER/DB_ADMIN_PASSWORD/DB_NAME
                             from .env.prod are accepted as fallbacks for PGUSER/PGPASSWORD/PGDATABASE.

Restore additionally requires:
  BACKUP_RESTORE_CONFIRM=YES
  RESTORE_PGHOST RESTORE_PGPORT RESTORE_PGUSER RESTORE_PGPASSWORD RESTORE_PGSSLMODE
  RESTORE_PGADMIN_DB         Maintenance database on the disposable server (default: postgres).

Optional:
  BACKUP_POSTGRES_IMAGE      Default docker.io/library/postgres:18 (pinned client tools).
  BACKUP_CONTAINER_RUNTIME   podman or docker; autodetected.
  BACKUP_RESTORE_KEEP_DB=1   Keep the disposable database for inspection.
  BACKUP_DAILY_RETENTION_DAYS / BACKUP_WEEKLY_RETENTION_DAYS / BACKUP_MONTHLY_RETENTION_DAYS
                             Defaults 30 / 180 / 1095, matching the backup policy in
                             .agent/rules/business-continuity.md. Newest artifact in each
                             weekly and monthly bucket is kept.

Prerequisite: host `gpg`, `rsync`, `tar`, and a rootless-capable container runtime
(podman or docker) that can join BACKUP_NETWORK. The backup key must be stored
separately from the database and never committed.
USAGE
}

die() {
    printf 'backup: %s\n' "$*" >&2
    exit 1
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || die "$1 is required"
}

validate_days() {
    local name=$1 value=$2
    [[ "$value" =~ ^[0-9]+$ ]] || die "$name must be a non-negative integer"
}

validate_key_file() {
    local key=$1 mode
    [[ -f "$key" && ! -L "$key" ]] || die 'BACKUP_ENCRYPTION_KEY_FILE must be a regular file'
    [[ -s "$key" && -r "$key" ]] || die 'BACKUP_ENCRYPTION_KEY_FILE must be readable and non-empty'
    mode=$(stat -c '%a' -- "$key") || die 'cannot inspect the encryption key file'
    (((8#$mode & 8#077) == 0)) || die 'BACKUP_ENCRYPTION_KEY_FILE must not be group or world accessible (chmod 600)'
}

select_runtime() {
    if [[ -n ${BACKUP_CONTAINER_RUNTIME:-} ]]; then
        runtime=$BACKUP_CONTAINER_RUNTIME
    elif command -v podman >/dev/null 2>&1; then
        runtime=podman
    elif command -v docker >/dev/null 2>&1; then
        runtime=docker
    else
        die 'podman or docker is required'
    fi
    command -v "$runtime" >/dev/null 2>&1 || die "container runtime not found: $runtime"
    runtime_args=()
    [[ "$runtime" == podman ]] && runtime_args+=(--userns=keep-id)
    backup_image=${BACKUP_POSTGRES_IMAGE:-docker.io/library/postgres:18}
}

# Database credentials and the dump itself never reach a container command line:
# values travel as inherited environment, the dump travels over stdin/stdout.
run_pg() {
    local env_args=(--env PGHOST --env PGPORT --env PGUSER --env PGPASSWORD --env PGDATABASE --env PGSSLMODE)
    [[ -n ${PGSSLROOTCERT:-} ]] && env_args+=(--env PGSSLROOTCERT)
    "$runtime" run --rm -i --network "$BACKUP_NETWORK" "${runtime_args[@]}" \
        "${env_args[@]}" "$backup_image" "$@"
}

load_common_config() {
    : "${BACKUP_NETWORK:?BACKUP_NETWORK is required (container network that reaches PostgreSQL)}"
    : "${BACKUP_ENCRYPTION_KEY_FILE:?BACKUP_ENCRYPTION_KEY_FILE is required; backups require a separate key}"
    validate_key_file "$BACKUP_ENCRYPTION_KEY_FILE"
    require_command gpg
    require_command tar
    require_command sha256sum
    require_command stat
    require_command flock
    require_command find
    require_command mktemp
    select_runtime
    "$runtime" network inspect "$BACKUP_NETWORK" >/dev/null 2>&1 ||
        die "container network $BACKUP_NETWORK does not exist"
}

load_backup_config() {
    : "${BACKUP_DESTINATION:?BACKUP_DESTINATION is required and must be existing backup storage}"
    : "${BACKUP_UPLOADS_DIR:?BACKUP_UPLOADS_DIR is required; a database-only backup is refused}"

    require_command rsync
    PGHOST=${PGHOST:-db}
    PGPORT=${PGPORT:-5432}
    PGUSER=${PGUSER:-${DB_ADMIN_USER:-}}
    PGPASSWORD=${PGPASSWORD:-${DB_ADMIN_PASSWORD:-}}
    PGDATABASE=${PGDATABASE:-${DB_NAME:-}}
    PGSSLMODE=${PGSSLMODE:-require}
    : "${PGUSER:?PGUSER or DB_ADMIN_USER is required}"
    : "${PGPASSWORD:?PGPASSWORD or DB_ADMIN_PASSWORD is required}"
    : "${PGDATABASE:?PGDATABASE or DB_NAME is required}"
    case "$PGSSLMODE" in
        require|verify-ca|verify-full) ;;
        disable)
            [[ ${BACKUP_ALLOW_INSECURE_SSL:-0} == 1 ]] ||
                die 'PGSSLMODE=disable is only permitted when BACKUP_ALLOW_INSECURE_SSL=1'
            ;;
        *) die 'PGSSLMODE must be require, verify-ca, or verify-full for production backups' ;;
    esac
    export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLMODE

    [[ "$BACKUP_DESTINATION" == /* ]] || die 'BACKUP_DESTINATION must be an absolute path'
    [[ "$BACKUP_DESTINATION" != / ]] || die 'BACKUP_DESTINATION cannot be the filesystem root'
    [[ -d "$BACKUP_DESTINATION" ]] || die 'BACKUP_DESTINATION must already exist; refusing to create an unexpected destination'
    [[ -w "$BACKUP_DESTINATION" ]] || die 'BACKUP_DESTINATION is not writable'
    [[ -d "$BACKUP_UPLOADS_DIR" ]] || die 'BACKUP_UPLOADS_DIR must already exist'
    [[ -r "$BACKUP_UPLOADS_DIR" ]] || die 'BACKUP_UPLOADS_DIR is not readable'

    local dest_real uploads_real
    dest_real=$(cd -- "$BACKUP_DESTINATION" && pwd -P) || die 'cannot resolve BACKUP_DESTINATION'
    uploads_real=$(cd -- "$BACKUP_UPLOADS_DIR" && pwd -P) || die 'cannot resolve BACKUP_UPLOADS_DIR'
    case "$dest_real/" in
        "$uploads_real"/*) die 'BACKUP_DESTINATION cannot live inside BACKUP_UPLOADS_DIR' ;;
    esac
    case "$uploads_real/" in
        "$dest_real"/*) die 'BACKUP_UPLOADS_DIR cannot live inside BACKUP_DESTINATION' ;;
    esac

    daily_retention=${BACKUP_DAILY_RETENTION_DAYS:-30}
    weekly_retention=${BACKUP_WEEKLY_RETENTION_DAYS:-180}
    monthly_retention=${BACKUP_MONTHLY_RETENTION_DAYS:-1095}
    validate_days BACKUP_DAILY_RETENTION_DAYS "$daily_retention"
    validate_days BACKUP_WEEKLY_RETENTION_DAYS "$weekly_retention"
    validate_days BACKUP_MONTHLY_RETENTION_DAYS "$monthly_retention"
    ((daily_retention <= weekly_retention && weekly_retention <= monthly_retention)) ||
        die 'retention windows must be ordered daily <= weekly <= monthly'

    # Prove the destination is real mounted storage before touching the database.
    local probe="$dest_real/.6s-backup-write-probe.$$"
    (umask 077; : > "$probe") || die 'BACKUP_DESTINATION is not writable'
    rm -f -- "$probe" || die 'cannot clean the BACKUP_DESTINATION write probe'

    exec 9>"$dest_real/.6s-backup.lock"
    flock -n 9 || die 'another backup is already running against BACKUP_DESTINATION'
    backup_dest=$dest_real
}

prune_backups() {
    local now artifact path mtime age period
    declare -A seen_week=() seen_month=()
    now=$(date -u +%s)
    while IFS= read -r artifact; do
        path="$backup_dest/$artifact"
        mtime=$(stat -c '%Y' -- "$path")
        age=$(( (now - mtime) / 86400 ))
        if ((age <= daily_retention)); then
            continue
        elif ((age <= weekly_retention)); then
            period=$(date -u -d "@$mtime" +%G-%V)
            if [[ -n ${seen_week[$period]:-} ]]; then
                rm -f -- "$path" "$path.sha256"
            else
                seen_week[$period]=1
            fi
        elif ((age <= monthly_retention)); then
            period=$(date -u -d "@$mtime" +%Y-%m)
            if [[ -n ${seen_month[$period]:-} ]]; then
                rm -f -- "$path" "$path.sha256"
            else
                seen_month[$period]=1
            fi
        else
            rm -f -- "$path" "$path.sha256"
        fi
    done < <(find "$backup_dest" -maxdepth 1 -type f -name '6s-*.tar.gpg' -printf '%f\n' | sort -r)
}

# Temp paths are global so the EXIT trap still sees them after the worker
# function returns; function locals are already out of scope by then.
backup_stage=
backup_plain=
backup_encrypted_tmp=
restore_stage=
restore_created=0

cleanup() {
    local status=$?
    rm -rf -- "${backup_stage:-}" "${backup_plain:-}" "${backup_encrypted_tmp:-}" "${restore_stage:-}"
    if ((restore_created == 1)) && [[ ${BACKUP_RESTORE_KEEP_DB:-0} != 1 ]]; then
        if ! PGDATABASE=$RESTORE_PGADMIN_DB run_pg dropdb --if-exists "$restore_db" >/dev/null 2>&1; then
            printf 'backup: could not drop disposable restore database %s\n' "$restore_db" >&2
            ((status == 0)) && status=1
        fi
    fi
    exit "$status"
}
trap cleanup EXIT

backup() {
    local name now encrypted upload_count

    name="6s-$(date -u +%Y%m%dT%H%M%SZ)"
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    backup_stage=$(mktemp -d "$backup_dest/.6s-backup.XXXXXX") || die 'cannot create staging directory'
    chmod 700 "$backup_stage"
    backup_plain=$(mktemp "$backup_dest/.6s-bundle.XXXXXX") || die 'cannot create bundle file'
    backup_encrypted_tmp=$(mktemp "$backup_dest/.6s-encrypted.XXXXXX") || die 'cannot create encrypted file'
    encrypted="$backup_dest/$name.tar.gpg"

    # Omitting --file makes pg_dump write its custom-format archive to stdout;
    # --file=- is interpreted as a literal filename by PostgreSQL 18.
    run_pg pg_dump --format=custom --no-owner --no-privileges > "$backup_stage/database.dump"

    [[ -s "$backup_stage/database.dump" ]] || die 'pg_dump produced an empty dump'
    run_pg pg_restore --list < "$backup_stage/database.dump" >/dev/null ||
        die 'pg_dump output is not a readable custom-format archive'

    # Fresh staging plus --delete: the bundle is a complete delta-consistent
    # copy of uploads, with no stale files from an earlier run.
    rsync -a --delete --numeric-ids "$BACKUP_UPLOADS_DIR"/ "$backup_stage/uploads"/
    [[ -d "$backup_stage/uploads" ]] || die 'uploads synchronization produced no uploads directory'
    [[ -z "$(find "$backup_stage/uploads" -type l -print -quit)" ]] || die 'uploads tree contains symlinks; refusing an ambiguous backup'
    upload_count=$(find "$backup_stage/uploads" -type f -printf '.' | wc -c)

    {
        printf 'backup_format=6s-pg-custom-v1\n'
        printf 'created_utc=%s\n' "$now"
        printf 'database_format=pg_dump-custom\n'
        printf 'uploads_sync=rsync-a\n'
        printf 'uploads_files=%s\n' "$upload_count"
    } > "$backup_stage/manifest.txt"

    tar --format=pax --numeric-owner --xattrs --acls --sort=name \
        -C "$backup_stage" -cf "$backup_plain" database.dump uploads manifest.txt
    [[ -s "$backup_plain" ]] || die 'backup bundle is empty'

    [[ ! -e "$encrypted" && ! -e "$encrypted.sha256" ]] || die "backup artifact already exists: $encrypted"
    gpg --batch --yes --pinentry-mode loopback \
        --passphrase-file "$BACKUP_ENCRYPTION_KEY_FILE" \
        --cipher-algo AES256 --symmetric --output "$backup_encrypted_tmp" "$backup_plain"
    [[ -s "$backup_encrypted_tmp" ]] || die 'backup encryption produced an empty artifact'

    # Plaintext bundle is removed before the encrypted artifact is published.
    rm -f -- "$backup_plain" "$backup_stage/database.dump"
    chmod 600 "$backup_encrypted_tmp"
    mv -f -- "$backup_encrypted_tmp" "$encrypted"
    (umask 077; sha256sum "$encrypted" > "$encrypted.sha256")
    prune_backups

    printf 'backup complete: %s (uploads_files=%s)\n' "$encrypted" "$upload_count"
}

restore() {
    local bundle=$1 archive_list member validation tables rows fks invalid upload_count

    load_common_config
    : "${BACKUP_RESTORE_CONFIRM:?BACKUP_RESTORE_CONFIRM=YES is required for disposable restore validation}"
    [[ "$BACKUP_RESTORE_CONFIRM" == YES ]] || die 'BACKUP_RESTORE_CONFIRM must equal YES'
    RESTORE_PGHOST=${RESTORE_PGHOST:-${PGHOST:-}}
    RESTORE_PGPORT=${RESTORE_PGPORT:-5432}
    RESTORE_PGUSER=${RESTORE_PGUSER:-${PGUSER:-}}
    RESTORE_PGPASSWORD=${RESTORE_PGPASSWORD:-${PGPASSWORD:-}}
    RESTORE_PGSSLMODE=${RESTORE_PGSSLMODE:-require}
    RESTORE_PGADMIN_DB=${RESTORE_PGADMIN_DB:-postgres}
    : "${RESTORE_PGHOST:?RESTORE_PGHOST is required}"
    : "${RESTORE_PGUSER:?RESTORE_PGUSER is required}"
    : "${RESTORE_PGPASSWORD:?RESTORE_PGPASSWORD is required}"
    case "$RESTORE_PGSSLMODE" in
        require|verify-ca|verify-full|disable) ;;
        *) die 'RESTORE_PGSSLMODE must be require, verify-ca, verify-full, or disable for a local disposable database' ;;
    esac

    [[ -f "$bundle" && ! -L "$bundle" && -s "$bundle" ]] || die 'restore bundle must be a non-empty regular file'
    [[ "$bundle" == *.tar.gpg ]] || die 'restore bundle must end in .tar.gpg'
    bundle=$(cd -- "$(dirname -- "$bundle")" && pwd -P)/$(basename -- "$bundle") || die 'cannot resolve the backup bundle path'

    export PGHOST="$RESTORE_PGHOST" PGPORT="$RESTORE_PGPORT" PGUSER="$RESTORE_PGUSER" \
        PGPASSWORD="$RESTORE_PGPASSWORD" PGSSLMODE="$RESTORE_PGSSLMODE" PGDATABASE="$RESTORE_PGADMIN_DB"

    restore_stage=$(mktemp -d "${TMPDIR:-/tmp}/6s-restore.XXXXXX") || die 'cannot create restore staging directory'
    chmod 700 "$restore_stage"

    gpg --batch --quiet --pinentry-mode loopback \
        --passphrase-file "$BACKUP_ENCRYPTION_KEY_FILE" --decrypt --output "$restore_stage/bundle.tar" "$bundle"
    [[ -s "$restore_stage/bundle.tar" ]] || die 'decrypted backup bundle is empty'

    # Reject unsafe or unexpected archive members before extraction: a bundle
    # written by this script is exactly database.dump, uploads/, and manifest.txt.
    archive_list="$restore_stage/archive.list"
    tar -tf "$restore_stage/bundle.tar" > "$archive_list"
    local found_dump=0 found_uploads=0
    while IFS= read -r member; do
        case "$member" in
            /*|../*|*/../*|*/..|./*) die "backup bundle contains an unsafe path: $member" ;;
            database.dump) found_dump=1 ;;
            uploads|uploads/) found_uploads=1 ;;
            uploads/*) found_uploads=1 ;;
            manifest.txt) ;;
            *) die "backup bundle contains an unexpected path: $member" ;;
        esac
    done < "$archive_list"
    ((found_dump == 1)) || die 'backup bundle does not contain database.dump'
    ((found_uploads == 1)) || die 'backup bundle does not contain uploads'
    tar -xf "$restore_stage/bundle.tar" -C "$restore_stage"
    [[ -s "$restore_stage/database.dump" && -d "$restore_stage/uploads" ]] || die 'backup extraction is incomplete'
    upload_count=$(find "$restore_stage/uploads" -type f -printf '.' | wc -c)

    run_pg pg_restore --list < "$restore_stage/database.dump" >/dev/null ||
        die 'database.dump is not a readable custom-format archive'

    restore_db="restore_6s_$(date -u +%Y%m%d%H%M%S)_$$"
    [[ "$restore_db" =~ ^[a-z][a-z0-9_]*$ ]] || die 'generated restore database name is invalid'
    run_pg dropdb --if-exists "$restore_db" >/dev/null
    run_pg createdb "$restore_db"
    restore_created=1
    export PGDATABASE="$restore_db"
    run_pg pg_restore --exit-on-error --no-owner --no-privileges --dbname="$restore_db" < "$restore_stage/database.dump"
    # Validate every foreign key, then count tables, rows, and foreign keys in
    # one session so the numbers come from the restored database itself.
    cat > "$restore_stage/validate.sql" <<'SQL'
\set ON_ERROR_STOP on
SELECT format('ALTER TABLE %I.%I VALIDATE CONSTRAINT %I;', n.nspname, t.relname, c.conname)
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE c.contype = 'f'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
\gexec
DO $do$
DECLARE
    tbl record;
    table_total bigint := 0;
    row_total bigint := 0;
    table_rows bigint;
    fk_total bigint;
    invalid_fk_total bigint;
BEGIN
    FOR tbl IN
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY schemaname, tablename
    LOOP
        EXECUTE format('SELECT count(*) FROM %I.%I', tbl.schemaname, tbl.tablename) INTO table_rows;
        table_total := table_total + 1;
        row_total := row_total + table_rows;
    END LOOP;
    SELECT count(*), count(*) FILTER (WHERE NOT convalidated)
      INTO fk_total, invalid_fk_total
      FROM pg_constraint
     WHERE contype = 'f';
    CREATE TEMP TABLE _backup_validation AS
        SELECT table_total AS table_count, row_total AS row_count,
               fk_total AS foreign_key_count, invalid_fk_total AS invalid_foreign_key_count;
END
$do$;
SELECT table_count, row_count, foreign_key_count, invalid_foreign_key_count FROM _backup_validation;
SQL

    validation=$(run_pg psql --no-psqlrc --quiet --tuples-only --no-align --field-separator='|' \
        --set ON_ERROR_STOP=1 < "$restore_stage/validate.sql") ||
        die 'restore validation query failed'
    validation=${validation//$'\r'/}
    validation=${validation//$'\n'/}
    IFS='|' read -r tables rows fks invalid <<< "$validation"
    if [[ ! "$tables" =~ ^[0-9]+$ || ! "$rows" =~ ^[0-9]+$ || ! "$fks" =~ ^[0-9]+$ || ! "$invalid" =~ ^[0-9]+$ ]]; then
        die 'restore validation returned malformed row/FK counts'
    fi
    ((tables > 0)) || die 'restore validation found no application tables'
    ((fks > 0)) || die 'restore validation found no foreign keys; refusing to treat this as a valid restore'
    ((invalid == 0)) || die "restore validation found $invalid invalid foreign keys"

    printf 'restore validation passed: database=%s tables=%s rows=%s foreign_keys=%s invalid_foreign_keys=%s uploads_files=%s\n' \
        "$restore_db" "$tables" "$rows" "$fks" "$invalid" "$upload_count"
    if [[ ${BACKUP_RESTORE_KEEP_DB:-0} == 1 ]]; then
        printf 'disposable database retained by BACKUP_RESTORE_KEEP_DB=1: %s\n' "$restore_db"
    else
        printf 'disposable database will be dropped\n'
    fi
}

main() {
    case "${1:-}" in
        backup)
            (($# == 1)) || { usage >&2; exit 2; }
            load_common_config
            load_backup_config
            backup
            ;;
        restore)
            (($# == 2)) || { usage >&2; exit 2; }
            restore "$2"
            ;;
        -h|--help)
            usage
            ;;
        *)
            usage >&2
            exit 2
            ;;
    esac
}

main "$@"
