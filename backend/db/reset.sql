-- Reset: drops everything so this file can be re-run (LOCAL DEV ONLY - deletes all data)
DROP TABLE IF EXISTS time_entries CASCADE;
DROP TABLE IF EXISTS milestone_dependencies CASCADE;
DROP TABLE IF EXISTS employee_milestones CASCADE;
DROP TABLE IF EXISTS employee_projects CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS milestones CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TYPE IF EXISTS user_role;
DROP FUNCTION IF EXISTS check_milestone_within_project();
DROP FUNCTION IF EXISTS check_project_contains_milestones();