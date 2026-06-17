-- ============================================================
-- VyVy WorkOS — Notifications table migration
-- Chạy trong Supabase Dashboard > SQL Editor nếu bảng chưa tồn tại
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  actor_id      uuid REFERENCES employees(id) ON DELETE SET NULL,
  type          text NOT NULL,        -- 'task_assigned' | 'step_submitted' | 'step_approved' | 'step_revision' | 'comment_mention' | 'assignment_approval' | 'recurring_reminder'
  title         text NOT NULL,
  body          text,
  task_id       uuid REFERENCES tasks(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  is_read       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for fast unread count per user
CREATE INDEX IF NOT EXISTS notifications_recipient_read_idx ON notifications(recipient_id, is_read);
CREATE INDEX IF NOT EXISTS notifications_created_idx ON notifications(created_at DESC);

-- Row Level Security: each user can only read their own notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own notifications" ON notifications;
CREATE POLICY "Own notifications" ON notifications
  FOR ALL USING (
    recipient_id = (
      SELECT id FROM employees WHERE auth_user_id = auth.uid() LIMIT 1
    )
  );
