#!/usr/bin/env bash
set -euo pipefail

usage() {
    printf '%s\n' 'Usage: build-image.sh [--image NAME] [--tag TAG]' \
        'Build the production image without runtime secrets, push, or deployment.' \
        'Defaults: localhost/6s-app:sha-<git revision>; prefers Podman over Docker.'
}

image=localhost/6s-app
tag=
while (($#)); do
    case "$1" in
        --image|--tag)
            if (($# < 2)) || [[ -z "$2" || "$2" == --* ]]; then
                printf 'Missing value for %s\n' "$1" >&2
                exit 2
            fi
            if [[ "$1" == --image ]]; then image=$2; else tag=$2; fi
            shift 2
            ;;
        -h|--help) usage; exit 0 ;;
        *) printf 'Unknown argument: %s\n' "$1" >&2; usage >&2; exit 2 ;;
    esac
done

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
revision=$(git -C "$root" rev-parse HEAD)
tag=${tag:-sha-${revision:0:12}}
build_date=$(date -u +%Y-%m-%dT%H:%M:%SZ)

if command -v podman >/dev/null 2>&1; then
    runtime=podman
    format=(--format docker)
elif command -v docker >/dev/null 2>&1; then
    runtime=docker
    format=()
else
    printf '%s\n' 'Podman or Docker is required to build the image.' >&2
    exit 1
fi

printf 'Building %s:%s with %s\n' "$image" "$tag" "$runtime"
exec "$runtime" build "${format[@]}" \
    --file "$root/.compose/Dockerfile.app" \
    --tag "$image:$tag" \
    --build-arg "VERSION=$tag" \
    --build-arg "REVISION=$revision" \
    --build-arg "BUILD_DATE=$build_date" \
    --build-arg 'SOURCE=https://github.com/vkaylee/6s' \
    "$root"
