# Setup

1. cd frontend; npm install
2. cd backend; npm install

# Database (Supabase/Postgres)

- Run the schema to create base tables and activity logs:
  - Open `supabase/schema.sql` in the Supabase SQL editor and run it, or apply via CLI.

- Seed sample data (optional):
  - Run `supabase/seed.sql` (adjust emails/ids as needed).

# Activity Log

- Table: `public.task_activity_logs`
  - Columns: `log_id`, `task_id`, `author_id`, `type`, `summary`, `metadata`, `created_at`
  - Indexes for frequent queries: `(task_id, created_at)`, `author_id`, `type`

- Backend instrumentation:
  - Task creation, subtask creation → `task_created` (+ `reassigned` if assignee set)
  - Status changes → `status_changed`
  - Field edits (`title`, `description`, `project`, `priority_bucket`, `due_date`, `owner_id`, `members_id`, `parent_task_id`) → `field_edited`
  - Assignment changes → `reassigned`
  - Soft delete/restore → `task_deleted` / `task_restored`
  - Comments → `comment_added`

- API endpoints:
  - GET `/api/tasks/:id/activity?acting_user_id=...&limit=50&offset=0`
  - POST `/api/tasks/:id/comments` with JSON body `{ acting_user_id, comment }`

# Frontend

- The task dialog in `frontend/src/pages/TasksPage.js` shows the ActivityLog and refreshes it after changes.
- The `ActivityLog` component is in `frontend/src/components/ActivityLog.js` and supports posting comments.