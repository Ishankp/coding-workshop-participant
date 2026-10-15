-- Seed data for local development and testing
-- Run after schema.sql:
--   psql -h 172.17.0.1 -U postgres -d postgres -f reset.sql -f schema.sql -f seed.sql
--
-- All seeded users share the password: Password123!
-- Hashes are bcrypt cost 12 (pgcrypto), compatible with Python's bcrypt.checkpw()
--
-- What the data shows (dates are relative to an "as of" of mid October 2026):
--   Project 1  Customer Portal Redesign  active, under budget; Maria's team
--   Project 2  Data Warehouse Migration  active, projected over budget; David's team
--   Project 3  Mobile App Launch         completed (finished over budget)
--   Project 4  Legacy CRM Integration    archived with an unfinished milestone, nobody on it
--   Project 5  Analytics Platform        active; Lena's team. Exercises the edge cases:
--              a prerequisite that is past due and not complete (so "Dashboards" is
--              held up), a milestone with nobody assigned, a milestone with no dates,
--              an archived milestone, an employee with no salary on file (hours but
--              no cost) and a deactivated account that still has hours logged.
--
-- The backend repository tests and the browser E2E tests rely on the ids and
-- figures of users 1-7, projects 1-4 and milestones 1-7. Add new data after
-- them rather than changing them.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

-- Users: one admin, two managers, four employees
INSERT INTO users (id, email, username, first_name, last_name, role, password_hashed) VALUES
  (1, 'admin@example.com',  'admin',  'Alice',  'Admin',    'admin',    crypt('Password123!', gen_salt('bf', 12))),
  (2, 'maria@example.com',  'maria',  'Maria',  'Gonzalez', 'manager',  crypt('Password123!', gen_salt('bf', 12))),
  (3, 'david@example.com',  'david',  'David',  'Chen',     'manager',  crypt('Password123!', gen_salt('bf', 12))),
  (4, 'priya@example.com',  'priya',  'Priya',  'Patel',    'employee', crypt('Password123!', gen_salt('bf', 12))),
  (5, 'james@example.com',  'james',  'James',  'Smith',    'employee', crypt('Password123!', gen_salt('bf', 12))),
  (6, 'sofia@example.com',  'sofia',  'Sofia',  'Rossi',    'employee', crypt('Password123!', gen_salt('bf', 12))),
  (7, 'kenji@example.com',  'kenji',  'Kenji',  'Tanaka',   'employee', crypt('Password123!', gen_salt('bf', 12))),
  (8, 'lena@example.com',   'lena',   'Lena',   'Fischer',  'manager',  crypt('Password123!', gen_salt('bf', 12))),
  (9, 'omar@example.com',   'omar',   'Omar',   'Haddad',   'employee', crypt('Password123!', gen_salt('bf', 12))),
  (10, 'ava@example.com',   'ava',    'Ava',    'Nguyen',   'employee', crypt('Password123!', gen_salt('bf', 12)));

-- Noah left the company: deactivated by an admin, but his hours are still on the books
INSERT INTO users (id, email, username, first_name, last_name, role, password_hashed, deactivated_at) VALUES
  (11, 'noah@example.com',  'noah',   'Noah',   'Brooks',   'employee', crypt('Password123!', gen_salt('bf', 12)), '2026-10-01 09:00:00');

-- Projects: two active, one completed, one archived.
-- Budgets are sized to the hours seeded below (cost = hours x salary / 2080), so the budget
-- view shows one project under budget (1), one projected over (2) and one that finished over (3).
INSERT INTO projects (id, title, start_date, end_date, budget, archived_at, completed_at) VALUES
  (1, 'Customer Portal Redesign', '2026-07-01', '2026-12-31', 12000.00, NULL, NULL),
  (2, 'Data Warehouse Migration', '2026-09-01', '2027-03-31', 10000.00, NULL, NULL),
  (3, 'Mobile App Launch',        '2026-01-15', '2026-06-30',  4000.00, NULL, '2026-06-28 17:00:00'),
  (4, 'Legacy CRM Integration',   '2025-10-01', '2026-02-28',  9000.00, '2026-03-15 09:00:00', NULL),
  (5, 'Analytics Platform',       '2026-08-01', '2027-01-31', 20000.00, NULL, NULL);

