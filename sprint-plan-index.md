# Sprint Plan Index

Các sprint được tách để thực hiện độc lập, giảm nhiễu context.

| Sprint | File | Phụ thuộc | Trọng tâm |
|---|---|---|---|
| 1 | `sprint-1-plan.md` | Baseline hiện có | Dữ liệu, auth, readiness, LDAP |
| 2 | `sprint-2-plan.md` | Sprint 1 | RBAC, error state, rollback |
| 3 | `sprint-3-plan.md` | Sprint 2; E2E container có thể chuẩn bị độc lập | i18n, a11y, CI, E2E |

## Cách dùng

Mỗi phiên chỉ nạp một file sprint. Trước khi sửa:

```sh
cat sprint-N-plan.md
./leedevkit doctor
```

Sau khi hoàn thành sprint, cập nhật checkbox, bằng chứng kiểm thử và residual debt trong chính file đó. Không chạy sprint sau nếu gate hoặc dependency của sprint trước chưa đạt.
