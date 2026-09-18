-- Migration: 000021_remove_asset_manage_permission.up.sql
-- `asset:manage` was seeded by 000020 but never enforced by any route, client
-- capability or Go constant. Asset administration is gated by `masterdata:manage`,
-- so the row only produced a phantom entry in the permission editor.
DELETE FROM role_permissions WHERE permission_code = 'asset:manage';
DELETE FROM permissions WHERE code = 'asset:manage';
