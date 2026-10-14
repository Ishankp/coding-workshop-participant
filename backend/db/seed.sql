-- Seed data for local development and testing
-- Run after schema.sql:
--   psql -h 172.17.0.1 -U postgres -d postgres -f reset.sql -f schema.sql -f seed.sql
--
-- All seeded users share the password: Password123!
-- Hashes are bcrypt cost 12 (pgcrypto), compatible with Python's bcrypt.checkpw()

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
  (7, 'kenji@example.com',  'kenji',  'Kenji',  'Tanaka',   'employee', crypt('Password123!', gen_salt('bf', 12)));

-- Projects: two active, one completed, one archived.
-- Budgets are sized to the hours seeded below (cost = hours x salary / 2080), so the budget
-- view shows one project under budget (1), one projected over (2) and one that finished over (3).
INSERT INTO projects (id, title, start_date, end_date, budget, archived_at, completed_at) VALUES
  (1, 'Customer Portal Redesign', '2026-07-01', '2026-12-31', 12000.00, NULL, NULL),
  (2, 'Data Warehouse Migration', '2026-09-01', '2027-03-31', 10000.00, NULL, NULL),
  (3, 'Mobile App Launch',        '2026-01-15', '2026-06-30',  4000.00, NULL, '2026-06-28 17:00:00'),
  (4, 'Legacy CRM Integration',   '2025-10-01', '2026-02-28',  9000.00, '2026-03-15 09:00:00', NULL);

INSERT INTO milestones (id, project_id, title, description, start_date, end_date) VALUES
  (1, 1, 'Discovery & Research', 'User interviews and current-state analysis', '2026-07-01', '2026-08-15'),
  (2, 1, 'Design System',        'Component library and style guide',          '2026-08-16', '2026-10-15'),
  (3, 1, 'Build & Launch',       'Implement new portal and release',           '2026-10-16', '2026-12-31'),
  (4, 2, 'Schema Mapping',       'Map legacy tables to the new warehouse',     '2026-09-01', '2026-11-30'),
  (5, 2, 'Data Migration',       'Migrate and validate historical data',       '2026-12-01', '2027-03-31'),
  (6, 3, 'Beta Release',         'Release to internal testers',                '2026-01-15', '2026-04-30'),
  (7, 3, 'Public Release',       'App store submission and launch',            '2026-05-01', '2026-06-30');

-- Employees: managers first so manager_id references resolve
INSERT INTO employees (id, user_id, title, salary, manager_id) VALUES
  (1, 2, 'Engineering Manager',  145000.00, NULL),
  (2, 3, 'Data Manager',         140000.00, NULL),
  (3, 4, 'Senior UX Designer',   115000.00, 1),
  (4, 5, 'Frontend Engineer',    105000.00, 1),
  (5, 6, 'Data Engineer',        110000.00, 2),
  (6, 7, 'Backend Engineer',     108000.00, 2);

INSERT INTO employee_projects (employee_id, project_id) VALUES
  (1, 1),
  (3, 1),
  (4, 1),
  (6, 1),
  (2, 2),
  (5, 2),
  (6, 2),
  (4, 3),
  (3, 3);

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
  (5, 5);  -- sofia: Data Migration       (project 2)

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
  (5, 4, '2026-10-12', 6.50, NULL,                                       6);

-- Explicit IDs don't advance identity sequences; move them past the seeded rows
SELECT setval(pg_get_serial_sequence('users',      'id'), (SELECT MAX(id) FROM users));
SELECT setval(pg_get_serial_sequence('projects',   'id'), (SELECT MAX(id) FROM projects));
SELECT setval(pg_get_serial_sequence('milestones', 'id'), (SELECT MAX(id) FROM milestones));
SELECT setval(pg_get_serial_sequence('employees',  'id'), (SELECT MAX(id) FROM employees));
SELECT setval(pg_get_serial_sequence('time_entries', 'id'), (SELECT MAX(id) FROM time_entries));

COMMIT;
