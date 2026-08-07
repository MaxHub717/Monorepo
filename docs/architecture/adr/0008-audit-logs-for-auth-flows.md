Title: Add audit logs for auth flows (register, resend, forgot, logout, refresh)

Status: Proposed

Context:
Some auth lifecycle events currently emit outbox events but lack explicit audit logs; consistent audit entries improve traceability and forensics.

Decision:
Instrument `AuthService` to call `AuditService.writeLog()` at key points: registration, verification resend, password reset request/confirm, logout, refresh. Ensure audit payload contains before/after state when applicable.

Files to modify:
- apps/api/src/modules/auth/auth.service.ts
- ensure `AuditModule` is imported into `AuthModule` if not present

Dependencies:
- `AuditService` (existing)
- `OutboxService` emissions (existing)

Acceptance criteria:
- Audit rows are created for the listed events with correct metadata.
- `AuditSubscriber` does not duplicate those entries; avoid double-logging.

Consequences:
- Improved traceability; slight performance cost during critical flows.

Risk level: Low
Estimated effort: 0.5 day
