Tech Stack

- Frontend: React.js, Material UI, React Query
- Backend: Node.js, Express.js
- Database: Supabase (PostgreSQL)
- Notifications: In-app via Supabase tables, Nodemailer (email)
- Reporting: pdfkit (PDF export)
- Hosting: Vercel (frontend + serverless API) or long-running host (Heroku/Render), Supabase (DB)

1. User Authorisation and Authentication
Tech Used:


  - Node.js + Express.js → REST API for login, signup, role-based endpoints.

  - Supabase Auth → hosted authentication; sessions handled by Supabase.

  - Supabase (PostgreSQL) → Users table with hashed passwords & roles.

User Flow:


  1. User logs in with email + password.

  2. Backend delegates auth to Supabase and fetches profile/role from DB.

  3. Role determines access (managers can assign tasks, HR can generate reports, etc.).

  4. Protected routes enforce permissions using `acting_user_id` and role lookups.

2. Task Management
Tech Used:


  - React.js + Material UI → UI to create, update, and view tasks/subtasks.

  - React Query → fetch tasks from backend & auto-refresh when updated.

  - Node.js + Express.js → API routes for task CRUD operations (createTask, updateTask, deleteTask, assignTask).

  - Supabase (PostgreSQL) → Database tables for Tasks, SubTasks, UsersTasks (many-to-many for collaborators).

Core Features:


  - Staff can create their own tasks.

  - Managers and above can assign tasks to staff (reassign owner_id).

  - Task details: deadline, notes, status (UNASSIGNED, ONGOING, UNDER_REVIEW, COMPLETED).

3. Task Grouping and Organisation (Projects)
Tech Used:


  - React.js → Projects dashboard to group related tasks.

  - Supabase (PostgreSQL) → Projects table with reference to Tasks.

  - Node.js + Express.js → APIs to create projects, invite collaborators, attach tasks.

Feature Example:

Project → contains many Tasks → each Task can contain Subtasks.

Collaborators can see all tasks under a project.

4. Deadline and Schedule Tracking
Tech Used:


  - React.js + MUI Calendar/Timeline components → Calendar-style UI to view tasks with deadlines.

  - Supabase DB + Express → Store and fetch due dates.

  - Scheduled checks via Vercel Cron or in-process schedulers → send reminders before/after task due.

Feature Example:


  - Staff see their own deadlines in a personal timeline.

  - Team members in the same project can see the project schedule (who is busy, pending tasks, overdue tasks).

5. Notification System (In-app + Email)
Tech Used:


  - Server-side logic → triggers notifications (reminders, mentions, updates).

  - Express.js → APIs handle events (assignment, status change, mentions).

  - In-app: rows stored in a `notifications` table (frontend fetch; optional real-time if enabled).

  - Email: Nodemailer (SMTP configurable via env).

Feature Example:


  - Due date approaching → scheduled job (Vercel Cron or in-process) sends in-app and/or email per user prefs.

  - Someone comments on a task → Mentioned user gets notified.

6. Report Generation and Exporting
Tech Used:


  - Express.js → API generates reports on project status from Supabase queries.

  - pdfkit → generate PDF snapshot report (completed vs ongoing).

  - (No Excel export in current build.)

Usage:


  - Managers / HR can click “Export Report”.

  - Backend pulls all project + task data from Supabase.

  - Generate PDF (formal report).