-- Milestones: Discovery, Beta Release and Public Release are completed; Design System and
-- Schema Mapping are in progress; Build & Launch and Data Migration haven't started.
INSERT INTO milestones (id, project_id, title, description, start_date, end_date, completed_at) VALUES
  (1, 1, 'Discovery & Research', 'User interviews and current-state analysis', '2026-07-01', '2026-08-15', '2026-08-14 16:00:00'),
  (2, 1, 'Design System',        'Component library and style guide',          '2026-08-16', '2026-10-15', NULL),
  (3, 1, 'Build & Launch',       'Implement new portal and release',           '2026-10-16', '2026-12-31', NULL),
  (4, 2, 'Schema Mapping',       'Map legacy tables to the new warehouse',     '2026-09-01', '2026-11-30', NULL),
  (5, 2, 'Data Migration',       'Migrate and validate historical data',       '2026-12-01', '2027-03-31', NULL),
  (6, 3, 'Beta Release',         'Release to internal testers',                '2026-01-15', '2026-04-30', '2026-04-28 12:00:00'),
  (7, 3, 'Public Release',       'App store submission and launch',            '2026-05-01', '2026-06-30', '2026-06-28 17:00:00'),
  -- Analytics Platform: Data Pipeline is past its end date and not complete, which holds up Dashboards
  (8, 5, 'Requirements',         'Stakeholder interviews and KPI definitions',  '2026-08-01', '2026-08-31', '2026-08-29 15:00:00'),
  (9, 5, 'Data Pipeline',        'Ingest product events into the warehouse',   '2026-09-01', '2026-10-10', NULL),
  (10, 5, 'Dashboards',          'Executive and team dashboards',               '2026-10-11', '2026-12-15', NULL),
  (11, 5, 'Rollout',             'Training and company-wide launch',            '2027-01-01', '2027-01-31', NULL),
  (12, 5, 'Ideas backlog',       'Improvements collected along the way; not yet scheduled', NULL, NULL, NULL),
  -- Legacy CRM Integration was archived with its second milestone unfinished
  (14, 4, 'API bridge',          'Sync layer between the CRM and the portal',   '2025-10-01', '2025-12-15', '2025-12-12 11:00:00'),
  (15, 4, 'Data sync',           'Nightly two-way sync; abandoned when the project was archived', '2025-12-16', '2026-02-28', NULL);

-- An archived milestone: hidden from employees and left out of progress, still counted in costs
INSERT INTO milestones (id, project_id, title, description, start_date, end_date, completed_at, archived_at) VALUES
  (13, 5, 'Vendor evaluation',   'Compared hosted BI tools; dropped in favour of building in-house', '2026-08-01', '2026-08-20', NULL, '2026-08-21 10:00:00');

-- Dependencies: each project's milestones run in sequence
INSERT INTO milestone_dependencies (milestone_id, depends_on_milestone_id) VALUES
  (2, 1),  -- Design System  depends on Discovery & Research  (project 1)
  (3, 2),  -- Build & Launch depends on Design System         (project 1)
  (5, 4),  -- Data Migration depends on Schema Mapping        (project 2)
  (7, 6),  -- Public Release depends on Beta Release          (project 3)
  (9, 8),  -- Data Pipeline  depends on Requirements          (project 5)
  (10, 9), -- Dashboards     depends on Data Pipeline         (project 5) - held up: pipeline is past due
  (11, 10),-- Rollout        depends on Dashboards            (project 5)
  (15, 14);-- Data sync      depends on API bridge            (project 4)

