from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Query
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import logging
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
import io
import csv
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta, date, time
from zoneinfo import ZoneInfo
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------- Helpers ----------------

def hash_secret(secret: str) -> str:
    return bcrypt.hashpw(secret.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_secret(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()

def parse_iso(s: str) -> datetime:
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt

DEFAULT_SETTINGS = {
    "id": "store",
    "store_name": "Southgate Smoke Shop",
    "store_address": "",
    "timezone": "America/New_York",
    "late_grace_minutes": 5,
    "pay_period": "biweekly",
    "supervisor_can_view_payroll": False,
}

async def get_settings() -> dict:
    s = await db.settings.find_one({"id": "store"}, {"_id": 0})
    if not s:
        await db.settings.insert_one(dict(DEFAULT_SETTINGS))
        return dict(DEFAULT_SETTINGS)
    merged = {**DEFAULT_SETTINGS, **s}
    return merged

async def get_tz() -> ZoneInfo:
    s = await get_settings()
    try:
        return ZoneInfo(s["timezone"])
    except Exception:
        return ZoneInfo("America/New_York")

async def local_today(tz: ZoneInfo) -> str:
    return datetime.now(tz).date().isoformat()

def public_user(u: dict) -> dict:
    return {
        "id": u["id"],
        "full_name": u["full_name"],
        "employee_id": u["employee_id"],
        "username": u.get("username"),
        "email": u.get("email", ""),
        "phone": u.get("phone", ""),
        "role": u["role"],
        "hourly_rate": u.get("hourly_rate", 0),
        "hire_date": u.get("hire_date", ""),
        "active": u.get("active", True),
        "avatar": u.get("avatar", ""),
        "created_at": u.get("created_at", ""),
    }

# ---------------- Auth ----------------

async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user or not user.get("active", True):
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user

def require_roles(*roles):
    async def checker(request: Request):
        user = await get_current_user(request)
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return checker

require_owner = require_roles("owner")
require_staff = require_roles("owner", "supervisor")

class LoginBody(BaseModel):
    username: str
    password: str

@api_router.post("/auth/login")
async def login(body: LoginBody, request: Request):
    ident = body.username.strip().lower()
    ip = request.client.host if request.client else "unknown"
    key = f"{ip}:{ident}"
    attempt = await db.login_attempts.find_one({"identifier": key})
    if attempt and attempt.get("count", 0) >= 5:
        locked_until = parse_iso(attempt["locked_until"]) if attempt.get("locked_until") else None
        if locked_until and locked_until > now_utc():
            raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    user = await db.users.find_one({"username": ident})
    if not user or user["role"] not in ("owner", "supervisor") or not user.get("password_hash"):
        await _register_fail(key)
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if not verify_secret(body.password, user["password_hash"]):
        await _register_fail(key)
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Account is inactive")
    await db.login_attempts.delete_one({"identifier": key})
    token = create_token(user["id"], user["role"])
    return {"token": token, "user": public_user(user)}

async def _register_fail(key: str):
    attempt = await db.login_attempts.find_one({"identifier": key})
    count = (attempt.get("count", 0) if attempt else 0) + 1
    upd = {"count": count}
    if count >= 5:
        upd["locked_until"] = iso(now_utc() + timedelta(minutes=15))
    await db.login_attempts.update_one({"identifier": key}, {"$set": upd}, upsert=True)

@api_router.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return public_user(user)

@api_router.post("/auth/logout")
async def logout(user: dict = Depends(get_current_user)):
    return {"ok": True}

# ---------------- Audit ----------------

async def write_audit(entity, entity_id, action, changed_by, reason="", changes=None):
    doc = {
        "id": str(uuid.uuid4()),
        "entity": entity,
        "entity_id": entity_id,
        "action": action,
        "changed_by": changed_by["id"],
        "changed_by_name": changed_by["full_name"],
        "reason": reason,
        "changes": changes or [],
        "timestamp": iso(now_utc()),
    }
    await db.audit_logs.insert_one(doc)

# ---------------- Employees ----------------

class EmployeeCreate(BaseModel):
    full_name: str
    employee_id: str
    username: Optional[str] = None
    pin: str
    password: Optional[str] = None
    phone: Optional[str] = ""
    email: Optional[str] = ""
    role: str = "employee"
    hourly_rate: float = 0
    hire_date: Optional[str] = ""
    active: bool = True
    avatar: Optional[str] = ""

class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    employee_id: Optional[str] = None
    username: Optional[str] = None
    pin: Optional[str] = None
    password: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    hourly_rate: Optional[float] = None
    hire_date: Optional[str] = None
    active: Optional[bool] = None
    avatar: Optional[str] = None

@api_router.get("/employees")
async def list_employees(user: dict = Depends(require_staff)):
    users = await db.users.find({}, {"_id": 0}).to_list(1000)
    users.sort(key=lambda x: x.get("full_name", ""))
    return [public_user(u) for u in users]

@api_router.post("/employees")
async def create_employee(body: EmployeeCreate, user: dict = Depends(require_owner)):
    if not (4 <= len(body.pin) <= 6) or not body.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be 4-6 digits")
    if await db.users.find_one({"employee_id": body.employee_id}):
        raise HTTPException(status_code=400, detail="Employee ID already exists")
    username = (body.username or "").strip().lower()
    if username and await db.users.find_one({"username": username}):
        raise HTTPException(status_code=400, detail="Username already exists")
    if body.role in ("owner", "supervisor") and not body.password:
        raise HTTPException(status_code=400, detail="Owner/Supervisor requires a password")
    doc = {
        "id": str(uuid.uuid4()),
        "full_name": body.full_name,
        "employee_id": body.employee_id,
        "username": username or None,
        "pin_hash": hash_secret(body.pin),
        "password_hash": hash_secret(body.password) if body.password else None,
        "phone": body.phone or "",
        "email": body.email or "",
        "role": body.role,
        "hourly_rate": float(body.hourly_rate or 0),
        "hire_date": body.hire_date or "",
        "active": body.active,
        "avatar": body.avatar or "",
        "created_at": iso(now_utc()),
    }
    await db.users.insert_one(doc)
    await write_audit("employee", doc["id"], "create", user, reason=f"Created {body.full_name}")
    return public_user(doc)

@api_router.put("/employees/{emp_id}")
async def update_employee(emp_id: str, body: EmployeeUpdate, user: dict = Depends(require_owner)):
    existing = await db.users.find_one({"id": emp_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Employee not found")
    upd = {}
    changes = []
    for field in ["full_name", "employee_id", "phone", "email", "role", "hire_date", "active", "avatar"]:
        val = getattr(body, field)
        if val is not None and val != existing.get(field):
            changes.append({"field": field, "original": str(existing.get(field)), "new": str(val)})
            upd[field] = val
    if body.hourly_rate is not None and float(body.hourly_rate) != existing.get("hourly_rate"):
        changes.append({"field": "hourly_rate", "original": str(existing.get("hourly_rate")), "new": str(body.hourly_rate)})
        upd["hourly_rate"] = float(body.hourly_rate)
    if body.username is not None:
        un = body.username.strip().lower() or None
        if un and un != existing.get("username"):
            clash = await db.users.find_one({"username": un, "id": {"$ne": emp_id}})
            if clash:
                raise HTTPException(status_code=400, detail="Username already exists")
        upd["username"] = un
    if body.pin:
        if not (4 <= len(body.pin) <= 6) or not body.pin.isdigit():
            raise HTTPException(status_code=400, detail="PIN must be 4-6 digits")
        upd["pin_hash"] = hash_secret(body.pin)
        changes.append({"field": "pin", "original": "****", "new": "**** (changed)"})
    if body.password:
        upd["password_hash"] = hash_secret(body.password)
        changes.append({"field": "password", "original": "****", "new": "**** (changed)"})
    if upd:
        await db.users.update_one({"id": emp_id}, {"$set": upd})
        await write_audit("employee", emp_id, "update", user, reason="Employee profile updated", changes=changes)
    updated = await db.users.find_one({"id": emp_id}, {"_id": 0})
    return public_user(updated)

@api_router.delete("/employees/{emp_id}")
async def delete_employee(emp_id: str, user: dict = Depends(require_owner)):
    existing = await db.users.find_one({"id": emp_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Employee not found")
    if existing["role"] == "owner":
        owners = await db.users.count_documents({"role": "owner"})
        if owners <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the only owner")
    await db.users.delete_one({"id": emp_id})
    await write_audit("employee", emp_id, "delete", user, reason=f"Deleted {existing['full_name']}")
    return {"ok": True}

# ---------------- Schedules ----------------

class ScheduleBody(BaseModel):
    user_id: str
    date: str  # YYYY-MM-DD
    shift_start: str  # HH:MM
    shift_end: str  # HH:MM

@api_router.get("/schedules")
async def list_schedules(start: Optional[str] = None, end: Optional[str] = None, user_id: Optional[str] = None, user: dict = Depends(require_staff)):
    q = {}
    if start and end:
        q["date"] = {"$gte": start, "$lte": end}
    if user_id:
        q["user_id"] = user_id
    items = await db.schedules.find(q, {"_id": 0}).to_list(2000)
    return items

@api_router.post("/schedules")
async def create_schedule(body: ScheduleBody, user: dict = Depends(require_owner)):
    existing = await db.schedules.find_one({"user_id": body.user_id, "date": body.date})
    doc = {"user_id": body.user_id, "date": body.date, "shift_start": body.shift_start, "shift_end": body.shift_end}
    if existing:
        await db.schedules.update_one({"id": existing["id"]}, {"$set": doc})
        doc["id"] = existing["id"]
    else:
        doc["id"] = str(uuid.uuid4())
        await db.schedules.insert_one(dict(doc))
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.delete("/schedules/{sched_id}")
async def delete_schedule(sched_id: str, user: dict = Depends(require_owner)):
    await db.schedules.delete_one({"id": sched_id})
    return {"ok": True}

# ---------------- Timecard core ----------------

async def compute_worked_seconds(tc: dict, until: Optional[datetime] = None) -> int:
    ci = parse_iso(tc["clock_in"])
    if tc.get("clock_out"):
        co = parse_iso(tc["clock_out"])
    else:
        co = until or now_utc()
    total = (co - ci).total_seconds()
    for b in tc.get("breaks", []):
        bs = parse_iso(b["start"])
        be = parse_iso(b["end"]) if b.get("end") else co
        total -= max(0, (be - bs).total_seconds())
    return int(max(0, total))

async def schedule_for(user_id: str, date_str: str):
    return await db.schedules.find_one({"user_id": user_id, "date": date_str}, {"_id": 0})

async def enrich_timecard(tc: dict, tz: ZoneInfo) -> dict:
    worked = await compute_worked_seconds(tc)
    return {
        "id": tc["id"],
        "user_id": tc["user_id"],
        "date": tc["date"],
        "clock_in": tc.get("clock_in"),
        "clock_out": tc.get("clock_out"),
        "breaks": tc.get("breaks", []),
        "status": tc["status"],
        "scheduled_start": tc.get("scheduled_start"),
        "scheduled_end": tc.get("scheduled_end"),
        "late_minutes": tc.get("late_minutes", 0),
        "worked_seconds": worked,
        "worked_hours": round(worked / 3600, 2),
        "edited": tc.get("edited", False),
    }

# ---------------- Kiosk ----------------

class KioskVerify(BaseModel):
    identifier: str
    pin: str

class KioskAction(BaseModel):
    identifier: str
    pin: str
    action: str  # clock_in, clock_out, start_break, end_break

async def find_employee_by_identifier(identifier: str):
    ident = identifier.strip()
    user = await db.users.find_one({"employee_id": ident})
    if not user:
        user = await db.users.find_one({"username": ident.lower()})
    return user

async def open_timecard(user_id: str, date_str: str):
    return await db.timecards.find_one({"user_id": user_id, "date": date_str, "status": {"$ne": "clocked_out"}})

@api_router.post("/kiosk/verify")
async def kiosk_verify(body: KioskVerify):
    user = await find_employee_by_identifier(body.identifier)
    if not user or not verify_secret(body.pin, user.get("pin_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid ID or PIN")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Account is inactive")
    tz = await get_tz()
    today = await local_today(tz)
    tc = await open_timecard(user["id"], today)
    status = tc["status"] if tc else "clocked_out"
    today_cards = await db.timecards.find({"user_id": user["id"], "date": today}, {"_id": 0}).to_list(50)
    today_seconds = sum([await compute_worked_seconds(c) for c in today_cards])
    sched = await schedule_for(user["id"], today)
    return {
        "employee": public_user(user),
        "status": status,
        "current_timecard": await enrich_timecard(tc, tz) if tc else None,
        "today_hours": round(today_seconds / 3600, 2),
        "schedule_today": sched,
    }

@api_router.post("/kiosk/action")
async def kiosk_action(body: KioskAction):
    user = await find_employee_by_identifier(body.identifier)
    if not user or not verify_secret(body.pin, user.get("pin_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid ID or PIN")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Account is inactive")
    tz = await get_tz()
    today = await local_today(tz)
    tc = await open_timecard(user["id"], today)
    ts = now_utc()
    local_str = ts.astimezone(tz).strftime("%I:%M %p").lstrip("0")

    if body.action == "clock_in":
        if tc:
            raise HTTPException(status_code=400, detail="You are already clocked in")
        settings = await get_settings()
        sched = await schedule_for(user["id"], today)
        late_minutes = 0
        scheduled_start = None
        scheduled_end = None
        if sched:
            scheduled_start = sched["shift_start"]
            scheduled_end = sched["shift_end"]
            sh, sm = map(int, sched["shift_start"].split(":"))
            sched_dt = datetime.now(tz).replace(hour=sh, minute=sm, second=0, microsecond=0)
            grace = settings.get("late_grace_minutes", 5)
            diff = (ts.astimezone(tz) - sched_dt).total_seconds() / 60
            if diff > grace:
                late_minutes = int(diff)
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "date": today,
            "clock_in": iso(ts),
            "clock_out": None,
            "breaks": [],
            "status": "clocked_in",
            "scheduled_start": scheduled_start,
            "scheduled_end": scheduled_end,
            "late_minutes": late_minutes,
            "edited": False,
            "created_at": iso(ts),
        }
        await db.timecards.insert_one(doc)
        msg = f"Clocked in successfully at {local_str}."
        if late_minutes > 0:
            msg += f" You are {late_minutes} min late."
        return {"message": msg, "status": "clocked_in", "late_minutes": late_minutes, "employee": public_user(user)}

    if not tc:
        raise HTTPException(status_code=400, detail="You are not clocked in")

    if body.action == "start_break":
        if tc["status"] == "on_break":
            raise HTTPException(status_code=400, detail="You are already on break")
        breaks = tc.get("breaks", [])
        breaks.append({"start": iso(ts), "end": None})
        await db.timecards.update_one({"id": tc["id"]}, {"$set": {"breaks": breaks, "status": "on_break"}})
        return {"message": f"Break started at {local_str}.", "status": "on_break", "employee": public_user(user)}

    if body.action == "end_break":
        if tc["status"] != "on_break":
            raise HTTPException(status_code=400, detail="You have not started a break")
        breaks = tc.get("breaks", [])
        if not breaks or breaks[-1].get("end"):
            raise HTTPException(status_code=400, detail="No active break to end")
        breaks[-1]["end"] = iso(ts)
        await db.timecards.update_one({"id": tc["id"]}, {"$set": {"breaks": breaks, "status": "clocked_in"}})
        return {"message": f"Break ended at {local_str}.", "status": "clocked_in", "employee": public_user(user)}

    if body.action == "clock_out":
        if tc["status"] == "on_break":
            raise HTTPException(status_code=400, detail="End your break before clocking out")
        await db.timecards.update_one({"id": tc["id"]}, {"$set": {"clock_out": iso(ts), "status": "clocked_out"}})
        updated = await db.timecards.find_one({"id": tc["id"]}, {"_id": 0})
        worked = await compute_worked_seconds(updated)
        return {"message": f"Clocked out successfully at {local_str}. Total: {round(worked/3600,2)} hrs.", "status": "clocked_out", "worked_hours": round(worked/3600, 2), "employee": public_user(user)}

    raise HTTPException(status_code=400, detail="Unknown action")

# ---------------- Dashboard ----------------

@api_router.get("/dashboard/live")
async def dashboard_live(user: dict = Depends(require_staff)):
    tz = await get_tz()
    today = await local_today(tz)
    employees = await db.users.find({"active": True}, {"_id": 0}).to_list(1000)
    cards = await db.timecards.find({"date": today}, {"_id": 0}).to_list(2000)
    by_user = {}
    for c in cards:
        by_user.setdefault(c["user_id"], []).append(c)
    working = on_break = not_in = late = 0
    total_seconds = 0
    emp_status = []
    for emp in employees:
        ucards = by_user.get(emp["id"], [])
        u_seconds = 0
        status = "clocked_out"
        clock_in_time = None
        late_min = 0
        for c in ucards:
            u_seconds += await compute_worked_seconds(c)
            if c["status"] in ("clocked_in", "on_break"):
                status = c["status"]
                clock_in_time = c["clock_in"]
                late_min = c.get("late_minutes", 0)
            if c.get("late_minutes", 0) > 0:
                late_min = max(late_min, c.get("late_minutes", 0))
        total_seconds += u_seconds
        if status == "clocked_in":
            working += 1
        elif status == "on_break":
            on_break += 1
        else:
            if not ucards:
                not_in += 1
        is_late = late_min > 0
        if is_late:
            late += 1
        emp_status.append({
            "id": emp["id"],
            "full_name": emp["full_name"],
            "role": emp["role"],
            "avatar": emp.get("avatar", ""),
            "status": status,
            "clock_in_time": clock_in_time,
            "worked_hours": round(u_seconds / 3600, 2),
            "late_minutes": late_min,
            "is_late": is_late,
        })
    emp_status.sort(key=lambda x: (0 if x["status"] in ("clocked_in", "on_break") else 1, x["full_name"]))
    return {
        "date": today,
        "stats": {
            "currently_working": working,
            "on_break": on_break,
            "not_clocked_in": len(employees) - working - on_break,
            "late": late,
            "total_hours": round(total_seconds / 3600, 2),
        },
        "employees": emp_status,
    }

@api_router.get("/dashboard/activity")
async def recent_activity(user: dict = Depends(require_staff)):
    tz = await get_tz()
    today = await local_today(tz)
    cards = await db.timecards.find({"date": today}, {"_id": 0}).to_list(500)
    users = {u["id"]: u["full_name"] for u in await db.users.find({}, {"_id": 0}).to_list(1000)}
    events = []
    for c in cards:
        name = users.get(c["user_id"], "Unknown")
        if c.get("clock_in"):
            events.append({"name": name, "action": "Clocked In", "time": c["clock_in"], "type": "clock_in"})
        for b in c.get("breaks", []):
            events.append({"name": name, "action": "Break Start", "time": b["start"], "type": "start_break"})
            if b.get("end"):
                events.append({"name": name, "action": "Break End", "time": b["end"], "type": "end_break"})
        if c.get("clock_out"):
            events.append({"name": name, "action": "Clocked Out", "time": c["clock_out"], "type": "clock_out"})
    events.sort(key=lambda x: x["time"], reverse=True)
    return events[:30]

# ---------------- Timecards / Attendance ----------------

@api_router.get("/timecards")
async def list_timecards(start: Optional[str] = None, end: Optional[str] = None, user_id: Optional[str] = None,
                         status: Optional[str] = None, late: Optional[bool] = None, missing_out: Optional[bool] = None,
                         user: dict = Depends(require_staff)):
    tz = await get_tz()
    q = {}
    if start and end:
        q["date"] = {"$gte": start, "$lte": end}
    elif start:
        q["date"] = start
    if user_id:
        q["user_id"] = user_id
    if status:
        q["status"] = status
    if late:
        q["late_minutes"] = {"$gt": 0}
    cards = await db.timecards.find(q, {"_id": 0}).sort("clock_in", -1).to_list(3000)
    if missing_out:
        cards = [c for c in cards if not c.get("clock_out")]
    users = {u["id"]: u for u in await db.users.find({}, {"_id": 0}).to_list(1000)}
    out = []
    for c in cards:
        e = await enrich_timecard(c, tz)
        u = users.get(c["user_id"], {})
        e["employee_name"] = u.get("full_name", "Unknown")
        e["employee_id_code"] = u.get("employee_id", "")
        out.append(e)
    return out

class TimecardCreate(BaseModel):
    user_id: str
    date: str
    clock_in: str  # ISO
    clock_out: Optional[str] = None
    reason: str

class TimecardEdit(BaseModel):
    clock_in: Optional[str] = None
    clock_out: Optional[str] = None
    breaks: Optional[List[dict]] = None
    reason: str

@api_router.post("/timecards")
async def create_timecard(body: TimecardCreate, user: dict = Depends(require_owner)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": body.user_id,
        "date": body.date,
        "clock_in": parse_iso(body.clock_in).isoformat(),
        "clock_out": parse_iso(body.clock_out).isoformat() if body.clock_out else None,
        "breaks": [],
        "status": "clocked_out" if body.clock_out else "clocked_in",
        "scheduled_start": None,
        "scheduled_end": None,
        "late_minutes": 0,
        "edited": True,
        "created_at": iso(now_utc()),
    }
    await db.timecards.insert_one(doc)
    await write_audit("timecard", doc["id"], "manual_create", user, reason=body.reason,
                      changes=[{"field": "record", "original": "none", "new": "manually created entry"}])
    tz = await get_tz()
    return await enrich_timecard(doc, tz)

@api_router.put("/timecards/{tc_id}")
async def edit_timecard(tc_id: str, body: TimecardEdit, user: dict = Depends(require_owner)):
    tc = await db.timecards.find_one({"id": tc_id})
    if not tc:
        raise HTTPException(status_code=404, detail="Record not found")
    upd = {}
    changes = []
    if body.clock_in is not None:
        new_ci = parse_iso(body.clock_in).isoformat()
        if new_ci != tc.get("clock_in"):
            changes.append({"field": "clock_in", "original": tc.get("clock_in"), "new": new_ci})
            upd["clock_in"] = new_ci
    if body.clock_out is not None:
        new_co = parse_iso(body.clock_out).isoformat() if body.clock_out else None
        if new_co != tc.get("clock_out"):
            changes.append({"field": "clock_out", "original": tc.get("clock_out"), "new": new_co})
            upd["clock_out"] = new_co
            upd["status"] = "clocked_out" if new_co else tc.get("status", "clocked_in")
    if body.breaks is not None:
        changes.append({"field": "breaks", "original": str(tc.get("breaks", [])), "new": str(body.breaks)})
        upd["breaks"] = body.breaks
    if not upd:
        raise HTTPException(status_code=400, detail="No changes provided")
    upd["edited"] = True
    await db.timecards.update_one({"id": tc_id}, {"$set": upd})
    await write_audit("timecard", tc_id, "edit", user, reason=body.reason, changes=changes)
    updated = await db.timecards.find_one({"id": tc_id}, {"_id": 0})
    tz = await get_tz()
    return await enrich_timecard(updated, tz)

@api_router.delete("/timecards/{tc_id}")
async def delete_timecard(tc_id: str, reason: str = Query(...), user: dict = Depends(require_owner)):
    tc = await db.timecards.find_one({"id": tc_id}, {"_id": 0})
    if not tc:
        raise HTTPException(status_code=404, detail="Record not found")
    await write_audit("timecard", tc_id, "delete", user, reason=reason,
                      changes=[{"field": "record", "original": str({k: tc.get(k) for k in ["date", "clock_in", "clock_out"]}), "new": "deleted"}])
    await db.timecards.delete_one({"id": tc_id})
    return {"ok": True}

# ---------------- Reports / Payroll ----------------

def resolve_range(range_key: str, tz: ZoneInfo, start: Optional[str], end: Optional[str]):
    today = datetime.now(tz).date()
    if range_key == "custom" and start and end:
        return start, end
    if range_key == "today":
        return today.isoformat(), today.isoformat()
    if range_key == "yesterday":
        y = today - timedelta(days=1)
        return y.isoformat(), y.isoformat()
    if range_key == "this_week":
        s = today - timedelta(days=today.weekday())
        return s.isoformat(), today.isoformat()
    if range_key == "last_week":
        s = today - timedelta(days=today.weekday() + 7)
        e = s + timedelta(days=6)
        return s.isoformat(), e.isoformat()
    if range_key == "this_month":
        s = today.replace(day=1)
        return s.isoformat(), today.isoformat()
    return today.isoformat(), today.isoformat()

async def build_report(range_key, start, end, user_id, tz):
    s, e = resolve_range(range_key, tz, start, end)
    q = {"date": {"$gte": s, "$lte": e}}
    if user_id:
        q["user_id"] = user_id
    cards = await db.timecards.find(q, {"_id": 0}).to_list(5000)
    users = {u["id"]: u for u in await db.users.find({}, {"_id": 0}).to_list(1000)}
    agg = {}
    for c in cards:
        uid = c["user_id"]
        if uid not in agg:
            u = users.get(uid, {})
            agg[uid] = {
                "user_id": uid,
                "employee_name": u.get("full_name", "Unknown"),
                "employee_id_code": u.get("employee_id", ""),
                "hourly_rate": u.get("hourly_rate", 0),
                "worked_seconds": 0, "break_seconds": 0,
                "late_arrivals": 0, "shifts": 0, "missing_out": 0,
            }
        worked = await compute_worked_seconds(c)
        agg[uid]["worked_seconds"] += worked
        for b in c.get("breaks", []):
            bs = parse_iso(b["start"])
            be = parse_iso(b["end"]) if b.get("end") else bs
            agg[uid]["break_seconds"] += max(0, int((be - bs).total_seconds()))
        if c.get("late_minutes", 0) > 0:
            agg[uid]["late_arrivals"] += 1
        if not c.get("clock_out"):
            agg[uid]["missing_out"] += 1
        agg[uid]["shifts"] += 1
    rows = []
    for r in agg.values():
        hours = round(r["worked_seconds"] / 3600, 2)
        rate = r["hourly_rate"] or 0
        rows.append({
            "user_id": r["user_id"],
            "employee_name": r["employee_name"],
            "employee_id_code": r["employee_id_code"],
            "total_hours": hours,
            "break_hours": round(r["break_seconds"] / 3600, 2),
            "late_arrivals": r["late_arrivals"],
            "missing_out": r["missing_out"],
            "shifts": r["shifts"],
            "hourly_rate": rate,
            "estimated_pay": round(hours * rate, 2),
        })
    rows.sort(key=lambda x: x["employee_name"])
    return {"start": s, "end": e, "rows": rows,
            "totals": {
                "total_hours": round(sum(r["total_hours"] for r in rows), 2),
                "estimated_pay": round(sum(r["estimated_pay"] for r in rows), 2),
                "late_arrivals": sum(r["late_arrivals"] for r in rows),
            }}

@api_router.get("/reports")
async def reports(range_key: str = "today", start: Optional[str] = None, end: Optional[str] = None,
                  user_id: Optional[str] = None, user: dict = Depends(require_staff)):
    tz = await get_tz()
    return await build_report(range_key, start, end, user_id, tz)

@api_router.get("/payroll")
async def payroll(range_key: str = "this_week", start: Optional[str] = None, end: Optional[str] = None,
                  user: dict = Depends(require_staff)):
    settings = await get_settings()
    if user["role"] == "supervisor" and not settings.get("supervisor_can_view_payroll", False):
        raise HTTPException(status_code=403, detail="Not permitted to view payroll")
    tz = await get_tz()
    return await build_report(range_key, start, end, None, tz)

@api_router.get("/reports/export")
async def export_report(fmt: str = "csv", range_key: str = "today", start: Optional[str] = None,
                        end: Optional[str] = None, user: dict = Depends(require_staff)):
    tz = await get_tz()
    settings = await get_settings()
    report = await build_report(range_key, start, end, None, tz)
    if fmt == "csv":
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["Employee", "Employee ID", "Total Hours", "Break Hours", "Late Arrivals", "Missing Clock-Out", "Shifts", "Hourly Rate", "Estimated Pay"])
        for r in report["rows"]:
            w.writerow([r["employee_name"], r["employee_id_code"], r["total_hours"], r["break_hours"],
                        r["late_arrivals"], r["missing_out"], r["shifts"], r["hourly_rate"], r["estimated_pay"]])
        w.writerow([])
        w.writerow(["TOTAL", "", report["totals"]["total_hours"], "", report["totals"]["late_arrivals"], "", "", "", report["totals"]["estimated_pay"]])
        buf.seek(0)
        return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                                 headers={"Content-Disposition": f"attachment; filename=report_{report['start']}_{report['end']}.csv"})
    else:
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=letter, topMargin=0.6 * inch)
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle("t", parent=styles["Title"], textColor=colors.HexColor("#111111"))
        elems = [Paragraph(settings.get("store_name", "Southgate Smoke Shop"), title_style),
                 Paragraph(f"Attendance & Payroll Report — {report['start']} to {report['end']}", styles["Normal"]),
                 Spacer(1, 16)]
        data = [["Employee", "Hours", "Breaks", "Late", "Miss", "Rate", "Est. Pay"]]
        for r in report["rows"]:
            data.append([r["employee_name"], r["total_hours"], r["break_hours"], r["late_arrivals"],
                         r["missing_out"], f"${r['hourly_rate']}", f"${r['estimated_pay']}"])
        data.append(["TOTAL", report["totals"]["total_hours"], "", report["totals"]["late_arrivals"], "", "", f"${report['totals']['estimated_pay']}"])
        t = Table(data, repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111827")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#f3f4f6")]),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#fde68a")),
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ]))
        elems.append(t)
        elems.append(Spacer(1, 12))
        elems.append(Paragraph("Estimated pay is for reference only. No overtime multiplier applied — all hours counted as worked.", styles["Italic"]))
        doc.build(elems)
        buf.seek(0)
        return StreamingResponse(buf, media_type="application/pdf",
                                 headers={"Content-Disposition": f"attachment; filename=report_{report['start']}_{report['end']}.pdf"})

