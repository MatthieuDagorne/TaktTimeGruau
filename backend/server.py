from fastapi import FastAPI, APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import csv
import io

# Paris timezone for local time calculations
PARIS_TZ = ZoneInfo("Europe/Paris")

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, line_id: str):
        await websocket.accept()
        if line_id not in self.active_connections:
            self.active_connections[line_id] = []
        self.active_connections[line_id].append(websocket)

    def disconnect(self, websocket: WebSocket, line_id: str):
        if line_id in self.active_connections:
            if websocket in self.active_connections[line_id]:
                self.active_connections[line_id].remove(websocket)

    async def broadcast(self, line_id: str, message: dict):
        if line_id in self.active_connections:
            disconnected = []
            for connection in self.active_connections[line_id]:
                try:
                    await connection.send_json(message)
                except:
                    disconnected.append(connection)
            for conn in disconnected:
                self.disconnect(conn, line_id)

manager = ConnectionManager()

# ==================== MODELS ====================

# Site Model
class SiteBase(BaseModel):
    name: str
    location: str = ""
    description: str = ""
    timezone: str = "Europe/Paris"  # Default timezone for the site

class SiteCreate(SiteBase):
    pass

class Site(SiteBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# TV Screen Model
class TVScreenBase(BaseModel):
    name: str
    ip_address: str
    line_id: str
    position: str = ""  # Position sur la ligne (début, milieu, fin)
    is_active: bool = True

class TVScreenCreate(TVScreenBase):
    pass

class TVScreen(TVScreenBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    last_ping: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Daily Schedule for different days
class DaySchedule(BaseModel):
    day_start: str = "08:00"
    day_end: str = "17:00"
    is_working_day: bool = True
    breaks: List[Dict] = Field(default_factory=list)

class WeeklySchedule(BaseModel):
    monday: DaySchedule = Field(default_factory=lambda: DaySchedule(day_start="08:00", day_end="17:00"))
    tuesday: DaySchedule = Field(default_factory=lambda: DaySchedule(day_start="08:00", day_end="17:00"))
    wednesday: DaySchedule = Field(default_factory=lambda: DaySchedule(day_start="08:00", day_end="17:00"))
    thursday: DaySchedule = Field(default_factory=lambda: DaySchedule(day_start="08:00", day_end="17:00"))
    friday: DaySchedule = Field(default_factory=lambda: DaySchedule(day_start="08:00", day_end="16:00"))
    saturday: DaySchedule = Field(default_factory=lambda: DaySchedule(is_working_day=False))
    sunday: DaySchedule = Field(default_factory=lambda: DaySchedule(is_working_day=False))

# Team/Shift Configuration - Each team has its own schedule settings
class TeamShift(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = "Équipe Matin"
    day_start: str = "06:00"
    day_end: str = "14:00"
    takt_duration: int = 30  # Each team can have different takt duration
    breaks: List[Dict] = Field(default_factory=lambda: [
        {"name": "Pause Matin", "start_time": "09:00", "duration": 15, "trigger_mode": "immediate"},
        {"name": "Pause Midi", "start_time": "12:00", "duration": 30, "trigger_mode": "immediate"}
    ])
    is_active: bool = True

class ShiftOrganization(BaseModel):
    type: str = "1x8"  # 1x8, 2x8, 3x8
    teams: List[TeamShift] = Field(default_factory=lambda: [
        TeamShift(name="Équipe Standard", day_start="08:00", day_end="17:00")
    ])
    active_team_id: Optional[str] = None  # Currently active team

# Legacy TeamConfig for backward compatibility
class TeamConfig(BaseModel):
    name: str = "Équipe Standard"
    shift_type: str = "1x8"  # 1x8, 2x8, 3x8
    weekly_schedule: WeeklySchedule = Field(default_factory=WeeklySchedule)

class BreakConfig(BaseModel):
    name: str = ""
    start_time: str = ""
    duration: int = 0
    trigger_mode: str = "immediate"  # "immediate" = at scheduled time, "end_of_takt" = at end of next takt

class SoundAlertConfig(BaseModel):
    takt_start: bool = True
    minutes_before_takt_end: int = 5
    takt_end: bool = True
    break_start: bool = True
    minutes_before_break_end: int = 5
    break_end: bool = True

class TaktState(BaseModel):
    status: str = "idle"
    current_takt: int = 0
    takt_start_time: Optional[str] = None
    elapsed_seconds: int = 0
    paused_at: Optional[str] = None
    current_break_name: Optional[str] = None
    break_duration_minutes: Optional[int] = None
    break_start_time: Optional[str] = None
    break_end_time: Optional[str] = None
    # Carryover from previous day - stores unfinished takt info
    carryover_takt: Optional[int] = None
    carryover_elapsed_seconds: Optional[int] = None
    carryover_date: Optional[str] = None  # Date when carryover was saved (YYYY-MM-DD)

# Production Line Model (updated)
class ProductionLineBase(BaseModel):
    name: str
    site_id: str = ""
    takt_duration: int = 30  # Default takt duration (can be overridden per team)
    team_config: TeamConfig = Field(default_factory=TeamConfig)  # Legacy
    shift_organization: ShiftOrganization = Field(default_factory=ShiftOrganization)  # New multi-team support
    breaks: List[BreakConfig] = Field(default_factory=lambda: [
        BreakConfig(name="Pause Matin", start_time="10:00", duration=15),
        BreakConfig(name="Pause Midi", start_time="12:00", duration=60),
        BreakConfig(name="Pause Après-midi", start_time="15:00", duration=15)
    ])
    auto_start_at_day_begin: bool = False
    auto_resume_after_break: bool = True
    auto_resume_after_takt: bool = True
    sound_alerts: SoundAlertConfig = Field(default_factory=SoundAlertConfig)

class ProductionLineCreate(ProductionLineBase):
    pass

class ProductionLineUpdate(BaseModel):
    name: Optional[str] = None
    site_id: Optional[str] = None
    takt_duration: Optional[int] = None
    team_config: Optional[TeamConfig] = None
    shift_organization: Optional[ShiftOrganization] = None
    breaks: Optional[List[BreakConfig]] = None
    auto_start_at_day_begin: Optional[bool] = None
    auto_resume_after_break: Optional[bool] = None
    auto_resume_after_takt: Optional[bool] = None
    sound_alerts: Optional[SoundAlertConfig] = None

class ProductionLine(ProductionLineBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    state: TaktState = Field(default_factory=TaktState)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Takt Event Log Model
class TaktEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    line_id: str
    site_id: str = ""
    event_type: str  # takt_start, takt_end, takt_pause, takt_resume, break_start, break_end, takt_overtime
    takt_number: int = 0
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    duration_seconds: int = 0
    expected_duration_seconds: int = 0
    is_overtime: bool = False
    overtime_seconds: int = 0
    details: Dict = Field(default_factory=dict)

# Statistics Models
class TaktStatistics(BaseModel):
    line_id: str
    line_name: str
    period_start: str
    period_end: str
    total_takts: int = 0
    completed_takts: int = 0
    average_duration_seconds: float = 0
    expected_duration_seconds: int = 0
    total_overtime_seconds: int = 0
    overtime_count: int = 0
    on_time_count: int = 0
    on_time_percentage: float = 0
    average_overtime_seconds: float = 0
    total_pause_time_seconds: int = 0
    total_break_time_seconds: int = 0

# ==================== HELPER FUNCTIONS ====================

def get_day_schedule(line: dict, day_name: str = None) -> dict:
    """Get schedule for a specific day using Paris timezone"""
    if day_name is None:
        # Use Paris timezone to determine the current day
        paris_now = datetime.now(PARIS_TZ)
        day_name = paris_now.strftime('%A').lower()
    
    team_config = line.get('team_config', {})
    weekly_schedule = team_config.get('weekly_schedule', {})
    
    day_map = {
        'monday': 'monday', 'tuesday': 'tuesday', 'wednesday': 'wednesday',
        'thursday': 'thursday', 'friday': 'friday', 'saturday': 'saturday', 'sunday': 'sunday'
    }
    
    day_key = day_map.get(day_name, 'monday')
    day_schedule = weekly_schedule.get(day_key, {})
    
    return {
        'day_start': day_schedule.get('day_start', '08:00'),
        'day_end': day_schedule.get('day_end', '17:00'),
        'is_working_day': day_schedule.get('is_working_day', True),
        'breaks': day_schedule.get('breaks', line.get('breaks', []))
    }

def get_current_paris_time() -> datetime:
    """Get current time in Paris timezone"""
    return datetime.now(PARIS_TZ)

def get_current_paris_day() -> str:
    """Get current day name in Paris timezone (lowercase)"""
    return datetime.now(PARIS_TZ).strftime('%A').lower()

def time_to_minutes(time_str: str) -> int:
    """Convert time string (HH:MM) to minutes since midnight"""
    if not time_str:
        return 0
    parts = time_str.split(':')
    return int(parts[0]) * 60 + int(parts[1])

def is_time_in_shift(current_time_str: str, shift_start: str, shift_end: str) -> bool:
    """Check if current time is within a shift's working hours"""
    current_min = time_to_minutes(current_time_str)
    start_min = time_to_minutes(shift_start)
    end_min = time_to_minutes(shift_end)
    
    # Handle overnight shifts (e.g., 22:00 - 06:00)
    if end_min < start_min:
        return current_min >= start_min or current_min < end_min
    return start_min <= current_min < end_min

def get_active_team_for_current_time(line: dict) -> Optional[dict]:
    """Get the active team - prioritizes manually set active_team_id"""
    shift_org = line.get('shift_organization', {})
    teams = shift_org.get('teams', [])
    
    if not teams:
        return None
    
    # First priority: manually set active_team_id
    active_team_id = shift_org.get('active_team_id')
    if active_team_id:
        for team in teams:
            if team.get('id') == active_team_id:
                return team
    
    # Fallback to first team
    return teams[0] if teams else None

def calculate_estimated_takts(line: dict, day_name: str = None) -> int:
    """Calculate estimated number of takts for the day based on active team"""
    try:
        # Get active team to use their takt_duration
        active_team = get_active_team_for_current_time(line)
        
        if active_team:
            day_start = active_team.get('day_start', '08:00')
            day_end = active_team.get('day_end', '17:00')
            takt_duration = active_team.get('takt_duration', 30)
            breaks = active_team.get('breaks', [])
        else:
            # Fallback to line-level config
            schedule = get_day_schedule(line, day_name)
            if not schedule.get('is_working_day', True):
                return 0
            day_start = schedule['day_start']
            day_end = schedule['day_end']
            takt_duration = line.get('takt_duration', 30)
            breaks = schedule.get('breaks', line.get('breaks', []))
        
        day_start_parts = day_start.split(":")
        day_end_parts = day_end.split(":")
        
        start_minutes = int(day_start_parts[0]) * 60 + int(day_start_parts[1])
        end_minutes = int(day_end_parts[0]) * 60 + int(day_end_parts[1])
        
        # Handle overnight shifts
        if end_minutes < start_minutes:
            total_work_minutes = (24 * 60 - start_minutes) + end_minutes
        else:
            total_work_minutes = end_minutes - start_minutes
        
        # Subtract breaks
        for break_config in breaks:
            duration = break_config.get('duration', 0) if isinstance(break_config, dict) else break_config.duration
            if duration > 0:
                total_work_minutes -= duration
        
        if total_work_minutes <= 0 or takt_duration <= 0:
            return 0
            
        return total_work_minutes // takt_duration
    except:
        return 0

async def log_takt_event(
    line_id: str,
    site_id: str,
    event_type: str,
    takt_number: int = 0,
    duration_seconds: int = 0,
    expected_duration_seconds: int = 0,
    details: dict = None
):
    """Log a takt event to the database"""
    is_overtime = duration_seconds > expected_duration_seconds if expected_duration_seconds > 0 else False
    overtime_seconds = max(0, duration_seconds - expected_duration_seconds) if is_overtime else 0
    
    event = TaktEvent(
        line_id=line_id,
        site_id=site_id,
        event_type=event_type,
        takt_number=takt_number,
        duration_seconds=duration_seconds,
        expected_duration_seconds=expected_duration_seconds,
        is_overtime=is_overtime,
        overtime_seconds=overtime_seconds,
        details=details or {}
    )
    
    doc = event.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.takt_events.insert_one(doc)
    return event

# ==================== SITE ENDPOINTS ====================

@api_router.get("/")
async def root():
    return {"message": "Takt Time API v2"}

@api_router.get("/server-time")
async def get_server_time():
    """Get current server time in UTC and Paris timezone"""
    utc_now = datetime.now(timezone.utc)
    paris_now = datetime.now(PARIS_TZ)
    return {
        "utc": utc_now.isoformat(),
        "paris": paris_now.isoformat(),
        "paris_day": paris_now.strftime('%A').lower(),
        "paris_time": paris_now.strftime('%H:%M'),
        "timezone": "Europe/Paris"
    }

@api_router.post("/sites", response_model=dict)
async def create_site(site_data: SiteCreate):
    site = Site(**site_data.model_dump())
    doc = site.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.sites.insert_one(doc)
    created = await db.sites.find_one({"id": site.id}, {"_id": 0})
    return created

@api_router.get("/sites", response_model=List[dict])
async def get_sites():
    sites = await db.sites.find({}, {"_id": 0}).to_list(100)
    # Add line count for each site
    for site in sites:
        line_count = await db.production_lines.count_documents({"site_id": site['id']})
        site['line_count'] = line_count
    return sites

@api_router.get("/sites/{site_id}", response_model=dict)
async def get_site(site_id: str):
    site = await db.sites.find_one({"id": site_id}, {"_id": 0})
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return site

@api_router.put("/sites/{site_id}", response_model=dict)
async def update_site(site_id: str, update_data: SiteCreate):
    existing = await db.sites.find_one({"id": site_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Site not found")
    
    await db.sites.update_one({"id": site_id}, {"$set": update_data.model_dump()})
    updated = await db.sites.find_one({"id": site_id}, {"_id": 0})
    return updated

@api_router.delete("/sites/{site_id}")
async def delete_site(site_id: str):
    # Check if site has lines
    line_count = await db.production_lines.count_documents({"site_id": site_id})
    if line_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete site with {line_count} lines. Delete lines first.")
    
    result = await db.sites.delete_one({"id": site_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Site not found")
    return {"message": "Site deleted"}

# ==================== TV SCREEN ENDPOINTS ====================

@api_router.post("/screens", response_model=dict)
async def create_screen(screen_data: TVScreenCreate):
    screen = TVScreen(**screen_data.model_dump())
    doc = screen.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.tv_screens.insert_one(doc)
    created = await db.tv_screens.find_one({"id": screen.id}, {"_id": 0})
    return created

@api_router.get("/screens", response_model=List[dict])
async def get_screens(line_id: Optional[str] = None):
    query = {}
    if line_id:
        query["line_id"] = line_id
    screens = await db.tv_screens.find(query, {"_id": 0}).to_list(100)
    return screens

@api_router.get("/screens/{screen_id}", response_model=dict)
async def get_screen(screen_id: str):
    screen = await db.tv_screens.find_one({"id": screen_id}, {"_id": 0})
    if not screen:
        raise HTTPException(status_code=404, detail="Screen not found")
    return screen

@api_router.put("/screens/{screen_id}", response_model=dict)
async def update_screen(screen_id: str, update_data: TVScreenCreate):
    existing = await db.tv_screens.find_one({"id": screen_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Screen not found")
    
    await db.tv_screens.update_one({"id": screen_id}, {"$set": update_data.model_dump()})
    updated = await db.tv_screens.find_one({"id": screen_id}, {"_id": 0})
    return updated

@api_router.delete("/screens/{screen_id}")
async def delete_screen(screen_id: str):
    result = await db.tv_screens.delete_one({"id": screen_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Screen not found")
    return {"message": "Screen deleted"}

@api_router.post("/screens/{screen_id}/ping")
async def ping_screen(screen_id: str):
    """Update last ping time for a screen"""
    now = datetime.now(timezone.utc).isoformat()
    result = await db.tv_screens.update_one(
        {"id": screen_id},
        {"$set": {"last_ping": now}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Screen not found")
    return {"message": "Ping recorded", "timestamp": now}

# ==================== PRODUCTION LINE ENDPOINTS ====================

@api_router.post("/lines", response_model=dict)
async def create_line(line_data: ProductionLineCreate):
    line = ProductionLine(**line_data.model_dump())
    doc = line.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.production_lines.insert_one(doc)
    created = await db.production_lines.find_one({"id": line.id}, {"_id": 0})
    created['estimated_takts'] = calculate_estimated_takts(created)
    return created

@api_router.get("/lines", response_model=List[dict])
async def get_lines(site_id: Optional[str] = None):
    query = {}
    if site_id:
        query["site_id"] = site_id
    lines = await db.production_lines.find(query, {"_id": 0}).to_list(100)
    for line in lines:
        line['estimated_takts'] = calculate_estimated_takts(line)
        # Add screen count
        screen_count = await db.tv_screens.count_documents({"line_id": line['id']})
        line['screen_count'] = screen_count
    return lines

@api_router.get("/lines/{line_id}", response_model=dict)
async def get_line(line_id: str):
    line = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    line['estimated_takts'] = calculate_estimated_takts(line)
    return line

@api_router.put("/lines/{line_id}", response_model=dict)
async def update_line(line_id: str, update_data: ProductionLineUpdate):
    existing = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Line not found")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    # Handle nested models
    if 'breaks' in update_dict:
        update_dict['breaks'] = [b.model_dump() if hasattr(b, 'model_dump') else b for b in update_dict['breaks']]
    if 'sound_alerts' in update_dict:
        update_dict['sound_alerts'] = update_dict['sound_alerts'].model_dump() if hasattr(update_dict['sound_alerts'], 'model_dump') else update_dict['sound_alerts']
    if 'team_config' in update_dict:
        update_dict['team_config'] = update_dict['team_config'].model_dump() if hasattr(update_dict['team_config'], 'model_dump') else update_dict['team_config']
    
    if update_dict:
        await db.production_lines.update_one({"id": line_id}, {"$set": update_dict})
    
    updated = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    updated['estimated_takts'] = calculate_estimated_takts(updated)
    
    await manager.broadcast(line_id, {"type": "config_update", "data": updated})
    return updated

@api_router.delete("/lines/{line_id}")
async def delete_line(line_id: str):
    # Delete associated screens
    await db.tv_screens.delete_many({"line_id": line_id})
    
    result = await db.production_lines.delete_one({"id": line_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Line not found")
    return {"message": "Line deleted"}

# ==================== TAKT CONTROL ENDPOINTS ====================

@api_router.get("/lines/{line_id}/auto-start-check")
async def check_auto_start(line_id: str):
    """Check if the line should be auto-started based on current time and settings"""
    line = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    
    # Get site timezone (default to Paris)
    site_tz_str = "Europe/Paris"
    if line.get('site_id'):
        site = await db.sites.find_one({"id": line['site_id']}, {"_id": 0})
        if site:
            site_tz_str = site.get('timezone', 'Europe/Paris')
    
    try:
        site_tz = ZoneInfo(site_tz_str)
    except:
        site_tz = PARIS_TZ
    
    now_local = datetime.now(site_tz)
    current_time_str = now_local.strftime('%H:%M')
    current_day = now_local.strftime('%A').lower()
    
    # Check if auto-start is enabled
    auto_start_enabled = line.get('auto_start_at_day_begin', False)
    
    # Get active team
    active_team = get_active_team_for_current_time(line)
    
    if not active_team:
        return {
            "should_auto_start": False,
            "reason": "No active team found",
            "current_time": current_time_str,
            "timezone": site_tz_str
        }
    
    day_start = active_team.get('day_start', '08:00')
    day_end = active_team.get('day_end', '17:00')
    takt_duration = active_team.get('takt_duration', 30)
    
    # Check if we're within working hours
    is_within_hours = is_time_in_shift(current_time_str, day_start, day_end)
    
    # Current state
    state = line.get('state', {})
    current_status = state.get('status', 'idle')
    
    # Calculate how many takts should have elapsed since day_start
    if is_within_hours and auto_start_enabled and current_status == 'idle':
        start_minutes = time_to_minutes(day_start)
        current_minutes = time_to_minutes(current_time_str)
        today_date = now_local.strftime('%Y-%m-%d')
        
        # Check for carryover from previous day (within first 5 minutes of day start)
        carryover_takt = state.get('carryover_takt')
        carryover_elapsed = state.get('carryover_elapsed_seconds', 0)
        carryover_date = state.get('carryover_date')
        
        # Use carryover if:
        # 1. There's a carryover saved
        # 2. Carryover is from yesterday or earlier (not today)
        # 3. We're within the first 5 minutes of day start
        minutes_since_start = current_minutes - start_minutes if current_minutes >= start_minutes else 0
        use_carryover = (
            carryover_takt is not None and 
            carryover_date is not None and 
            carryover_date != today_date and
            minutes_since_start <= 5
        )
        
        if use_carryover:
            return {
                "should_auto_start": True,
                "reason": "Carryover from previous day",
                "current_time": current_time_str,
                "timezone": site_tz_str,
                "day_start": day_start,
                "day_end": day_end,
                "expected_takt": carryover_takt,
                "elapsed_in_current_takt_minutes": carryover_elapsed // 60,
                "elapsed_in_current_takt_seconds": carryover_elapsed,
                "takt_duration": takt_duration,
                "active_team": active_team.get('name'),
                "is_carryover": True,
                "carryover_date": carryover_date
            }
        
        # Normal calculation - no carryover
        # Handle overnight shifts
        if current_minutes < start_minutes:
            elapsed_work_minutes = (24 * 60 - start_minutes) + current_minutes
        else:
            elapsed_work_minutes = current_minutes - start_minutes
        
        # Subtract breaks that have already passed completely
        breaks = active_team.get('breaks', [])
        for brk in breaks:
            break_start = brk.get('start_time', '')
            break_duration = brk.get('duration', 0)
            if break_start and break_duration > 0:
                break_start_min = time_to_minutes(break_start)
                break_end_min = break_start_min + break_duration
                # Only subtract if break has completely passed
                if current_minutes >= break_end_min:
                    elapsed_work_minutes -= break_duration
        
        # Ensure elapsed_work_minutes is not negative
        elapsed_work_minutes = max(0, elapsed_work_minutes)
        
        # Calculate which takt we should be on
        # Takt 1 starts at minute 0, Takt 2 at minute takt_duration, etc.
        if elapsed_work_minutes < takt_duration:
            expected_takt = 1
            elapsed_in_current_takt = elapsed_work_minutes
        else:
            expected_takt = (elapsed_work_minutes // takt_duration) + 1
            elapsed_in_current_takt = elapsed_work_minutes % takt_duration
        
        return {
            "should_auto_start": True,
            "reason": "Within working hours and auto-start enabled",
            "current_time": current_time_str,
            "timezone": site_tz_str,
            "day_start": day_start,
            "day_end": day_end,
            "expected_takt": expected_takt,
            "elapsed_in_current_takt_minutes": elapsed_in_current_takt,
            "elapsed_work_minutes": elapsed_work_minutes,
            "takt_duration": takt_duration,
            "active_team": active_team.get('name')
        }
    
    return {
        "should_auto_start": False,
        "reason": "Outside working hours" if not is_within_hours else ("Auto-start disabled" if not auto_start_enabled else f"Already {current_status}"),
        "current_time": current_time_str,
        "timezone": site_tz_str,
        "is_within_hours": is_within_hours,
        "auto_start_enabled": auto_start_enabled,
        "current_status": current_status,
        "day_start": day_start,
        "day_end": day_end
    }

def minutesToTime(minutes: int) -> str:
    """Convert minutes since midnight to HH:MM string"""
    h = (minutes // 60) % 24
    m = minutes % 60
    return f"{h:02d}:{m:02d}"

@api_router.post("/lines/{line_id}/auto-start")
async def auto_start_takt(line_id: str):
    """Auto-start a takt with the correct takt number based on elapsed time or carryover"""
    check_result = await check_auto_start(line_id)
    
    if not check_result.get('should_auto_start'):
        return {"message": "Auto-start not needed", "details": check_result}
    
    line = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    
    expected_takt = check_result.get('expected_takt', 1)
    takt_duration = check_result.get('takt_duration', 30)
    is_carryover = check_result.get('is_carryover', False)
    
    now = datetime.now(timezone.utc)
    
    if is_carryover:
        # Use carryover elapsed seconds
        elapsed_seconds = check_result.get('elapsed_in_current_takt_seconds', 0)
        takt_start_time = now - timedelta(seconds=elapsed_seconds)
        
        new_state = {
            "status": "running",
            "current_takt": expected_takt,
            "takt_start_time": takt_start_time.isoformat(),
            "elapsed_seconds": elapsed_seconds,
            "paused_at": None,
            # Clear carryover after using it
            "carryover_takt": None,
            "carryover_elapsed_seconds": None,
            "carryover_date": None
        }
        
        await log_takt_event(
            line_id, line.get('site_id', ''), 'takt_start', expected_takt,
            expected_duration_seconds=takt_duration * 60,
            details={
                "auto_started": True,
                "carryover_from": check_result.get('carryover_date'),
                "active_team": check_result.get('active_team')
            }
        )
    else:
        # Normal auto-start calculation
        elapsed_minutes = check_result.get('elapsed_in_current_takt_minutes', 0)
        takt_start_time = now - timedelta(minutes=elapsed_minutes)
        
        new_state = {
            "status": "running",
            "current_takt": expected_takt,
            "takt_start_time": takt_start_time.isoformat(),
            "elapsed_seconds": elapsed_minutes * 60,
            "paused_at": None
        }
        
        await log_takt_event(
            line_id, line.get('site_id', ''), 'takt_start', expected_takt,
            expected_duration_seconds=takt_duration * 60,
            details={
                "auto_started": True,
                "active_team": check_result.get('active_team')
            }
        )
    
    await db.production_lines.update_one({"id": line_id}, {"$set": {"state": new_state}})
    updated = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    await manager.broadcast(line_id, {"type": "state_update", "data": updated})
    
    return {
        "message": "Takt auto-started" + (" (carryover)" if is_carryover else ""),
        "state": new_state,
        "expected_takt": expected_takt,
        "is_carryover": is_carryover
    }

@api_router.post("/lines/{line_id}/start")
async def start_takt(line_id: str):
    line = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    
    state = line.get('state', {})
    current_status = state.get('status', 'idle')
    now = datetime.now(timezone.utc)
    paris_now = get_current_paris_time()
    
    # Get the active team based on current Paris time
    active_team = get_active_team_for_current_time(line)
    takt_duration = active_team.get('takt_duration', 30) if active_team else line.get('takt_duration', 30)
    
    if current_status == 'paused' or current_status == 'break':
        # When resuming, set takt_start_time to NOW and keep elapsed_seconds as the base
        new_state = {
            "status": "running",
            "current_takt": state.get('current_takt', 1),
            "takt_start_time": now.isoformat(),  # Reset to now for correct calculation
            "elapsed_seconds": state.get('elapsed_seconds', 0),  # Keep accumulated time
            "paused_at": None,
            "current_break_name": None,
            "break_end_time": None
        }
        await log_takt_event(line_id, line.get('site_id', ''), 'takt_resume', state.get('current_takt', 1))
    else:
        new_takt = state.get('current_takt', 0) + 1
        new_state = {
            "status": "running",
            "current_takt": new_takt,
            "takt_start_time": now.isoformat(),
            "elapsed_seconds": 0,
            "paused_at": None
        }
        await log_takt_event(
            line_id, line.get('site_id', ''), 'takt_start', new_takt,
            expected_duration_seconds=takt_duration * 60,
            details={
                "active_team": active_team.get('name') if active_team else None,
                "paris_time": paris_now.strftime('%H:%M'),
                "paris_day": paris_now.strftime('%A')
            }
        )
    
    await db.production_lines.update_one({"id": line_id}, {"$set": {"state": new_state}})
    updated = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    await manager.broadcast(line_id, {"type": "state_update", "data": updated})
    
    return {
        "message": "Takt started", 
        "state": new_state,
        "active_team": active_team.get('name') if active_team else None,
        "takt_duration": takt_duration,
        "paris_time": paris_now.strftime('%H:%M')
    }

@api_router.post("/lines/{line_id}/pause")
async def pause_takt(line_id: str):
    line = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    
    state = line.get('state', {})
    if state.get('status') != 'running':
        raise HTTPException(status_code=400, detail="Takt is not running")
    
    now = datetime.now(timezone.utc)
    takt_start = datetime.fromisoformat(state['takt_start_time'].replace('Z', '+00:00'))
    elapsed = state.get('elapsed_seconds', 0) + int((now - takt_start).total_seconds())
    
    new_state = {
        "status": "paused",
        "current_takt": state['current_takt'],
        "takt_start_time": state['takt_start_time'],
        "elapsed_seconds": elapsed,
        "paused_at": now.isoformat()
    }
    
    await log_takt_event(line_id, line.get('site_id', ''), 'takt_pause', state['current_takt'], elapsed)
    await db.production_lines.update_one({"id": line_id}, {"$set": {"state": new_state}})
    
    updated = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    await manager.broadcast(line_id, {"type": "state_update", "data": updated})
    
    return {"message": "Takt paused", "state": new_state}

@api_router.post("/lines/{line_id}/stop")
async def stop_takt(line_id: str):
    line = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    
    state = line.get('state', {})
    current_takt = state.get('current_takt', 0)
    
    # Calculate final duration if was running
    if state.get('status') == 'running' and state.get('takt_start_time'):
        now = datetime.now(timezone.utc)
        takt_start = datetime.fromisoformat(state['takt_start_time'].replace('Z', '+00:00'))
        elapsed = state.get('elapsed_seconds', 0) + int((now - takt_start).total_seconds())
        expected = line.get('takt_duration', 30) * 60
        
        await log_takt_event(
            line_id, line.get('site_id', ''), 'takt_end', current_takt,
            duration_seconds=elapsed, expected_duration_seconds=expected
        )
    
    new_state = {
        "status": "idle",
        "current_takt": 0,
        "takt_start_time": None,
        "elapsed_seconds": 0,
        "paused_at": None
    }
    
    await db.production_lines.update_one({"id": line_id}, {"$set": {"state": new_state}})
    updated = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    await manager.broadcast(line_id, {"type": "state_update", "data": updated})
    
    return {"message": "Takt stopped", "state": new_state}

@api_router.post("/lines/{line_id}/end-day")
async def end_day(line_id: str):
    """End the day and save carryover if takt is unfinished"""
    line = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    
    state = line.get('state', {})
    current_status = state.get('status', 'idle')
    current_takt = state.get('current_takt', 0)
    
    # Get site timezone
    site_tz_str = "Europe/Paris"
    if line.get('site_id'):
        site = await db.sites.find_one({"id": line['site_id']}, {"_id": 0})
        if site:
            site_tz_str = site.get('timezone', 'Europe/Paris')
    
    try:
        site_tz = ZoneInfo(site_tz_str)
    except:
        site_tz = PARIS_TZ
    
    today_date = datetime.now(site_tz).strftime('%Y-%m-%d')
    
    # Calculate elapsed seconds if running
    elapsed_seconds = state.get('elapsed_seconds', 0)
    if current_status == 'running' and state.get('takt_start_time'):
        now = datetime.now(timezone.utc)
        takt_start = datetime.fromisoformat(state['takt_start_time'].replace('Z', '+00:00'))
        elapsed_seconds += int((now - takt_start).total_seconds())
    
    # Get active team's takt duration
    active_team = get_active_team_for_current_time(line)
    takt_duration_seconds = (active_team.get('takt_duration', 30) if active_team else 30) * 60
    
    # Check if takt is unfinished
    carryover_info = None
    if current_takt > 0 and elapsed_seconds < takt_duration_seconds:
        # Takt is unfinished - save carryover
        carryover_info = {
            "carryover_takt": current_takt,
            "carryover_elapsed_seconds": elapsed_seconds,
            "carryover_date": today_date
        }
    
    # Set state to idle but preserve carryover
    new_state = {
        "status": "idle",
        "current_takt": 0,
        "takt_start_time": None,
        "elapsed_seconds": 0,
        "paused_at": None,
        "carryover_takt": carryover_info.get('carryover_takt') if carryover_info else None,
        "carryover_elapsed_seconds": carryover_info.get('carryover_elapsed_seconds') if carryover_info else None,
        "carryover_date": carryover_info.get('carryover_date') if carryover_info else None
    }
    
    # Log day end
    await log_takt_event(
        line_id, line.get('site_id', ''), 'day_end', current_takt,
        details={
            "elapsed_seconds": elapsed_seconds,
            "has_carryover": carryover_info is not None,
            "carryover": carryover_info
        }
    )
    
    await db.production_lines.update_one({"id": line_id}, {"$set": {"state": new_state}})
    updated = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    await manager.broadcast(line_id, {"type": "state_update", "data": updated})
    
    if carryover_info:
        remaining_seconds = takt_duration_seconds - elapsed_seconds
        return {
            "message": f"Journée terminée. Takt {current_takt} reporté au lendemain ({remaining_seconds // 60} min restantes)",
            "carryover": carryover_info,
            "remaining_seconds": remaining_seconds
        }
    else:
        return {"message": "Journée terminée. Pas de report.", "carryover": None}

@api_router.post("/lines/{line_id}/next")
async def next_takt(line_id: str):
    """Complete current takt and start next one"""
    line = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    
    state = line.get('state', {})
    current_takt = state.get('current_takt', 0)
    now = datetime.now(timezone.utc)
    
    # Log completion of current takt if running
    if state.get('status') == 'running' and state.get('takt_start_time'):
        takt_start = datetime.fromisoformat(state['takt_start_time'].replace('Z', '+00:00'))
        elapsed = state.get('elapsed_seconds', 0) + int((now - takt_start).total_seconds())
        expected = line.get('takt_duration', 30) * 60
        
        await log_takt_event(
            line_id, line.get('site_id', ''), 'takt_end', current_takt,
            duration_seconds=elapsed, expected_duration_seconds=expected
        )
    
    new_takt = current_takt + 1
    new_state = {
        "status": "running",
        "current_takt": new_takt,
        "takt_start_time": now.isoformat(),
        "elapsed_seconds": 0,
        "paused_at": None
    }
    
    await log_takt_event(
        line_id, line.get('site_id', ''), 'takt_start', new_takt,
        expected_duration_seconds=line.get('takt_duration', 30) * 60
    )
    
    await db.production_lines.update_one({"id": line_id}, {"$set": {"state": new_state}})
    updated = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    await manager.broadcast(line_id, {"type": "state_update", "data": updated})
    
    return {"message": "Next takt started", "state": new_state}

@api_router.post("/lines/{line_id}/break")
async def start_break(line_id: str, break_name: str = "Pause", break_duration: int = 15):
    """Start a break with specified name and duration in minutes"""
    line = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    
    state = line.get('state', {})
    now = datetime.now(timezone.utc)
    
    elapsed = state.get('elapsed_seconds', 0)
    if state.get('status') == 'running' and state.get('takt_start_time'):
        takt_start = datetime.fromisoformat(state['takt_start_time'].replace('Z', '+00:00'))
        elapsed += int((now - takt_start).total_seconds())
    
    # Calculate break end time
    break_end = now + timedelta(minutes=break_duration)
    
    new_state = {
        "status": "break",
        "current_takt": state.get('current_takt', 0),
        "takt_start_time": state.get('takt_start_time'),
        "elapsed_seconds": elapsed,
        "paused_at": now.isoformat(),
        "current_break_name": break_name,
        "break_duration_minutes": break_duration,
        "break_start_time": now.isoformat(),
        "break_end_time": break_end.isoformat()
    }
    
    await log_takt_event(line_id, line.get('site_id', ''), 'break_start', state.get('current_takt', 0), details={"break_name": break_name, "duration_minutes": break_duration})
    await db.production_lines.update_one({"id": line_id}, {"$set": {"state": new_state}})
    
    updated = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    await manager.broadcast(line_id, {"type": "state_update", "data": updated})
    
    return {"message": f"Break '{break_name}' started", "state": new_state, "break_end_time": break_end.isoformat()}

# ==================== EVENTS & STATISTICS ENDPOINTS ====================

@api_router.get("/events", response_model=List[dict])
async def get_events(
    line_id: Optional[str] = None,
    site_id: Optional[str] = None,
    days: int = Query(default=1, ge=1, le=30),
    limit: int = Query(default=1000, ge=1, le=5000)
):
    """Get takt events with filters"""
    query = {}
    if line_id:
        query["line_id"] = line_id
    if site_id:
        query["site_id"] = site_id
    
    # Filter by date
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    query["timestamp"] = {"$gte": start_date}
    
    events = await db.takt_events.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return events

@api_router.get("/statistics/{line_id}", response_model=dict)
async def get_line_statistics(
    line_id: str,
    days: int = Query(default=1, ge=1, le=30)
):
    """Get statistics for a specific line"""
    line = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    
    start_date = datetime.now(timezone.utc) - timedelta(days=days)
    
    # Get all takt_end events
    events = await db.takt_events.find({
        "line_id": line_id,
        "event_type": "takt_end",
        "timestamp": {"$gte": start_date.isoformat()}
    }, {"_id": 0}).to_list(10000)
    
    if not events:
        return TaktStatistics(
            line_id=line_id,
            line_name=line.get('name', ''),
            period_start=start_date.isoformat(),
            period_end=datetime.now(timezone.utc).isoformat()
        ).model_dump()
    
    total_takts = len(events)
    completed_takts = total_takts
    
    durations = [e.get('duration_seconds', 0) for e in events]
    overtimes = [e.get('overtime_seconds', 0) for e in events]
    overtime_events = [e for e in events if e.get('is_overtime', False)]
    
    avg_duration = sum(durations) / len(durations) if durations else 0
    total_overtime = sum(overtimes)
    overtime_count = len(overtime_events)
    on_time_count = total_takts - overtime_count
    on_time_pct = (on_time_count / total_takts * 100) if total_takts > 0 else 0
    avg_overtime = total_overtime / overtime_count if overtime_count > 0 else 0
    
    # Get pause/break events
    pause_events = await db.takt_events.find({
        "line_id": line_id,
        "event_type": {"$in": ["takt_pause", "break_start"]},
        "timestamp": {"$gte": start_date.isoformat()}
    }, {"_id": 0}).to_list(10000)
    
    total_pause = sum([e.get('duration_seconds', 0) for e in pause_events if e.get('event_type') == 'takt_pause'])
    total_break = sum([e.get('duration_seconds', 0) for e in pause_events if e.get('event_type') == 'break_start'])
    
    stats = TaktStatistics(
        line_id=line_id,
        line_name=line.get('name', ''),
        period_start=start_date.isoformat(),
        period_end=datetime.now(timezone.utc).isoformat(),
        total_takts=total_takts,
        completed_takts=completed_takts,
        average_duration_seconds=round(avg_duration, 2),
        expected_duration_seconds=line.get('takt_duration', 30) * 60,
        total_overtime_seconds=total_overtime,
        overtime_count=overtime_count,
        on_time_count=on_time_count,
        on_time_percentage=round(on_time_pct, 1),
        average_overtime_seconds=round(avg_overtime, 2),
        total_pause_time_seconds=total_pause,
        total_break_time_seconds=total_break
    )
    
    return stats.model_dump()

@api_router.get("/export/csv")
async def export_events_csv(
    line_id: Optional[str] = None,
    site_id: Optional[str] = None,
    days: int = Query(default=1, ge=1, le=7)
):
    """Export events as CSV file"""
    query = {}
    if line_id:
        query["line_id"] = line_id
    if site_id:
        query["site_id"] = site_id
    
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    query["timestamp"] = {"$gte": start_date}
    
    events = await db.takt_events.find(query, {"_id": 0}).sort("timestamp", 1).limit(5000).to_list(5000)
    
    # Get line names for mapping
    lines = await db.production_lines.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
    line_names = {l['id']: l['name'] for l in lines}
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    
    # Header
    writer.writerow([
        'Horodatage', 'Site', 'Ligne', 'Type Événement', 'N° Takt',
        'Durée (s)', 'Durée Prévue (s)', 'Retard', 'Retard (s)', 'Détails'
    ])
    
    event_type_labels = {
        'takt_start': 'Début Takt',
        'takt_end': 'Fin Takt',
        'takt_pause': 'Suspension',
        'takt_resume': 'Reprise',
        'break_start': 'Début Pause',
        'break_end': 'Fin Pause',
        'takt_overtime': 'Dépassement'
    }
    
    for event in events:
        writer.writerow([
            event.get('timestamp', ''),
            event.get('site_id', ''),
            line_names.get(event.get('line_id', ''), event.get('line_id', '')),
            event_type_labels.get(event.get('event_type', ''), event.get('event_type', '')),
            event.get('takt_number', ''),
            event.get('duration_seconds', ''),
            event.get('expected_duration_seconds', ''),
            'Oui' if event.get('is_overtime', False) else 'Non',
            event.get('overtime_seconds', 0),
            str(event.get('details', {}))
        ])
    
    output.seek(0)
    
    filename = f"takt_events_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# ==================== WEBSOCKET ====================

@api_router.websocket("/ws/{line_id}")
async def websocket_endpoint(websocket: WebSocket, line_id: str):
    await manager.connect(websocket, line_id)
    try:
        line = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
        if line:
            await websocket.send_json({"type": "initial", "data": line})
        
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket, line_id)
    except Exception:
        manager.disconnect(websocket, line_id)

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
