Tech Stack

- Frontend: React.js, Material UI, React Query
- Backend: Node.js, Express.js, JWT + Passport.js
- Database: Supabase (PostgreSQL)
- Notifications: BullMQ (in-app) (USE UPSTASH https://upstash.com/ REDIS), Nodemailer (email)
- Reporting: pdfkit, exceljs
- Hosting: Vercel (frontend), Heroku (backend), Supabase (DB)

1. User Authorisation and Authentication
Tech Used:


  - Node.js + Express.js → REST API for login, signup, role-based endpoints.

  - JWT (JSON Web Token) → issue tokens for authenticated sessions.

  - Passport.js → middleware to handle password-based login, attach roles (staff/manager/director/HR).

  - Supabase (PostgreSQL) → Users table with hashed passwords & roles.

User Flow:


  1. User logs in with email + password.

  2. Backend checks credentials, issues JWT containing role.

  3. Role determines access (managers can assign tasks, HR can generate reports, etc.).

  4. Protected routes (Express middleware) check JWT and enforce permissions.

2. Task Management
Tech Used:


  - React.js + Material UI → UI to create, update, and view tasks/subtasks.

  - React Query → fetch tasks from backend & auto-refresh when updated.

  - Node.js + Express.js → API routes for task CRUD operations (createTask, updateTask, deleteTask, assignTask).

  - Supabase (PostgreSQL) → Database tables for Tasks, SubTasks, UsersTasks (many-to-many for collaborators).

Core Features:


  - Staff can create their own tasks.

  - Managers and above can assign tasks to staff (reassign owner_id).

  - Task details: deadline, notes, status (To Do, In Progress, Done).

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

  - BullMQ (job scheduler) → checks deadlines, sends reminders before/after task due. (USE UPSTASH https://upstash.com/ REDIS)

Feature Example:


  - Staff see their own deadlines in a personal timeline.

  - Team members in the same project can see the project schedule (who is busy, pending tasks, overdue tasks).

5. Notification System (In-app + Email)
Tech Used:


  - BullMQ → queue system for sending notifications (reminders, mentions, updates) (USE UPSTASH https://upstash.com/ REDIS).

  - Express.js → API to trigger notifications.

  - In-app: Store unread notifications in a Notifications table (users fetch via React Query, real-time refresh).

  - Email: Nodemailer (simpler than SendGrid/AWS SES — fast setup for school projects).

Feature Example:


  - Due date approaching → BullMQ job pushes notification → user sees in-app + optional email.

  - Someone comments on a task → Mentioned user gets notified.

6. Report Generation and Exporting
Tech Used:


  - Express.js → API to generate reports on project status using SQL queries.

  - pdfkit → generate PDF snapshot report (completed vs ongoing).

  - exceljs → generate Excel reports for project planning (“Gantt-like schedule”).

Usage:


  - Managers / HR can click “Export Report”.

  - Backend pulls all project + task data from Supabase.

  - Generate PDF (formal report) OR Excel sheet (editable planning doc).