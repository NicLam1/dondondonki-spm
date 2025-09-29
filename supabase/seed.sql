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
-- Task 1: Owner - Director, Member - Staff
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, members_id, is_deleted)
select 'Task 1', 'Onboard new vendor', 'TO_DO', 'HIGH', current_date + interval '7 days', 'Q3 Launch', u_director.user_id, array[u_staff.user_id]::integer[], false
from (select user_id from public.users where email = 'director@example.com') u_director,
     (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

-- Task 2: Owner - Manager, Members - Staff
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, members_id, is_deleted)
select 'Task 2', 'Prepare launch checklist', 'IN_PROGRESS', 'MEDIUM', current_date + interval '14 days', 'Q3 Launch', u_manager.user_id, array[u_staff.user_id]::integer[], false
from (select user_id from public.users where email = 'manager@example.com') u_manager,
     (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

-- Task 3: Owner - Manager
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, members_id, is_deleted)
select 'Task 3', 'Budget review', 'TO_DO', 'LOW', current_date + interval '21 days', 'Finance', u_manager.user_id, array[]::integer[], false
from (select user_id from public.users where email = 'manager@example.com') u_manager
on conflict do nothing;

-- Additional tasks
-- Task 4: Owner - Staff
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, members_id)
select 'Task 4', 'Inventory reconciliation', 'TO_DO', 'MEDIUM', current_date + interval '5 days', 'Ops', u_staff.user_id, array[]::integer[]
from (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

-- Task 5: Owner - Manager, Member - Staff
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, members_id)
select 'Task 5', 'Schedule team training', 'IN_PROGRESS', 'HIGH', current_date + interval '10 days', 'HR', u_manager.user_id, array[u_staff.user_id]::integer[]
from (select user_id from public.users where email = 'manager@example.com') u_manager,
     (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

-- Task 6: Owner - Director
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, members_id)
select 'Task 6', 'Board report draft', 'TO_DO', 'HIGH', current_date + interval '3 days', 'Exec', u_director.user_id, array[]::integer[]
from (select user_id from public.users where email = 'director@example.com') u_director
on conflict do nothing;


-- Hierarchical tasks demo (parent/child chains)
-- Root epic
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, members_id)
select 'Alpha Epic', 'Top-level epic for Alpha initiative', 'IN_PROGRESS', 'HIGH', current_date + interval '30 days', 'Alpha', u_manager.user_id, array[]::integer[]
from (select user_id from public.users where email = 'manager@example.com') u_manager
on conflict do nothing;

-- Phase 1 under root epic
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, members_id, parent_task_id)
select 'Alpha Phase 1', 'Phase 1 scope and planning', 'IN_PROGRESS', 'MEDIUM', current_date + interval '20 days', 'Alpha', u_manager.user_id, array[]::integer[], t_root.task_id
from (select user_id from public.users where email = 'manager@example.com') u_manager,
     (select task_id from public.tasks where title = 'Alpha Epic' order by task_id desc limit 1) t_root
on conflict do nothing;

-- Setup task under Phase 1
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, members_id, parent_task_id)
select 'Alpha Phase 1 - Setup', 'Repo and environment setup', 'TO_DO', 'MEDIUM', current_date + interval '10 days', 'Alpha', u_staff.user_id, array[]::integer[], t_p1.task_id
from (select user_id from public.users where email = 'staff@example.com') u_staff,
     (select task_id from public.tasks where title = 'Alpha Phase 1' order by task_id desc limit 1) t_p1
on conflict do nothing;

-- Phase 2 under root epic
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, members_id, parent_task_id)
select 'Alpha Phase 2', 'Execution milestone', 'TO_DO', 'MEDIUM', current_date + interval '25 days', 'Alpha', u_manager.user_id, array[]::integer[], t_root.task_id
from (select user_id from public.users where email = 'manager@example.com') u_manager,
     (select task_id from public.tasks where title = 'Alpha Epic' order by task_id desc limit 1) t_root
on conflict do nothing;

-- QA task under Phase 2
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, members_id, parent_task_id)
select 'Alpha Phase 2 - QA', 'Quality assurance and UAT', 'TO_DO', 'LOW', current_date + interval '22 days', 'Alpha', u_staff.user_id, array[]::integer[], t_p2.task_id
from (select user_id from public.users where email = 'staff@example.com') u_staff,
     (select task_id from public.tasks where title = 'Alpha Phase 2' order by task_id desc limit 1) t_p2
on conflict do nothing;

-- Task 7: Owner - Staff
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, members_id)
select 'Task 7', 'Vendor follow-up calls', 'IN_PROGRESS', 'MEDIUM', current_date + interval '8 days', 'Q3 Launch', u_staff.user_id, array[]::integer[]
from (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

-- Task 8: Owner - Manager
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, members_id)
select 'Task 8', 'Marketing asset review', 'TO_DO', 'LOW', current_date + interval '12 days', 'Marketing', u_manager.user_id, array[]::integer[]
from (select user_id from public.users where email = 'manager@example.com') u_manager
on conflict do nothing;

-- Task 9: Owner - Director, Members - Manager, Staff
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, members_id)
select 'Task 9', 'Security audit prep', 'IN_PROGRESS', 'HIGH', current_date + interval '15 days', 'Security', u_director.user_id, array[u_manager.user_id, u_staff.user_id]::integer[]
from (select user_id from public.users where email = 'director@example.com') u_director,
     (select user_id from public.users where email = 'manager@example.com') u_manager,
     (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

-- Task 10: Owner - Staff
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, members_id)
select 'Task 10', 'Office supply order', 'DONE', 'LOW', current_date - interval '1 days', 'Ops', u_staff.user_id, array[]::integer[]
from (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

-- Task 11: Owner - Manager
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, members_id)
select 'Task 11', 'Client feedback synthesis', 'IN_PROGRESS', 'MEDIUM', current_date + interval '9 days', 'Q3 Launch', u_manager.user_id, array[]::integer[]
from (select user_id from public.users where email = 'manager@example.com') u_manager
on conflict do nothing;

-- Task 12: Owner - Director
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, members_id)
select 'Task 12', 'Policy update review', 'TO_DO', 'MEDIUM', current_date + interval '18 days', 'Compliance', u_director.user_id, array[]::integer[]
from (select user_id from public.users where email = 'director@example.com') u_director
on conflict do nothing;

-- Task 13: Owner - Staff
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, members_id)
select 'Task 13', 'Data cleanup', 'TO_DO', 'LOW', current_date + interval '20 days', 'Data', u_staff.user_id, array[]::integer[]
from (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

-- Task 14: Owner - Manager
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, members_id)
select 'Task 14', 'Partnership proposal', 'TO_DO', 'HIGH', current_date + interval '11 days', 'BizDev', u_manager.user_id, array[]::integer[]
from (select user_id from public.users where email = 'manager@example.com') u_manager
on conflict do nothing;

-- Task 15: Owner - Director
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, members_id)
select 'Task 15', 'Annual plan outline', 'IN_PROGRESS', 'MEDIUM', current_date + interval '25 days', 'Planning', u_director.user_id, array[]::integer[]
from (select user_id from public.users where email = 'director@example.com') u_director
on conflict do nothing;

-- 6: Task with no subtasks (simple delete case)
insert into public.tasks (title, description, status, priority, due_date, project, owner_id, members_id, is_deleted)
select 'Simple Standalone Task to be deleted', 'No subtasks, easy to delete', 'TO_DO', 'LOW', current_date + interval '3 days', 'Simple', u_staff.user_id, array[]::integer[], false
from (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;