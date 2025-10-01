-- Seed initial users and tasks

-- USERS
insert into public.users (email, full_name, role, access_level)
values
  ('staff@example.com', 'Sam Staff', 'STAFF', 0),
  ('manager@example.com', 'Megan Manager', 'MANAGER', 1),
  ('director@example.com', 'Derek Director', 'DIRECTOR', 2)
on conflict (email) do nothing;

-- Capture user_ids for convenience (works in psql; in Supabase run separately or map manually)
-- You can look up the ids via: select user_id, email from public.users;

-- TASKS
-- Task 1: Owner - Director, Member - Staff (Unassigned)
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, assignee_id, members_id, is_deleted)
select 'Task 1', 'Onboard new vendor', 'UNASSIGNED', 'HIGH', current_date + interval '7 days', 'Q3 Launch', u_director.user_id, null, array[]::integer[], false
from (select user_id from public.users where email = 'director@example.com') u_director,
     (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

-- Task 2: Owner - Manager, Members - Staff (Assigned to Staff)
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, assignee_id, members_id, is_deleted)
select 'Task 2', 'Prepare launch checklist', 'ONGOING', 'MEDIUM', current_date + interval '14 days', 'Q3 Launch', u_manager.user_id, u_staff.user_id, array[u_staff.user_id]::integer[], false
from (select user_id from public.users where email = 'manager@example.com') u_manager,
     (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

-- Task 3: Owner - Manager (Unassigned)
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, assignee_id, members_id, is_deleted)
select 'Task 3', 'Budget review', 'UNASSIGNED', 'LOW', current_date + interval '21 days', 'Finance', u_manager.user_id, null, array[]::integer[], false
from (select user_id from public.users where email = 'manager@example.com') u_manager
on conflict do nothing;

-- Task 4: Owner - Staff (Unassigned)
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, assignee_id, members_id)
select 'Task 4', 'Inventory reconciliation', 'UNASSIGNED', 'MEDIUM', current_date + interval '5 days', 'Ops', u_staff.user_id, null, array[]::integer[]
from (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

-- Task 5: Owner - Manager, Member - Staff (Assigned to Staff)
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, assignee_id, members_id)
select 'Task 5', 'Schedule team training', 'ONGOING', 'HIGH', current_date + interval '10 days', 'HR', u_manager.user_id, u_staff.user_id, array[u_staff.user_id]::integer[]
from (select user_id from public.users where email = 'manager@example.com') u_manager,
     (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

-- Task 6: Owner - Director (Unassigned)
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, assignee_id, members_id)
select 'Task 6', 'Board report draft', 'UNASSIGNED', 'HIGH', current_date + interval '3 days', 'Exec', u_director.user_id, null, array[]::integer[]
from (select user_id from public.users where email = 'director@example.com') u_director
on conflict do nothing;


insert into public.tasks (title, description, status, priority, due_date, project, owner_id, assignee_id, members_id)
select 'Alpha Epic', 'Top-level epic for Alpha initiative', 'ONGOING', 'HIGH', current_date + interval '30 days', 'Alpha', u_manager.user_id, null, array[]::integer[]
from (select user_id from public.users where email = 'manager@example.com') u_manager
on conflict do nothing;

insert into public.tasks (title, description, status, priority, due_date, project, owner_id, assignee_id, members_id, parent_task_id)
select 'Alpha Phase 1', 'Phase 1 scope and planning', 'ONGOING', 'MEDIUM', current_date + interval '20 days', 'Alpha', u_manager.user_id, null, array[]::integer[], t_root.task_id
from (select user_id from public.users where email = 'manager@example.com') u_manager,
     (select task_id from public.tasks where title = 'Alpha Epic' order by task_id desc limit 1) t_root
on conflict do nothing;

insert into public.tasks (title, description, status, priority, due_date, project, owner_id, assignee_id, members_id, parent_task_id)
select 'Alpha Phase 1 - Setup', 'Repo and environment setup', 'UNASSIGNED', 'MEDIUM', current_date + interval '10 days', 'Alpha', u_staff.user_id, null, array[]::integer[], t_p1.task_id
from (select user_id from public.users where email = 'staff@example.com') u_staff,
     (select task_id from public.tasks where title = 'Alpha Phase 1' order by task_id desc limit 1) t_p1
on conflict do nothing;