-- Employees: managers first so manager_id references resolve
INSERT INTO employees (id, user_id, title, salary, manager_id) VALUES
  (1, 2, 'Engineering Manager',  145000.00, NULL),
  (2, 3, 'Data Manager',         140000.00, NULL),
  (3, 4, 'Senior UX Designer',   115000.00, 1),
  (4, 5, 'Frontend Engineer',    105000.00, 1),
  (5, 6, 'Data Engineer',        110000.00, 2),
  (6, 7, 'Backend Engineer',     108000.00, 2),
  (7, 8, 'Analytics Manager',    150000.00, NULL),
  (8, 9, 'Data Analyst',          95000.00, 7),
  (9, 10, 'BI Developer',         NULL,     7),   -- no salary on file: hours count, cost doesn't
  (10, 11, 'Contractor',          90000.00, 7);   -- deactivated account (user 11)

INSERT INTO employee_projects (employee_id, project_id) VALUES
  (1, 1),
  (3, 1),
  (4, 1),
  (6, 1),
  (2, 2),
  (5, 2),
  (6, 2),
  (4, 3),
  (3, 3),
  (7, 5),
  (8, 5),
  (9, 5),
  (10, 5);

-- Milestone assignments, only on projects the employee is a member of.
-- Covers several milestones in one project (priya, james, sofia), milestones across
-- two projects (priya, james, kenji), and a project member with none (maria).
INSERT INTO employee_milestones (employee_id, milestone_id) VALUES
  (3, 2),  -- priya: Design System        (project 1)
  (3, 3),  -- priya: Build & Launch       (project 1)
  (3, 6),  -- priya: Beta Release         (project 3)
  (4, 2),  -- james: Design System        (project 1)
  (4, 6),  -- james: Beta Release         (project 3)
  (4, 7),  -- james: Public Release       (project 3)
  (6, 3),  -- kenji: Build & Launch       (project 1)
  (6, 4),  -- kenji: Schema Mapping       (project 2)
  (2, 4),  -- david: Schema Mapping       (project 2)
  (5, 4),  -- sofia: Schema Mapping       (project 2)
  (5, 5),  -- sofia: Data Migration       (project 2)
  (7, 9),  -- lena:  Data Pipeline        (project 5)
  (8, 8),  -- omar:  Requirements         (project 5)
  (8, 9),  -- omar:  Data Pipeline        (project 5)
  (8, 10), -- omar:  Dashboards           (project 5)
  (9, 9),  -- ava:   Data Pipeline        (project 5)
  (9, 10), -- ava:   Dashboards           (project 5)
  (10, 8); -- noah:  Requirements         (project 5)  Rollout (11) has nobody yet

