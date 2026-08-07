Title: Implement notification subscribers mapping domain events to `NotificationService`

Status: Proposed

Context:
`NotificationService` exists but no subscribers convert outbox/domain events into user notifications.

Decision:
Create `notification.subscriber.ts` to subscribe to domain events and call `NotificationService.createNotification` with templated messages. Register subscriber in `NotificationModule`.

Files to modify/add:
- apps/api/src/modules/notification/notification.subscriber.ts (new)
- apps/api/src/modules/notification/notification.module.ts (register subscriber)
- templates/config file or mapping constants

Dependencies:
- `OutboxDispatcher` and `EventModule` event names
- `NotificationService`

Acceptance criteria:
- Events such as `club.application.approved`, `match.result.confirmed`, `user.registered` create notifications for relevant users.
- `GET /notifications` shows created notifications.

Consequences:
- Enables UX notifications; templates may be expanded later.

Risk level: Low
Estimated effort: 1–2 days
