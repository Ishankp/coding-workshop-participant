PROJECT MANAGEMENT WORKSPACE
============================

A full-stack app for tracking projects, milestones, the people on them, and the
hours they log. Three roles: employees log time on their milestones; managers
run projects and their teams; admins manage accounts and can do everything.

This file explains how to run the app locally and how to run its tests.
README.md (next to this file) is the original workshop guide and describes the
infrastructure and the cloud deployment scripts.


CONTENTS
--------
1. What is in the repo
2. Prerequisites
3. Running the app locally
4. Logging in (seed accounts)
5. Resetting the database
6. Running the tests
7. How the code is organised
8. Roles and what each can do
9. API overview
10. Deploying to AWS
11. Known gaps


1. WHAT IS IN THE REPO
----------------------
backend/        One folder per backend service; each is deployed as its own Lambda
  auth/           POST /api/auth/login
  users/          Admin account management (/api/users)
  projects/       Projects, milestones inside projects, team, budget (/api/projects)
  milestones/     Milestone detail, dependencies, complete/archive (/api/milestones)
  employees/      People, profiles, time logs (/api/employees)
  _shared/        Code shared by every service (db, auth tokens, errors, router,
                  validation). Copied into each service by bin/sync-shared.sh.
  dbsetup/        Not an API: a Lambda invoked by bin/db-setup.sh to load the
                  schema and seed into Aurora from inside the VPC
  db/             schema.sql, seed.sql, reset.sql
frontend/       React + Vite single-page app
bin/            Scripts: start-dev.sh, sync-shared.sh, deploy-*.sh, ...
cloud-deployment/  On/off switches for the AWS deployment (full launch, full
                shutdown, per-part disable/relaunch) - see document.txt there
infra/          Terraform (Lambda, S3/CloudFront, Aurora) - see README.md
docs/           Workshop guides


2. PREREQUISITES
----------------
Already installed on the workshop VDI by ./bin/setup-environment.sh:
  - Python 3.13 and pip
  - Node 22 and npm
  - PostgreSQL running on the host (reachable from LocalStack at 172.17.0.1:5432,
    database/user "postgres", password "postgres123")
  - LocalStack (with LOCALSTACK_AUTH_TOKEN exported in ~/.bashrc)
  - Terraform, awscli

Load your environment first in any new terminal:

    source ~/.bashrc


3. RUNNING THE APP LOCALLY
--------------------------
Step 1 - create and seed the database (first time, or whenever schema.sql changes):

    cd backend/db
    psql -h 172.17.0.1 -U postgres -d postgres -f reset.sql -f schema.sql -f seed.sql
    cd ../..

    (password: postgres123). reset.sql DROPS every table, so only run it locally.
    "NOTICE: ... does not exist, skipping" messages on a fresh database are normal.

Step 2 - start everything:

    ./bin/start-dev.sh

    This checks PostgreSQL and LocalStack, copies backend/_shared into each
    service, installs each service's Python dependencies, deploys the five
    Lambdas to LocalStack with Terraform, starts the API proxy on port 3001 and
    the React dev server on port 3000. The first run takes a few minutes; later
    runs are faster. Leave it running (Ctrl+C stops the dev server).

Step 3 - open the app:

    http://localhost:3000

    The frontend calls the API through http://localhost:3001/api/<service>.

Code changes: backend files hot-reload into the running Lambdas (allow ~10
seconds). If you edit anything in backend/_shared, run ./bin/sync-shared.sh.
If you add a NEW backend service folder, re-run ./bin/start-dev.sh so Terraform
deploys it. Frontend changes reload instantly.

Troubleshooting:
  - "frontend :3000 not responding": the dev server stopped; run
    cd frontend && npm run dev
  - API calls hang or 502: LocalStack may have restarted; run ./bin/start-dev.sh
    again (it redeploys only when something is missing).
  - Lambda logs:
    AWS_ENDPOINT_URL=http://localhost.localstack.cloud:4566 aws logs tail \
        /aws/lambda/<function-name> --follow