# ---------------- Audit logs ----------------

@api_router.get("/audit-logs")
async def get_audit_logs(entity: Optional[str] = None, entity_id: Optional[str] = None, user: dict = Depends(require_staff)):
    q = {}
    if entity:
        q["entity"] = entity
    if entity_id:
        q["entity_id"] = entity_id
    logs = await db.audit_logs.find(q, {"_id": 0}).sort("timestamp", -1).to_list(1000)
    return logs

# ---------------- Settings ----------------

class SettingsBody(BaseModel):
    store_name: Optional[str] = None
    store_address: Optional[str] = None
    timezone: Optional[str] = None
    late_grace_minutes: Optional[int] = None
    pay_period: Optional[str] = None
    supervisor_can_view_payroll: Optional[bool] = None

@api_router.get("/settings")
async def read_settings(user: dict = Depends(require_staff)):
    return await get_settings()

@api_router.put("/settings")
async def update_settings(body: SettingsBody, user: dict = Depends(require_owner)):
    current = await get_settings()
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    merged = {**current, **upd}
    merged["id"] = "store"
    await db.settings.update_one({"id": "store"}, {"$set": merged}, upsert=True)
    await write_audit("settings", "store", "update", user, reason="Settings updated",
                      changes=[{"field": k, "original": str(current.get(k)), "new": str(v)} for k, v in upd.items()])
    return merged

