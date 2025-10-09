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
insert into public.tasks (title, description, status, priority_bucket, due_date, project, owner_id, assignee_id, members_id, is_deleted)
select 'Task 1', 'Onboard new vendor', 'UNASSIGNED', 2, current_date + interval '7 days', 'Q3 Launch', u_director.user_id, null, array[]::integer[], false
from (select user_id from public.users where email = 'director@example.com') u_director,
     (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

-- Task 2: Owner - Manager, Members - Staff (Assigned to Staff)
insert into public.tasks (title, description, status, priority_bucket, due_date, project, owner_id, assignee_id, members_id, is_deleted)
select 'Task 2', 'Prepare launch checklist', 'ONGOING', 5, current_date + interval '14 days', 'Q3 Launch', u_manager.user_id, u_staff.user_id, array[u_staff.user_id]::integer[], false
from (select user_id from public.users where email = 'manager@example.com') u_manager,
     (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

-- Task 3: Owner - Manager (Unassigned)
insert into public.tasks (title, description, status, priority_bucket, due_date, project, owner_id, assignee_id, members_id, is_deleted)
select 'Task 3', 'Budget review', 'UNASSIGNED', 8, current_date + interval '21 days', 'Finance', u_manager.user_id, null, array[]::integer[], false
from (select user_id from public.users where email = 'manager@example.com') u_manager
on conflict do nothing;

-- Task 4: Owner - Staff (Unassigned)
insert into public.tasks (title, description, status, priority_bucket, due_date, project, owner_id, assignee_id, members_id)
select 'Task 4', 'Inventory reconciliation', 'UNASSIGNED', 5, current_date + interval '5 days', 'Ops', u_staff.user_id, null, array[]::integer[]
from (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

-- Task 5: Owner - Manager, Member - Staff (Assigned to Staff)
insert into public.tasks (title, description, status, priority_bucket, due_date, project, owner_id, assignee_id, members_id)
select 'Task 5', 'Schedule team training', 'ONGOING', 2, current_date + interval '10 days', 'HR', u_manager.user_id, u_staff.user_id, array[u_staff.user_id]::integer[]
from (select user_id from public.users where email = 'manager@example.com') u_manager,
     (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

-- Task 6: Owner - Director (Unassigned)
insert into public.tasks (title, description, status, priority_bucket, due_date, project, owner_id, assignee_id, members_id)
select 'Task 6', 'Board report draft', 'UNASSIGNED', 2, current_date + interval '3 days', 'Exec', u_director.user_id, null, array[]::integer[]
from (select user_id from public.users where email = 'director@example.com') u_director
on conflict do nothing;


insert into public.tasks (title, description, status, priority_bucket, due_date, project, owner_id, assignee_id, members_id)
select 'Alpha Epic', 'Top-level epic for Alpha initiative', 'ONGOING', 2, current_date + interval '30 days', 'Alpha', u_manager.user_id, null, array[]::integer[]
from (select user_id from public.users where email = 'manager@example.com') u_manager
on conflict do nothing;

insert into public.tasks (title, description, status, priority_bucket, due_date, project, owner_id, assignee_id, members_id, parent_task_id)
select 'Alpha Phase 1', 'Phase 1 scope and planning', 'ONGOING', 5, current_date + interval '20 days', 'Alpha', u_manager.user_id, null, array[]::integer[], t_root.task_id
from (select user_id from public.users where email = 'manager@example.com') u_manager,
     (select task_id from public.tasks where title = 'Alpha Epic' order by task_id desc limit 1) t_root
on conflict do nothing;

insert into public.tasks (title, description, status, priority_bucket, due_date, project, owner_id, assignee_id, members_id, parent_task_id)
select 'Alpha Phase 1 - Setup', 'Repo and environment setup', 'UNASSIGNED', 5, current_date + interval '10 days', 'Alpha', u_staff.user_id, null, array[]::integer[], t_p1.task_id
from (select user_id from public.users where email = 'staff@example.com') u_staff,
     (select task_id from public.tasks where title = 'Alpha Phase 1' order by task_id desc limit 1) t_p1
on conflict do nothing;

insert into public.tasks (title, description, status, priority_bucket, due_date, project, owner_id, assignee_id, members_id, parent_task_id)
select 'Alpha Phase 2', 'Execution milestone', 'UNASSIGNED', 5, current_date + interval '25 days', 'Alpha', u_manager.user_id, null, array[]::integer[], t_root.task_id
from (select user_id from public.users where email = 'manager@example.com') u_manager,
     (select task_id from public.tasks where title = 'Alpha Epic' order by task_id desc limit 1) t_root
on conflict do nothing;

insert into public.tasks (title, description, status, priority_bucket, due_date, project, owner_id, assignee_id, members_id, parent_task_id)
select 'Alpha Phase 2 - QA', 'Quality assurance and UAT', 'UNASSIGNED', 8, current_date + interval '22 days', 'Alpha', u_staff.user_id, null, array[]::integer[], t_p2.task_id
from (select user_id from public.users where email = 'staff@example.com') u_staff,
     (select task_id from public.tasks where title = 'Alpha Phase 2' order by task_id desc limit 1) t_p2
on conflict do nothing;

insert into public.tasks (title, description, status, priority_bucket, due_date, project, owner_id, assignee_id, members_id)
select 'Task 7', 'Vendor follow-up calls', 'ONGOING', 5, current_date + interval '8 days', 'Q3 Launch', u_staff.user_id, u_staff.user_id, array[]::integer[]
from (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

insert into public.tasks (title, description, status, priority_bucket, due_date, project, owner_id, assignee_id, members_id)
select 'Task 8', 'Marketing asset review', 'UNASSIGNED', 8, current_date + interval '12 days', 'Marketing', u_manager.user_id, null, array[]::integer[]
from (select user_id from public.users where email = 'manager@example.com') u_manager
on conflict do nothing;

insert into public.tasks (title, description, status, priority_bucket, due_date, project, owner_id, assignee_id, members_id)
select 'Task 9', 'Security audit prep', 'ONGOING', 2, current_date + interval '15 days', 'Security', u_director.user_id, u_manager.user_id, array[u_manager.user_id, u_staff.user_id]::integer[]
from (select user_id from public.users where email = 'director@example.com') u_director,
     (select user_id from public.users where email = 'manager@example.com') u_manager,
     (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

insert into public.tasks (title, description, status, priority_bucket, due_date, project, owner_id, assignee_id, members_id)
select 'Task 10', 'Office supply order', 'COMPLETED', 8, current_date - interval '1 days', 'Ops', u_staff.user_id, u_staff.user_id, array[]::integer[]
from (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

insert into public.tasks (title, description, status, priority_bucket, due_date, project, owner_id, assignee_id, members_id)
select 'Task 11', 'Client feedback synthesis', 'ONGOING', 5, current_date + interval '9 days', 'Q3 Launch', u_manager.user_id, u_manager.user_id, array[]::integer[]
from (select user_id from public.users where email = 'manager@example.com') u_manager
on conflict do nothing;

insert into public.tasks (title, description, status, priority_bucket, due_date, project, owner_id, assignee_id, members_id)
select 'Task 12', 'Policy update review', 'UNASSIGNED', 5, current_date + interval '18 days', 'Compliance', u_director.user_id, null, array[]::integer[]
from (select user_id from public.users where email = 'director@example.com') u_director
on conflict do nothing;

insert into public.tasks (title, description, status, priority_bucket, due_date, project, owner_id, assignee_id, members_id)
select 'Task 13', 'Data cleanup', 'UNASSIGNED', 8, current_date + interval '20 days', 'Data', u_staff.user_id, null, array[]::integer[]
from (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

insert into public.tasks (title, description, status, priority_bucket, due_date, project, owner_id, assignee_id, members_id)
select 'Task 14', 'Partnership proposal', 'UNASSIGNED', 2, current_date + interval '11 days', 'BizDev', u_manager.user_id, null, array[]::integer[]
from (select user_id from public.users where email = 'manager@example.com') u_manager
on conflict do nothing;

insert into public.tasks (title, description, status, priority_bucket, due_date, project, owner_id, assignee_id, members_id)
select 'Task 15', 'Annual plan outline', 'ONGOING', 5, current_date + interval '25 days', 'Planning', u_director.user_id, u_director.user_id, array[]::integer[]
from (select user_id from public.users where email = 'director@example.com') u_director
on conflict do nothing;

insert into public.tasks (title, description, status, priority_bucket, due_date, project, owner_id, assignee_id, members_id, is_deleted)
select 'Simple Standalone Task to be deleted', 'No subtasks, easy to delete', 'UNASSIGNED', 8, current_date + interval '3 days', 'Simple', u_staff.user_id, null, array[]::integer[], false
from (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

-- PROJECTS (simplified with tasks column and owner_id)
insert into public.projects (name, description, end_date, owner_id)
select 'Q3 Launch', 'Major product launch for Q3', current_date + interval '90 days', u_director.user_id
from (select user_id from public.users where email = 'director@example.com') u_director
on conflict do nothing;

insert into public.projects (name, description, end_date, owner_id)
select 'Alpha', 'Alpha initiative project', current_date + interval '120 days', u_manager.user_id
from (select user_id from public.users where email = 'manager@example.com') u_manager
on conflict do nothing;

insert into public.projects (name, description, end_date, owner_id)
select 'Marketing Campaign', 'Marketing workstream for Q3 launch', current_date + interval '60 days', u_manager.user_id
from (select user_id from public.users where email = 'manager@example.com') u_manager
on conflict do nothing;

insert into public.projects (name, description, end_date, owner_id)
select 'Finance Review', 'Budget and financial planning', current_date + interval '45 days', u_director.user_id
from (select user_id from public.users where email = 'director@example.com') u_director
on conflict do nothing;

insert into public.projects (name, description, end_date, owner_id)
select 'HR Training', 'Team training and development', current_date + interval '30 days', u_manager.user_id
from (select user_id from public.users where email = 'manager@example.com') u_manager
on conflict do nothing;

insert into public.projects (name, description, end_date, owner_id)
select 'Operations', 'Operational tasks and management', current_date + interval '60 days', u_staff.user_id
from (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

insert into public.projects (name, description, end_date, owner_id)
select 'Executive', 'Executive level tasks', current_date + interval '30 days', u_director.user_id
from (select user_id from public.users where email = 'director@example.com') u_director
on conflict do nothing;

insert into public.projects (name, description, end_date, owner_id)
select 'Security', 'Security and compliance tasks', current_date + interval '75 days', u_director.user_id
from (select user_id from public.users where email = 'director@example.com') u_director
on conflict do nothing;

insert into public.projects (name, description, end_date, owner_id)
select 'Business Development', 'Partnership and business development', current_date + interval '45 days', u_manager.user_id
from (select user_id from public.users where email = 'manager@example.com') u_manager
on conflict do nothing;

insert into public.projects (name, description, end_date, owner_id)
select 'Planning', 'Strategic planning initiatives', current_date + interval '120 days', u_director.user_id
from (select user_id from public.users where email = 'director@example.com') u_director
on conflict do nothing;

insert into public.projects (name, description, end_date, owner_id)
select 'Data Management', 'Data cleanup and management', current_date + interval '90 days', u_staff.user_id
from (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

insert into public.projects (name, description, end_date, owner_id)
select 'Compliance', 'Policy and compliance tasks', current_date + interval '60 days', u_director.user_id
from (select user_id from public.users where email = 'director@example.com') u_director
on conflict do nothing;

insert into public.projects (name, description, end_date, owner_id)
select 'Simple Projects', 'Miscellaneous simple tasks', current_date + interval '30 days', u_staff.user_id
from (select user_id from public.users where email = 'staff@example.com') u_staff
on conflict do nothing;

-- Update existing tasks to link to projects
update public.tasks set project_id = (select project_id from public.projects where name = 'Q3 Launch' limit 1) where project = 'Q3 Launch';
update public.tasks set project_id = (select project_id from public.projects where name = 'Alpha' limit 1) where project = 'Alpha';
update public.tasks set project_id = (select project_id from public.projects where name = 'Marketing Campaign' limit 1) where project = 'Marketing';
update public.tasks set project_id = (select project_id from public.projects where name = 'Finance Review' limit 1) where project = 'Finance';
update public.tasks set project_id = (select project_id from public.projects where name = 'HR Training' limit 1) where project = 'HR';
update public.tasks set project_id = (select project_id from public.projects where name = 'Operations' limit 1) where project = 'Ops';
update public.tasks set project_id = (select project_id from public.projects where name = 'Executive' limit 1) where project = 'Exec';
update public.tasks set project_id = (select project_id from public.projects where name = 'Security' limit 1) where project = 'Security';
update public.tasks set project_id = (select project_id from public.projects where name = 'Business Development' limit 1) where project = 'BizDev';
update public.tasks set project_id = (select project_id from public.projects where name = 'Planning' limit 1) where project = 'Planning';
update public.tasks set project_id = (select project_id from public.projects where name = 'Data Management' limit 1) where project = 'Data';
update public.tasks set project_id = (select project_id from public.projects where name = 'Compliance' limit 1) where project = 'Compliance';
update public.tasks set project_id = (select project_id from public.projects where name = 'Simple Projects' limit 1) where project = 'Simple';

-- Update projects table to include task IDs in the tasks column (FIXED VERSION)
UPDATE public.projects 
SET tasks = COALESCE(
  (
    SELECT array_agg(task_id ORDER BY task_id) 
    FROM public.tasks 
    WHERE public.tasks.project_id = public.projects.project_id
    AND is_deleted = false
  ), 
  '{}'::integer[]
),
updated_at = now()
WHERE project_id IN (
  SELECT DISTINCT project_id 
  FROM public.tasks 
  WHERE project_id IS NOT NULL
);

-- Also ensure projects without tasks have empty arrays
UPDATE public.projects 
SET tasks = '{}'::integer[],
    updated_at = now()
WHERE tasks IS NULL;

-- Update existing projects to include owner as member and sync task members (FIXED)
UPDATE public.projects 
SET members = COALESCE(
  (
    SELECT ARRAY(
      SELECT DISTINCT member_id
      FROM (
        SELECT public.projects.owner_id as member_id
        UNION
        SELECT DISTINCT public.tasks.owner_id as member_id
        FROM public.tasks 
        WHERE public.tasks.project_id = public.projects.project_id
        AND public.tasks.is_deleted = false
        AND public.tasks.owner_id IS NOT NULL
        UNION
        SELECT DISTINCT public.tasks.assignee_id as member_id
        FROM public.tasks 
        WHERE public.tasks.project_id = public.projects.project_id
        AND public.tasks.is_deleted = false
        AND public.tasks.assignee_id IS NOT NULL
        UNION
        SELECT DISTINCT unnest(public.tasks.members_id) as member_id
        FROM public.tasks 
        WHERE public.tasks.project_id = public.projects.project_id
        AND public.tasks.is_deleted = false
        AND public.tasks.members_id IS NOT NULL
        AND array_length(public.tasks.members_id, 1) > 0
      ) AS all_members
      WHERE member_id IS NOT NULL
    )
  ), 
  ARRAY[public.projects.owner_id] -- If no tasks, just include owner
),
updated_at = now()
WHERE project_id IN (
  SELECT DISTINCT project_id 
  FROM public.projects
);