-- Time log: one row per day worked. Milestones that haven't started yet
-- (Build & Launch, Data Migration) have no entries. created_by_user_id is the
-- employee's own user id, except one entry Maria (user 2) logged for Priya.
INSERT INTO time_entries (employee_id, milestone_id, work_date, hours, note, created_by_user_id) VALUES
  -- priya (user 4): Design System
  (3, 2, '2026-08-17', 6.00, 'Kickoff and audit of existing components', 4),
  (3, 2, '2026-08-18', 7.50, NULL,                                       4),
  (3, 2, '2026-08-24', 8.00, 'Typography scale',                         4),
  (3, 2, '2026-09-02', 5.50, NULL,                                       4),
  (3, 2, '2026-09-15', 7.00, 'Color tokens review',                      4),
  (3, 2, '2026-09-29', 2.00, 'Design review with stakeholders',          2),
  (3, 2, '2026-10-01', 6.50, NULL,                                       4),
  (3, 2, '2026-10-13', 4.00, 'Handoff docs',                             4),
  -- priya: Beta Release
  (3, 6, '2026-02-03', 8.00, NULL,                                       4),
  (3, 6, '2026-02-10', 7.00, 'Onboarding flow mockups',                  4),
  (3, 6, '2026-03-05', 6.50, NULL,                                       4),
  (3, 6, '2026-04-14', 5.00, NULL,                                       4),
  -- james (user 5): Design System
  (4, 2, '2026-08-20', 8.00, 'Set up Storybook',                         5),
  (4, 2, '2026-09-03', 7.50, NULL,                                       5),
  (4, 2, '2026-09-17', 8.00, 'Button and form components',               5),
  (4, 2, '2026-10-06', 6.00, NULL,                                       5),
  (4, 2, '2026-10-14', 3.50, NULL,                                       5),
  -- james: Beta Release
  (4, 6, '2026-01-20', 8.00, NULL,                                       5),
  (4, 6, '2026-02-24', 7.50, 'Beta build pipeline',                      5),
  (4, 6, '2026-03-19', 8.00, NULL,                                       5),
  (4, 6, '2026-04-22', 6.00, NULL,                                       5),
  -- james: Public Release
  (4, 7, '2026-05-06', 7.00, 'App store assets',                         5),
  (4, 7, '2026-05-27', 8.00, NULL,                                       5),
  (4, 7, '2026-06-16', 6.50, NULL,                                       5),
  (4, 7, '2026-06-29', 4.00, 'Launch day fixes',                         5),
  -- kenji (user 7): Schema Mapping
  (6, 4, '2026-09-08', 6.00, 'Mapped customer tables',                   7),
  (6, 4, '2026-09-22', 7.50, NULL,                                       7),
  (6, 4, '2026-10-07', 5.00, NULL,                                       7),
  -- david (user 3): Schema Mapping
  (2, 4, '2026-09-04', 3.00, 'Review of mapping approach',               3),
  (2, 4, '2026-10-02', 2.50, NULL,                                       3),
  -- sofia (user 6): Schema Mapping
  (5, 4, '2026-09-09', 8.00, NULL,                                       6),
  (5, 4, '2026-09-23', 7.00, 'Order history mapping',                    6),
  (5, 4, '2026-10-05', 8.00, NULL,                                       6),
  (5, 4, '2026-10-12', 6.50, NULL,                                       6),
  -- omar (user 9): Requirements, Data Pipeline, Dashboards
  (8, 8, '2026-08-04', 6.00, 'Stakeholder interviews',                   9),
  (8, 8, '2026-08-12', 7.50, NULL,                                       9),
  (8, 8, '2026-08-25', 5.00, 'KPI definitions signed off',               9),
  (8, 9, '2026-09-03', 8.00, 'Event schema',                             9),
  (8, 9, '2026-09-17', 7.00, NULL,                                       9),
  (8, 9, '2026-10-01', 6.50, 'Backfill job',                             9),
  (8, 9, '2026-10-07', 5.00, 'Incident triage',                          8),   -- logged by Lena
  (8, 9, '2026-10-09', 4.00, 'Pipeline still failing on late events',    9),
  (8, 10, '2026-10-13', 3.00, 'Dashboard wireframes',                    9),
  -- ava (user 10, no salary on file): Data Pipeline, Dashboards
  (9, 9, '2026-09-10', 8.00, NULL,                                       10),
  (9, 9, '2026-09-24', 7.50, 'Warehouse models',                         10),
  (9, 10, '2026-10-12', 6.00, NULL,                                      10),
  -- noah (user 11, deactivated): Requirements
  (10, 8, '2026-08-06', 8.00, 'Current-state process maps',              11),
  (10, 8, '2026-08-13', 6.00, NULL,                                      11),
  -- lena (user 8): Data Pipeline
  (7, 9, '2026-09-30', 2.00, 'Design review',                            8);

-- Explicit IDs don't advance identity sequences; move them past the seeded rows
SELECT setval(pg_get_serial_sequence('users',      'id'), (SELECT MAX(id) FROM users));
SELECT setval(pg_get_serial_sequence('projects',   'id'), (SELECT MAX(id) FROM projects));
SELECT setval(pg_get_serial_sequence('milestones', 'id'), (SELECT MAX(id) FROM milestones));
SELECT setval(pg_get_serial_sequence('employees',  'id'), (SELECT MAX(id) FROM employees));
SELECT setval(pg_get_serial_sequence('time_entries', 'id'), (SELECT MAX(id) FROM time_entries));

COMMIT;
