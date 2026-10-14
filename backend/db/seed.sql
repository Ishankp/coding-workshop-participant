-- Seed data for local development and testing
-- Run after schema.sql:
--   psql -h 172.17.0.1 -U postgres -d postgres -f reset.sql -f schema.sql -f seed.sql
--
-- All seeded users share the password: Password123!
-- Hashes are bcrypt (pgcrypto), compatible with Python's bcrypt.checkpw()

CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

-- Users: one admin, two managers, four employees
INSERT INTO users (id, email, username, first_name, last_name, role, password_hashed) VALUES
  (1, 'admin@example.com',  'admin',  'Alice',  'Admin',    'admin',    crypt('Password123!', gen_salt('bf'))),
  (2, 'maria@example.com',  'maria',  'Maria',  'Gonzalez', 'manager',  crypt('Password123!', gen_salt('bf'))),
  (3, 'david@example.com',  'david',  'David',  'Chen',     'manager',  crypt('Password123!', gen_salt('bf'))),
  (4, 'priya@example.com',  'priya',  'Priya',  'Patel',    'employee', crypt('Password123!', gen_salt('bf'))),
  (5, 'james@example.com',  'james',  'James',  'Smith',    'employee', crypt('Password123!', gen_salt('bf'))),
  (6, 'sofia@example.com',  'sofia',  'Sofia',  'Rossi',    'employee', crypt('Password123!', gen_salt('bf'))),
  (7, 'kenji@example.com',  'kenji',  'Kenji',  'Tanaka',   'employee', crypt('Password123!', gen_salt('bf')));

-- Projects: two active, one completed, one archived
INSERT INTO projects (id, title, start_date, end_date, budget, archived_at, completed_at) VALUES
  (1, 'Customer Portal Redesign', '2026-07-01', '2026-12-31', 250000.00, NULL, NULL),
  (2, 'Data Warehouse Migration', '2026-09-01', '2027-03-31', 400000.00, NULL, NULL),
  (3, 'Mobile App Launch',        '2026-01-15', '2026-06-30', 180000.00, NULL, '2026-06-28 17:00:00'),
  (4, 'Legacy CRM Integration',   '2025-10-01', '2026-02-28',  90000.00, '2026-03-15 09:00:00', NULL);

INSERT INTO milestones (id, project_id, title, description, start_date, end_date) VALUES
  (1, 1, 'Discovery & Research', 'User interviews and current-state analysis', '2026-07-01', '2026-08-15'),
  (2, 1, 'Design System',        'Component library and style guide',          '2026-08-16', '2026-10-15'),
  (3, 1, 'Build & Launch',       'Implement new portal and release',           '2026-10-16', '2026-12-31'),
  (4, 2, 'Schema Mapping',       'Map legacy tables to the new warehouse',     '2026-09-01', '2026-11-30'),
  (5, 2, 'Data Migration',       'Migrate and validate historical data',       '2026-12-01', '2027-03-31'),
  (6, 3, 'Beta Release',         'Release to internal testers',                '2026-01-15', '2026-04-30'),
  (7, 3, 'Public Release',       'App store submission and launch',            '2026-05-01', '2026-06-30');

-- Employees: managers first so manager_id references resolve
INSERT INTO employees (id, user_id, title, salary, manager_id, current_milestone_id) VALUES
  (1, 2, 'Engineering Manager',  145000.00, NULL, NULL),
  (2, 3, 'Data Manager',         140000.00, NULL, NULL),
  (3, 4, 'Senior UX Designer',   115000.00, 1,    2),
  (4, 5, 'Frontend Engineer',    105000.00, 1,    2),
  (5, 6, 'Data Engineer',        110000.00, 2,    4),
  (6, 7, 'Backend Engineer',     108000.00, 2,    NULL);

INSERT INTO employee_projects (employee_id, project_id, hours_spent) VALUES
  (1, 1,  60.00),
  (3, 1, 220.50),
  (4, 1, 180.00),
  (6, 1,  40.00),
  (2, 2,  35.00),
  (5, 2, 120.00),
  (6, 2,  75.25),
  (4, 3, 310.00),
  (3, 3, 150.00);

-- Explicit IDs don't advance identity sequences; move them past the seeded rows
SELECT setval(pg_get_serial_sequence('users',      'id'), (SELECT MAX(id) FROM users));
SELECT setval(pg_get_serial_sequence('projects',   'id'), (SELECT MAX(id) FROM projects));
SELECT setval(pg_get_serial_sequence('milestones', 'id'), (SELECT MAX(id) FROM milestones));
SELECT setval(pg_get_serial_sequence('employees',  'id'), (SELECT MAX(id) FROM employees));

COMMIT;