4. LOGGING IN (SEED ACCOUNTS)
-----------------------------
All seed accounts use the password:  Password123!

  username  role      notes
  --------  --------  -------------------------------------------------
  admin     admin     no employee record; sees everything, manages accounts
  maria     manager   manages Priya and James; on project 1
  david     manager   manages Sofia and Kenji; on project 2
  lena      manager   manages Omar, Ava and Noah; on project 5
  priya     employee  on projects 1 and 3
  james     employee  on projects 1 and 3
  sofia     employee  on project 2
  kenji     employee  on projects 1 and 2
  omar      employee  on project 5
  ava       employee  on project 5; no salary on file (hours count, cost doesn't)
  noah      employee  on project 5; DEACTIVATED (can't log in) but has hours logged

Seed projects:
  1 Customer Portal Redesign  active, under budget (Maria's team)
  2 Data Warehouse Migration  active, projected over budget (David's team)
  3 Mobile App Launch         completed, finished over budget
  4 Legacy CRM Integration    archived with an unfinished milestone; nobody on it
  5 Analytics Platform        active (Lena's team). Shows the edge cases: "Data
                              Pipeline" is past due and not complete, so
                              "Dashboards" is held up; "Rollout" has nobody
                              assigned; "Ideas backlog" has no dates; "Vendor
                              evaluation" is archived.

The repository and E2E tests depend on users 1-7, projects 1-4 and milestones
1-7 staying as they are; add new seed data after them.


5. RESETTING THE DATABASE
-------------------------
To throw away all data and return to the seed state (local only):

    cd backend/db
    psql -h 172.17.0.1 -U postgres -d postgres -f reset.sql -f schema.sql -f seed.sql

No redeploy is needed afterwards; the running Lambdas read the same database.


6. RUNNING THE TESTS
--------------------
Three layers: backend unit tests (pytest), frontend unit/component tests
(Vitest + React Testing Library) and browser end-to-end tests (Playwright)
against the running app. Coverage targets: backend and frontend 80%+ (both
enforced), API endpoints and error handling 90%+, critical user paths 100% E2E.

Backend (506 tests: 449 unit tests where repositories are replaced by
in-memory fakes, plus 57 repository tests that run the real SQL against the
local PostgreSQL and roll back afterwards):

    pip install --user pytest pytest-cov   # once
    ./bin/test-backend.sh                  # all services + one combined coverage
                                           # report; fails under 80% line coverage

  Expected: every service prints "N passed" and the combined TOTAL is >= 80%
  (98% with PostgreSQL reachable, 86% without: the repository tests skip when
  the database is down, so they also skip in CI). The repository tests need
  the seed data (section 3); each test runs in a transaction that is always
  rolled back, so they leave the database untouched. They also prove the
  schema rules: date bounds, hours 0-24, no self-dependencies, uniqueness,
  and the milestone-within-project triggers. Set PG_TEST_DSN to use another
  database. Don't run them at the same time as the E2E tests: their open
  transactions hold row locks that can stall a browser test. One service at
  a time:

    ./bin/sync-shared.sh               # once, and after editing backend/_shared
    cd backend/projects && python3 -m pytest tests -q
    cd backend/projects && python3 -m pytest tests -v -k budget   # a subset

  The services' own dependencies (psycopg, bcrypt, PyJWT) must be installed
  into each service folder; ./bin/start-dev.sh does that. If a test fails with
  ModuleNotFoundError before you have run start-dev.sh, run (per service):

    cd backend/<service>
    pip install --target=. --platform manylinux2014_x86_64 --implementation cp \
        --python-version 3.13 --only-binary=:all: -r requirements.txt

  What the tests cover: every service's business rules (permissions by role,
  membership, validation, loop detection in dependencies, date bounds, hours
  guards), controllers (body validation), and routing (every one of the 38
  routes has a handler-level status-code test).

Frontend unit and component tests (310 tests, jsdom, no server needed):

    cd frontend
    npm install              # once
    npm test                 # run everything once
    npm run test:watch       # re-run on save
    npm run test:coverage    # text + HTML report in frontend/coverage/;
                             # fails under 80% lines/branches/functions
    npm run build            # production bundle (must still succeed)

  Every file under src/ has a sibling *.test.js(x). API calls are mocked at
  the service module, so tests check what the UI sends and how it renders each
  response (loading, success, 403/404/other errors, role differences, form
  validation, every button). Shared render helper: src/test/helpers.jsx.
  Current coverage is ~99% lines and branches.

End-to-end tests (21 Playwright tests, real browser, real backend and
database). Start the app first, with the seed data loaded (section 3):

    cd frontend
    npx playwright install chromium   # once
    npm run test:e2e                  # uses the dev server on :3000 and the
                                      # API on :3001; starts Vite if needed
    npx playwright show-trace test-results/<test>/trace.zip   # on a failure

  Paths covered (e2e/*.spec.js): sign in / wrong password / empty fields /
  sign out / session survives reload / redirect to login and back / 404 page;
  employee sees only their projects, no budget or create button, refused on
  other projects and the accounts page, opens a milestone, searches projects
  and people, logs hours (and cannot edit or remove them), invalid hours;
  manager creates a project, is stopped by milestone date bounds, adds a
  milestone, adds a direct report and assigns them, marks the milestone
  complete, archives the project (now hidden from the employee), and adds,
  edits and removes a report's time entry; admin sees all projects, creates
  and deletes an empty project, is refused deleting one with hours, creates an
  account, resets its password, signs in as that person, deactivates the
  account and confirms it can no longer sign in, deletes it, is refused
  deleting someone with hours logged, and is refused a duplicate username.
  Records the tests create use unique names and are deleted at the end, so
  the suite leaves the seed data as it found it.

  "npm run lint" currently fails to start because two ESLint plugins named in
  eslint.config.js are not installed; it is not part of the build.

CI (.github/workflows): the Python workflow runs bandit (settings in
bandit.yaml: test folders are skipped, and the few false positives in
application code carry a "# nosec" comment with the reason) and
./bin/test-backend.sh; the React workflow runs npm audit, the unit tests with
the coverage floor, and the build; the Terraform workflow runs Checkov in
soft-fail mode. The E2E and repository tests are not in CI because they need
PostgreSQL and the seed data.

Manual API check (after ./bin/start-dev.sh):

    # log in and list projects as Priya
    TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
      -H 'Content-Type: application/json' \
      -d '{"username":"priya","password":"Password123!"}' | python3 -c \
      'import sys,json; print(json.load(sys.stdin)["token"])')
    curl -s http://localhost:3001/api/projects -H "Authorization: Bearer $TOKEN"

Database rules are enforced in PostgreSQL too (schema.sql): milestones must
lie within their project's dates, hours per entry are 0-24, dependencies can't
be self-referencing. You can check a rule directly, e.g. this must fail:

    psql -h 172.17.0.1 -U postgres -d postgres -c \
      "INSERT INTO milestones (project_id, title, start_date, end_date)
       VALUES (1, 'Too early', '2026-01-01', '2026-02-01')"


7. HOW THE CODE IS ORGANISED
----------------------------
Each backend service has the same layers:

    function.py      Lambda entry point: wires layers together, registers routes
    controller.py    Parses/validates the HTTP request, calls the service,
                     returns the HTTP response. No SQL, no business rules.
    service.py       Business rules (who may do what, what is valid). No HTTP, no SQL.
    repository.py    SQL only, parameterised, returns plain dicts.
    tests/           pytest, with fake repositories

The projects service also has team_*.py (membership) and authoring_*.py
(create/edit/archive/delete); employees has time_entries_*.py.

backend/_shared (copied into each service as shared/):
    http_utils.py    Request parsing, Router, JSON responses, error mapping
    tokens.py        JWT create/decode, require_user() -> CurrentUser(id, role)
    errors.py        AppError subclasses -> 400/401/403/404/405/409
    db.py            One reused psycopg connection per Lambda container
    forms.py, validation.py, search.py, timeline.py, dependencies.py, membership.py

Errors always have the shape:
    {"error": {"code": "validation_error", "message": "...", "fields": {"endDate": "..."}}}

Frontend (frontend/src):
    pages/           One component per screen
    components/      Reusable pieces (forms, bars, lists, team manager)
    services/        One file per backend service; all calls go through api.js,
                     which adds the bearer token and normalises errors
    context/         Logged-in session
    hooks/, utils/   Data loading, formatting, search query in the URL

Configuration: the Lambdas receive POSTGRES_* and IS_LOCAL from Terraform
(infra/locals.tf). JWT_SECRET is read from the environment; locally a fixed dev
secret is used when it is unset.


8. ROLES AND WHAT EACH CAN DO
-----------------------------
Employee
  - See the projects they are a member of, their milestones, dependencies,
    the work log on each milestone, and teammates' profiles
  - Log hours on milestones they are assigned to (add only; cannot edit/remove)
  - Search projects and people they can see
  - Cannot see budgets, archived items, or other people's time logs

Manager (everything an employee can, plus, on projects they are a member of)
  - Create projects (becomes a member) and milestones; edit them; mark
    milestones complete; archive/restore both
  - See budget vs spend and projected cost
  - Build the team: add people and assign milestones - but only their own
    people (direct reports and members of their projects)
  - View, add, edit and remove time entries for their direct reports
  - Add/remove dependencies between milestones

Admin (everything a manager can, on every project, plus)
  - Accounts page: create accounts (admin/manager/employee), edit details and
    salary, set passwords, deactivate/reactivate, and delete employee or
    manager accounts that have no hours logged and no direct reports (admins
    and everyone else can only be deactivated, so history is kept)
  - Delete projects and milestones (refused while hours are logged on them)
  - Admins have no employee record, so no projects or time log of their own

Rules enforced by the backend regardless of the UI:
  - Hours can only be logged on an assigned, non-archived milestone, never in
    the future, 0-24 per entry
  - Someone with hours logged cannot be removed from a milestone or project
  - Milestone dates must stay inside the project; a dependent milestone cannot
    start before the one it depends on; no dependency loops
  - Archived items are hidden from employees and excluded from progress bars,
    but still count in dependency checks and budget costs
  - A person's manager is set when the account is created and never changes
  - Only admins create accounts; a new account has no projects until placed


9. API OVERVIEW
---------------
All endpoints except login need "Authorization: Bearer <token>" (token from
login, valid 1 hour). Local base URL: http://localhost:3001/api

auth
  POST   /auth/login                       {username, password}

users (admin only)
  GET    /users
  POST   /users                            create account
  PUT    /users/{id}                       edit
  DELETE /users/{id}                       delete (409 if admin, has reports or hours)
  POST   /users/{id}/password              {password}
  POST   /users/{id}/deactivate | /reactivate

projects
  GET    /projects?q=text                  list (search title/milestones)
  POST   /projects                         create (manager/admin)
  GET    /projects/{id}                    detail + completion
  PUT    /projects/{id}                    edit (manager member/admin)
  DELETE /projects/{id}                    delete (admin; no hours logged)
  POST   /projects/{id}/archive | /unarchive
  GET    /projects/{id}/milestones         milestones, dependencies, unassigned members
  POST   /projects/{id}/milestones         create milestone
  GET    /projects/{id}/budget             manager/admin
  GET    /projects/{id}/team               members + who can be added
  POST   /projects/{id}/members            {employeeId}
  DELETE /projects/{id}/members/{employeeId}
  POST   /projects/{id}/milestones/{mid}/assignees            {employeeId}
  DELETE /projects/{id}/milestones/{mid}/assignees/{employeeId}

milestones
  GET    /milestones/{id}                  detail, dependencies, work log
  PUT    /milestones/{id}                  edit
  DELETE /milestones/{id}                  delete (admin; no hours logged)
  POST   /milestones/{id}/complete | /reopen | /archive | /unarchive
  POST   /milestones/{id}/dependencies     {dependsOnMilestoneId}
  DELETE /milestones/{id}/dependencies/{dependsOnMilestoneId}

employees
  GET    /employees?q=text                 people the caller can see
  GET    /employees/{id}                   profile with projects, milestones, hours
  GET    /employees/{id}/time-entries      time log (self, manager, admin)
  POST   /employees/{id}/time-entries      {milestoneId, workDate, hours, note?}
  PUT    /employees/{id}/time-entries/{entryId}     (manager/admin)
  DELETE /employees/{id}/time-entries/{entryId}     (manager/admin)

Status codes: 200/201/204 success; 400 validation (with "fields"); 401 not
logged in or expired; 403 not allowed; 404 missing; 409 conflict (duplicate,
or something still depends on it); 500 unexpected.


10. DEPLOYING TO AWS
--------------------
The same Terraform and scripts serve LocalStack and AWS; they detect which one
they are talking to. Organisers pre-created the Aurora cluster, the website S3
bucket and the CloudFront distribution for your participant id; deploying adds
the Lambdas and wires them into CloudFront under /api/<service>.

Prerequisites (once): EVENT_ID, PARTICIPANT_ID and PARTICIPANT_CODE exported in
~/.bashrc, and AWS_REGION=us-east-2. The deploy scripts call
bin/setup-participant.sh themselves, which fetches temporary credentials into
ENVIRONMENT.config (never commit that file).

    source ~/.bashrc

  1. Backend (Terraform: Lambdas, Function URLs, CloudFront routes):

         ./bin/deploy-backend.sh

     Each backend/<service>/ with a requirements.txt becomes one Lambda named
     coding-workshop-<service>-<participant id>. bin/sync-shared.sh runs first
     so every package carries its copy of backend/_shared. A JWT_SECRET is
     generated by Terraform (infra/main.tf) and injected into every Lambda.

  2. Database (first time, and whenever you want fresh seed data):

         ./bin/db-setup.sh aws status     # which tables exist, row counts
         ./bin/db-setup.sh aws reset      # DELETES ALL DATA: reset + schema + seed

     Aurora is only reachable inside the VPC, so this invokes the dbsetup
     Lambda directly (aws lambda invoke); it refuses HTTP requests.

  3. Frontend (Vite build, upload to S3, CloudFront cache invalidation):

         ./bin/deploy-frontend.sh

     The build gets VITE_API_URL=https://<cloudfront domain>, so the browser
     calls /api/... on the same origin. The script prints the site URL.

  Check it:

         curl -s https://<cloudfront domain>/api/auth/login -X POST \
              -H 'Content-Type: application/json' \
              -d '{"username":"admin","password":"Password123!"}'
         aws logs tail /aws/lambda/coding-workshop-auth-<participant id> --follow

  Redeploy after code changes: backend -> ./bin/deploy-backend.sh (Terraform
  only repackages Lambdas whose files changed); frontend -> ./bin/deploy-frontend.sh.
  Tear down everything: ./bin/cleanup-environment.sh.
  Switch the live site on/off in whole or in part without deleting anything:
  see cloud-deployment/document.txt (launch-all.sh, disable-all.sh, ...).

  Cloud differences to keep in mind:
    - IS_LOCAL=false: database connections require SSL; JWT_SECRET must exist.
    - Aurora is PostgreSQL 17.7 (local is 18); schema.sql uses nothing newer.
    - CloudFront serves index.html for page routes via infra/spa-router.js
      (a CloudFront Function on the S3 behaviour only), so API 404s stay 404s.
    - Temporary credentials expire; re-run ./bin/setup-participant.sh if the
      AWS CLI reports ExpiredToken.


11. KNOWN GAPS
--------------
  - The backend repository tests and the E2E tests need the local PostgreSQL
    with the seed data; neither runs in CI.
  - The E2E tests need the full local stack running and are not run in CI.
  - After adding someone to a project, the "added to the project" notice never
    shows: the page reloads and remounts the Team card, which clears it.
  - Signing out leaves a "return to this page" redirect in browser history;
    if someone else then signs in on the same tab they land on that page and
    may see "No access" (e.g. the Accounts page).
  - The database is loaded with bin/db-setup.sh reset only (no incremental
    migrations); schema changes mean reloading the seed data.
  - The first admin account can only come from seed.sql (no setup screen).
  - A deactivated user's existing session stays valid until it expires
    (up to 1 hour).
  - Password changes are admin-set only; there is no self-service reset.
  - Lint (npm run lint) is not configured correctly (missing plugins).
