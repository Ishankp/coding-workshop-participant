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
  priya     employee  on projects 1 and 3
  james     employee  on projects 1 and 3
  sofia     employee  on project 2
  kenji     employee  on projects 1 and 2

Seed projects: Customer Portal Redesign (active), Data Warehouse Migration
(active), Mobile App Launch (completed), Legacy CRM Integration (archived).


5. RESETTING THE DATABASE
-------------------------
To throw away all data and return to the seed state (local only):

    cd backend/db
    psql -h 172.17.0.1 -U postgres -d postgres -f reset.sql -f schema.sql -f seed.sql

No redeploy is needed afterwards; the running Lambdas read the same database.


6. RUNNING THE TESTS
--------------------
Backend (388 unit tests, pytest; no database needed - repositories are replaced
by in-memory fakes):

    pip install --user pytest          # once
    ./bin/sync-shared.sh               # once, and after editing backend/_shared
    for s in auth users projects milestones employees; do
      (cd backend/$s && python3 -m pytest tests -q)
    done

  Expected: every service prints "N passed". One service at a time:

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
  guards), controllers (body validation), and routing (status codes per route).

Frontend:

    cd frontend
    npm run build        # type/syntax check and production bundle (must succeed)

  There are no automated frontend tests yet (see Known gaps). "npm run lint"
  currently fails to start because two ESLint plugins named in
  eslint.config.js are not installed; it is not part of the build.

Manual end-to-end check (after ./bin/start-dev.sh):

    # log in and list projects as Priya
    TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
      -H 'Content-Type: application/json' \
      -d '{"username":"priya","password":"Password123!"}' | python3 -c \
      'import sys,json; print(json.load(sys.stdin)["token"])')
    curl -s http://localhost:3001/api/projects -H "Authorization: Bearer $TOKEN"

  Or in the browser: log in as each seed user and compare what they can see
  (section 8).

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
    salary, set passwords, deactivate/reactivate
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
  - No automated frontend tests, and backend tests do not hit a real database
    (SQL is only exercised by running the app).
  - The database is loaded with bin/db-setup.sh reset only (no incremental
    migrations); schema changes mean reloading the seed data.
  - The first admin account can only come from seed.sql (no setup screen).
  - A deactivated user's existing session stays valid until it expires
    (up to 1 hour).
  - Password changes are admin-set only; there is no self-service reset.
  - Lint (npm run lint) is not configured correctly (missing plugins).
