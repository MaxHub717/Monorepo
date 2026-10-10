ALTER TABLE "notifications"
  ADD COLUMN "event_type" TEXT,
  ADD COLUMN "event_key" TEXT,
  ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'NORMAL';

CREATE UNIQUE INDEX "notifications_event_key_key" ON "notifications"("event_key");

CREATE TABLE "notification_preferences" (
  "user_id" UUID NOT NULL,
  "competition_enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