# ---------------- Employee self endpoints (via kiosk verify) ----------------

@api_router.post("/kiosk/my-timesheet")
async def my_timesheet(body: KioskVerify):
    user = await find_employee_by_identifier(body.identifier)
    if not user or not verify_secret(body.pin, user.get("pin_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid ID or PIN")
    tz = await get_tz()
    today = datetime.now(tz).date()
    start = (today - timedelta(days=13)).isoformat()
    cards = await db.timecards.find({"user_id": user["id"], "date": {"$gte": start}}, {"_id": 0}).sort("clock_in", -1).to_list(200)
    enriched = [await enrich_timecard(c, tz) for c in cards]
    scheds = await db.schedules.find({"user_id": user["id"], "date": {"$gte": today.isoformat()}}, {"_id": 0}).sort("date", 1).to_list(30)
    total = sum(c["worked_seconds"] for c in enriched)
    return {"employee": public_user(user), "timecards": enriched, "schedules": scheds, "total_hours": round(total / 3600, 2)}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await db.users.create_index("employee_id", unique=True)
    await db.users.create_index("username")
    await db.timecards.create_index([("user_id", 1), ("date", 1)])
    await db.schedules.create_index([("user_id", 1), ("date", 1)])
    await get_settings()
    owner_username = os.environ.get("OWNER_USERNAME", "owner").lower()
    existing = await db.users.find_one({"username": owner_username})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "full_name": "Store Owner",
            "employee_id": "OWNER001",
            "username": owner_username,
            "pin_hash": hash_secret(os.environ.get("OWNER_PIN", "4321")),
            "password_hash": hash_secret(os.environ.get("OWNER_PASSWORD", "Owner@2025")),
            "phone": "",
            "email": os.environ.get("OWNER_EMAIL", ""),
            "role": "owner",
            "hourly_rate": 0,
            "hire_date": datetime.now(timezone.utc).date().isoformat(),
            "active": True,
            "avatar": "",
            "created_at": iso(now_utc()),
        })
        logger.info("Seeded default owner account")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
