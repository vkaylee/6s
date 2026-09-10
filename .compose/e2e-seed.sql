INSERT INTO locations (code, name_vi, name_zh, name_en, qr_code, site_id)
VALUES ('E2E_LINE', 'E2E line', 'E2E line', 'E2E line', 'E2E_LINE_QR', (SELECT id FROM sites WHERE code = 'DEFAULT'))
ON CONFLICT (code) DO UPDATE SET is_active = TRUE;

INSERT INTO locations (code, name_vi, name_zh, name_en, qr_code, site_id)
VALUES ('E2E_OTHER_LINE', 'E2E other line', 'E2E other line', 'E2E other line', 'E2E_OTHER_LINE_QR', (SELECT id FROM sites WHERE code = 'DEFAULT'))
ON CONFLICT (code) DO UPDATE SET is_active = TRUE;

INSERT INTO users (username, password_hash, auth_source, full_name, email, role, assigned_location_code, site_id, is_active)
VALUES ('e2e-admin', '$argon2id$v=19$m=65536,t=3,p=2$uPQQpRuZBJiylfeR6YqkwQ$96RMV4CsZJSOCwn+YNmDmhCCUk8sVYwJzyK/ja8r0cw', 'LOCAL', 'E2E Admin', 'e2e-admin@example.invalid', 'ADMIN', 'E2E_LINE', (SELECT id FROM sites WHERE code = 'DEFAULT'), TRUE)
ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, assigned_location_code = EXCLUDED.assigned_location_code, site_id = EXCLUDED.site_id, is_active = TRUE;

INSERT INTO users (username, password_hash, auth_source, full_name, email, role, assigned_location_code, site_id, is_active)
VALUES ('e2e-worker', '$argon2id$v=19$m=65536,t=3,p=2$nhzmT6fDUWPJXUCQoR3rJg$DJk6BoKmMQx5CS2v3TUg4OfInmilDa9mwxv0AppmmT8', 'LOCAL', 'E2E Worker', 'e2e-worker@example.invalid', 'USER', 'E2E_LINE', (SELECT id FROM sites WHERE code = 'DEFAULT'), TRUE)
ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, assigned_location_code = EXCLUDED.assigned_location_code, site_id = EXCLUDED.site_id, is_active = TRUE;
