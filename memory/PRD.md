# Southgate Smoke Shop — Employee Attendance & Time Clock

## Original Problem Statement
Production-ready Employee Attendance and Time Clock web app for Southgate Smoke Shop. Roles: Owner, Supervisor, Employee. Kiosk clock-in (Employee ID/username + 4-6 digit PIN) with CLOCK IN/OUT/START BREAK/END BREAK. Owner live dashboard, employee management, weekly schedules, timesheets (daily/weekly/biweekly/monthly), payroll estimate, reports with CSV/PDF export, attendance history with filters, audit log, store settings. Premium dark UI (black/gray/white).

### User overrides (authoritative)
- NO overtime — track only actual total worked hours (12h, 16h all count normally).
- ONLY the Owner can add/edit/correct/delete attendance records. Supervisors & Employees can NEVER modify attendance times.
- Supervisors are view-only; cannot see Settings/Audit; payroll gated by a setting.
- Every owner attendance change preserves the original value in the audit log (old value, new value, timestamp, owner, reason).
- Admin auth = username + password (JWT). Employees = Employee ID/username + PIN.

## Architecture
- Backend: FastAPI + MongoDB (motor). All routes under `/api`. JWT (12h) via Authorization Bearer; bcrypt hashing for passwords AND PINs. Times stored UTC ISO, displayed in store timezone (default America/New_York).
- Frontend: React 19 + React Router + TanStack Query + Tailwind + shadcn + sonner + recharts. Kiosk at `/`, manager login at `/login`, protected admin at `/admin/*`.
- Collections: users (owner/supervisor/employee), timecards (clock_in/out, breaks[], late_minutes, status, edited), schedules, settings, audit_logs, login_attempts.

## User Personas
- Owner: full control, only role that edits attendance; sees payroll/settings/audit.
- Supervisor: monitors dashboard/attendance/reports; no edits; no settings/audit.
- Employee: kiosk clock actions + view own hours/schedule only.

## Implemented (2026-06)
- Kiosk time clock: PIN pad, live clock, verify, CLOCK IN/OUT/START/END BREAK with invalid-sequence guards + confirmations; employee self "My Hours & Schedule" modal.
- Live owner dashboard with 5 stat tiles + employee status cards + recent activity, auto-refresh 5s.
- Employee management CRUD (owner), PIN 4-6 digit validation, duplicate checks, active toggle.
- Weekly schedule grid (owner add/edit/remove shifts); late detection vs schedule + grace period.
- Timesheets daily/weekly/biweekly/monthly; owner-only manual correction + manual entry (reason mandatory); NO overtime.
- Payroll estimate (rate × hours, no overtime); supervisor gated.
- Reports (today/yesterday/this-week/last-week/this-month/custom) + CSV & PDF export + bar chart.
- Attendance history with filters (employee/status/date range/late/missing clock-out).
- Audit log with original→new, reason, owner, timestamp; original never overwritten.
- Store settings (name/address/timezone/grace/pay period/supervisor payroll permission).
- Security: bcrypt, JWT, RBAC guards, brute-force lockout on login, 15-min admin inactivity auto-logout.
- Seeded default Owner (username `owner`).

## Backlog (P1/P2)
- P1: Kiosk PIN brute-force rate limiting.
- P1: Copy-previous-week schedule + publish.
- P2: Explicit CORS origins for production; midnight-crossing shift late calc; SMS PIN reset.

## Next tasks
- Await user review of live app and feedback.