insert into public.tasks (title, description, status, priority, due_date, project, owner_id, assignee_id, members_id, parent_task_id)
select 'Alpha Phase 2', 'Execution milestone', 'UNASSIGNED', 'MEDIUM', current_date + interval '25 days', 'Alpha', u_manager.user_id, null, array[]::integer[], t_root.task_id
from (select user_id from public.users where email = 'manager@example.com') u_manager,
     (select task_id from public.tasks where title = 'Alpha Epic' order by task_id desc limit 1) t_root
on conflict do nothing;

insert into public.tasks (title, description, status, priority, due_date, project, owner_id, assignee_id, members_id, parent_task_id)
select 'Alpha Phase 2 - QA', 'Quality assurance and UAT', 'UNASSIGNED', 'LOW', current_date + interval '22 days', 'Alpha', u_staff.user_id, null, array[]::integer[], t_p2.task_id
from (select user_id from public.users where email = 'staff@example.com') u_staff,
     (select task_id from public.tasks where title = 'Alpha Phase 2' order by task_id desc limit 1) t_p2
on conflict do nothing;

insert into public.tasks (title, description, status, priority, due_date, project, owner_id, assignee_id, members_id)
select 'Task 7', 'Vendor follow-up calls', 'ONGOING', 'MEDIUM', current_date + interval '8 days', 'Q3 Launch', u_staff.user_id, u_staff.user_id, array[]::integer[]
from (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

insert into public.tasks (title, description, status, priority, due_date, project, owner_id, assignee_id, members_id)
select 'Task 8', 'Marketing asset review', 'UNASSIGNED', 'LOW', current_date + interval '12 days', 'Marketing', u_manager.user_id, null, array[]::integer[]
from (select user_id from public.users where email = 'manager@example.com') u_manager
on conflict do nothing;

insert into public.tasks (title, description, status, priority, due_date, project, owner_id, assignee_id, members_id)
select 'Task 9', 'Security audit prep', 'ONGOING', 'HIGH', current_date + interval '15 days', 'Security', u_director.user_id, u_manager.user_id, array[u_manager.user_id, u_staff.user_id]::integer[]
from (select user_id from public.users where email = 'director@example.com') u_director,
     (select user_id from public.users where email = 'manager@example.com') u_manager,
     (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

insert into public.tasks (title, description, status, priority, due_date, project, owner_id, assignee_id, members_id)
select 'Task 10', 'Office supply order', 'COMPLETED', 'LOW', current_date - interval '1 days', 'Ops', u_staff.user_id, u_staff.user_id, array[]::integer[]
from (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

insert into public.tasks (title, description, status, priority, due_date, project, owner_id, assignee_id, members_id)
select 'Task 11', 'Client feedback synthesis', 'ONGOING', 'MEDIUM', current_date + interval '9 days', 'Q3 Launch', u_manager.user_id, u_manager.user_id, array[]::integer[]
from (select user_id from public.users where email = 'manager@example.com') u_manager
on conflict do nothing;

insert into public.tasks (title, description, status, priority, due_date, project, owner_id, assignee_id, members_id)
select 'Task 12', 'Policy update review', 'UNASSIGNED', 'MEDIUM', current_date + interval '18 days', 'Compliance', u_director.user_id, null, array[]::integer[]
from (select user_id from public.users where email = 'director@example.com') u_director
on conflict do nothing;

insert into public.tasks (title, description, status, priority, due_date, project, owner_id, assignee_id, members_id)
select 'Task 13', 'Data cleanup', 'UNASSIGNED', 'LOW', current_date + interval '20 days', 'Data', u_staff.user_id, null, array[]::integer[]
from (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

insert into public.tasks (title, description, status, priority, due_date, project, owner_id, assignee_id, members_id)
select 'Task 14', 'Partnership proposal', 'UNASSIGNED', 'HIGH', current_date + interval '11 days', 'BizDev', u_manager.user_id, null, array[]::integer[]
from (select user_id from public.users where email = 'manager@example.com') u_manager
on conflict do nothing;

insert into public.tasks (title, description, status, priority, due_date, project, owner_id, assignee_id, members_id)
select 'Task 15', 'Annual plan outline', 'ONGOING', 'MEDIUM', current_date + interval '25 days', 'Planning', u_director.user_id, u_director.user_id, array[]::integer[]
from (select user_id from public.users where email = 'director@example.com') u_director
on conflict do nothing;

insert into public.tasks (title, description, status, priority, due_date, project, owner_id, assignee_id, members_id, is_deleted)
select 'Simple Standalone Task to be deleted', 'No subtasks, easy to delete', 'UNASSIGNED', 'LOW', current_date + interval '3 days', 'Simple', u_staff.user_id, null, array[]::integer[], false
from (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;