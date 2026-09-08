"""Backend API tests for Southgate Smoke Shop Time Clock."""
import os
import io
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://southgate-timeclock.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

OWNER_USER = "owner"
OWNER_PASS = "Owner@2025"
SUPER_USER = "erostova"
SUPER_PASS = "Super@2025"
EMP_ID = "EMP102"
EMP_PIN = "1234"


# ------------------ Fixtures ------------------

@pytest.fixture(scope="session")
def owner_token():
    r = requests.post(f"{API}/auth/login", json={"username": OWNER_USER, "password": OWNER_PASS})
    assert r.status_code == 200, f"Owner login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def super_token():
    r = requests.post(f"{API}/auth/login", json={"username": SUPER_USER, "password": SUPER_PASS})
    if r.status_code != 200:
        pytest.skip(f"Supervisor login failed: {r.status_code} {r.text}")
    return r.json()["token"]


def auth_h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ------------------ Auth ------------------

class TestAuth:
    def test_owner_login(self):
        r = requests.post(f"{API}/auth/login", json={"username": OWNER_USER, "password": OWNER_PASS})
        assert r.status_code == 200
        j = r.json()
        assert "token" in j and j["user"]["role"] == "owner"

    def test_bad_login(self):
        r = requests.post(f"{API}/auth/login", json={"username": "owner", "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, owner_token):
        r = requests.get(f"{API}/auth/me", headers=auth_h(owner_token))
        assert r.status_code == 200
        assert r.json()["role"] == "owner"

    def test_no_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ------------------ Kiosk flow ------------------

class TestKiosk:
    def test_verify_valid(self):
        r = requests.post(f"{API}/kiosk/verify", json={"identifier": EMP_ID, "pin": EMP_PIN})
        assert r.status_code == 200
        j = r.json()
        assert j["employee"]["employee_id"] == EMP_ID
        assert "status" in j

    def test_verify_bad_pin(self):
        r = requests.post(f"{API}/kiosk/verify", json={"identifier": EMP_ID, "pin": "0000"})
        assert r.status_code == 401

    def test_full_clock_cycle(self):
        # First ensure clocked out
        v = requests.post(f"{API}/kiosk/verify", json={"identifier": EMP_ID, "pin": EMP_PIN}).json()
        status = v["status"]
        if status == "on_break":
            requests.post(f"{API}/kiosk/action", json={"identifier": EMP_ID, "pin": EMP_PIN, "action": "end_break"})
            status = "clocked_in"
        if status == "clocked_in":
            r = requests.post(f"{API}/kiosk/action", json={"identifier": EMP_ID, "pin": EMP_PIN, "action": "clock_out"})
            assert r.status_code == 200

        # Now not clocked in -> double clock_out should fail
        r = requests.post(f"{API}/kiosk/action", json={"identifier": EMP_ID, "pin": EMP_PIN, "action": "clock_out"})
        assert r.status_code == 400

        # start_break without clock in fails
        r = requests.post(f"{API}/kiosk/action", json={"identifier": EMP_ID, "pin": EMP_PIN, "action": "start_break"})
        assert r.status_code == 400

        # clock in
        r = requests.post(f"{API}/kiosk/action", json={"identifier": EMP_ID, "pin": EMP_PIN, "action": "clock_in"})
        assert r.status_code == 200
        j = r.json()
        assert j["status"] == "clocked_in"
        # Late detection: since employee has schedule 09:00-17:00, likely late
        # can't guarantee, just check field exists
        assert "late_minutes" in j

        # double clock in fails
        r = requests.post(f"{API}/kiosk/action", json={"identifier": EMP_ID, "pin": EMP_PIN, "action": "clock_in"})
        assert r.status_code == 400

        # start break
        r = requests.post(f"{API}/kiosk/action", json={"identifier": EMP_ID, "pin": EMP_PIN, "action": "start_break"})
        assert r.status_code == 200

        # double break fails
        r = requests.post(f"{API}/kiosk/action", json={"identifier": EMP_ID, "pin": EMP_PIN, "action": "start_break"})
        assert r.status_code == 400

        # can't clock out on break
        r = requests.post(f"{API}/kiosk/action", json={"identifier": EMP_ID, "pin": EMP_PIN, "action": "clock_out"})
        assert r.status_code == 400

        # end break
        r = requests.post(f"{API}/kiosk/action", json={"identifier": EMP_ID, "pin": EMP_PIN, "action": "end_break"})
        assert r.status_code == 200

        # end break again fails
        r = requests.post(f"{API}/kiosk/action", json={"identifier": EMP_ID, "pin": EMP_PIN, "action": "end_break"})
        assert r.status_code == 400

        # clock out
        r = requests.post(f"{API}/kiosk/action", json={"identifier": EMP_ID, "pin": EMP_PIN, "action": "clock_out"})
        assert r.status_code == 200
        assert "worked_hours" in r.json()


# ------------------ Dashboard ------------------

class TestDashboard:
    def test_dashboard_live(self, owner_token):
        r = requests.get(f"{API}/dashboard/live", headers=auth_h(owner_token))
        assert r.status_code == 200
        j = r.json()
        for k in ["currently_working", "on_break", "not_clocked_in", "late", "total_hours"]:
            assert k in j["stats"]
        assert isinstance(j["employees"], list)

    def test_dashboard_unauth(self):
        r = requests.get(f"{API}/dashboard/live")
        assert r.status_code == 401


# ------------------ Employees CRUD ------------------

class TestEmployees:
    created_id = None

    def test_list_employees(self, owner_token):
        r = requests.get(f"{API}/employees", headers=auth_h(owner_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_bad_pin(self, owner_token):
        r = requests.post(f"{API}/employees", headers=auth_h(owner_token), json={
            "full_name": "TEST_BadPin", "employee_id": "TEST_BP1", "pin": "12",
        })
        assert r.status_code == 400

    def test_create_and_delete_employee(self, owner_token):
        payload = {
            "full_name": "TEST_John Q", "employee_id": "TEST_EMP999", "username": "test_jq",
            "pin": "4455", "role": "employee", "hourly_rate": 15.0,
        }
        r = requests.post(f"{API}/employees", headers=auth_h(owner_token), json=payload)
        assert r.status_code == 200, r.text
        eid = r.json()["id"]
        assert r.json()["employee_id"] == "TEST_EMP999"

        # duplicate employee_id
        r2 = requests.post(f"{API}/employees", headers=auth_h(owner_token), json=payload)
        assert r2.status_code == 400

        # update
        r3 = requests.put(f"{API}/employees/{eid}", headers=auth_h(owner_token), json={"hourly_rate": 20.0})
        assert r3.status_code == 200
        assert r3.json()["hourly_rate"] == 20.0

        # verify via GET list
        r4 = requests.get(f"{API}/employees", headers=auth_h(owner_token))
        assert any(e["id"] == eid and e["hourly_rate"] == 20.0 for e in r4.json())

        # delete
        r5 = requests.delete(f"{API}/employees/{eid}", headers=auth_h(owner_token))
        assert r5.status_code == 200

    def test_supervisor_cannot_create(self, super_token):
        r = requests.post(f"{API}/employees", headers=auth_h(super_token), json={
            "full_name": "TEST_X", "employee_id": "TEST_X1", "pin": "1234",
        })
        assert r.status_code == 403


# ------------------ Schedules ------------------

class TestSchedules:
    def test_schedule_crud(self, owner_token):
        # find EMP102 user id
        emps = requests.get(f"{API}/employees", headers=auth_h(owner_token)).json()
        emp = next((e for e in emps if e["employee_id"] == EMP_ID), None)
        assert emp
        today = datetime.now(timezone.utc).date().isoformat()
        r = requests.post(f"{API}/schedules", headers=auth_h(owner_token), json={
            "user_id": emp["id"], "date": today, "shift_start": "09:00", "shift_end": "17:00"
        })
        assert r.status_code == 200
        sid = r.json()["id"]

        r2 = requests.get(f"{API}/schedules?start={today}&end={today}", headers=auth_h(owner_token))
        assert r2.status_code == 200
        assert any(s["id"] == sid for s in r2.json())


# ------------------ Timecards / Audit ------------------

class TestTimecardsAudit:
    def test_owner_edit_creates_audit(self, owner_token):
        # find a recent timecard
        cards = requests.get(f"{API}/timecards", headers=auth_h(owner_token)).json()
        assert isinstance(cards, list)
        if not cards:
            pytest.skip("No timecards to edit")
        tc = cards[0]
        tid = tc["id"]
        new_ci = (datetime.fromisoformat(tc["clock_in"].replace("Z", "+00:00")) - timedelta(minutes=1)).isoformat()
        r = requests.put(f"{API}/timecards/{tid}", headers=auth_h(owner_token), json={
            "clock_in": new_ci, "reason": "TEST correction"
        })
        assert r.status_code == 200, r.text
        assert r.json()["edited"] is True

        # audit
        r2 = requests.get(f"{API}/audit-logs?entity=timecard&entity_id={tid}", headers=auth_h(owner_token))
        assert r2.status_code == 200
        logs = r2.json()
        assert any(l.get("reason") == "TEST correction" for l in logs)
        entry = next(l for l in logs if l.get("reason") == "TEST correction")
        assert entry["changed_by_name"]
        assert entry["timestamp"]
        assert any(c["field"] == "clock_in" for c in entry.get("changes", []))

    def test_supervisor_cannot_edit_timecard(self, super_token, owner_token):
        cards = requests.get(f"{API}/timecards", headers=auth_h(owner_token)).json()
        if not cards:
            pytest.skip("no cards")
        tid = cards[0]["id"]
        r = requests.put(f"{API}/timecards/{tid}", headers=auth_h(super_token), json={
            "clock_in": cards[0]["clock_in"], "reason": "no"
        })
        assert r.status_code == 403


# ------------------ Reports / Payroll ------------------

class TestReports:
    def test_reports_range(self, owner_token):
        r = requests.get(f"{API}/reports?range_key=this_week", headers=auth_h(owner_token))
        assert r.status_code == 200
        j = r.json()
        assert "rows" in j and "totals" in j

    def test_export_csv(self, owner_token):
        r = requests.get(f"{API}/reports/export?fmt=csv&range_key=this_week", headers=auth_h(owner_token))
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        assert b"Employee" in r.content

    def test_export_pdf(self, owner_token):
        r = requests.get(f"{API}/reports/export?fmt=pdf&range_key=this_week", headers=auth_h(owner_token))
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_payroll_supervisor_blocked_by_default(self, super_token, owner_token):
        # ensure setting off
        requests.put(f"{API}/settings", headers=auth_h(owner_token), json={"supervisor_can_view_payroll": False})
        r = requests.get(f"{API}/payroll?range_key=this_week", headers=auth_h(super_token))
        assert r.status_code == 403

    def test_payroll_supervisor_allowed_when_enabled(self, super_token, owner_token):
        requests.put(f"{API}/settings", headers=auth_h(owner_token), json={"supervisor_can_view_payroll": True})
        r = requests.get(f"{API}/payroll?range_key=this_week", headers=auth_h(super_token))
        assert r.status_code == 200
        # revert
        requests.put(f"{API}/settings", headers=auth_h(owner_token), json={"supervisor_can_view_payroll": False})


# ------------------ Settings ------------------

class TestSettings:
    def test_settings_update_owner(self, owner_token):
        r = requests.put(f"{API}/settings", headers=auth_h(owner_token), json={"late_grace_minutes": 6})
        assert r.status_code == 200
        assert r.json()["late_grace_minutes"] == 6
        # revert
        requests.put(f"{API}/settings", headers=auth_h(owner_token), json={"late_grace_minutes": 5})

    def test_settings_supervisor_forbidden(self, super_token):
        r = requests.put(f"{API}/settings", headers=auth_h(super_token), json={"late_grace_minutes": 10})
        assert r.status_code == 403


# ------------------ Attendance History filters ------------------

class TestHistory:
    def test_filters(self, owner_token):
        r = requests.get(f"{API}/timecards?late=true", headers=auth_h(owner_token))
        assert r.status_code == 200
        for c in r.json():
            assert c.get("late_minutes", 0) > 0

        r2 = requests.get(f"{API}/timecards?missing_out=true", headers=auth_h(owner_token))
        assert r2.status_code == 200
        for c in r2.json():
            assert not c.get("clock_out")
