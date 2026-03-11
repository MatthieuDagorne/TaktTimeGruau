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
import csv
import io

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

# Team/Shift Configuration
class TeamConfig(BaseModel):
    name: str = "Équipe Standard"
    shift_type: str = "1x8"  # 1x8, 2x8, 3x8
    weekly_schedule: WeeklySchedule = Field(default_factory=WeeklySchedule)

class BreakConfig(BaseModel):
    name: str = ""
    start_time: str = ""
    duration: int = 0

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
    break_end_time: Optional[str] = None

# Production Line Model (updated)
class ProductionLineBase(BaseModel):
    name: str
    site_id: str = ""
    takt_duration: int = 30
    team_config: TeamConfig = Field(default_factory=TeamConfig)
    breaks: List[BreakConfig] = Field(default_factory=lambda: [
        BreakConfig(name="Pause Matin", start_time="10:00", duration=15),
        BreakConfig(name="Pause Midi", start_time="12:00", duration=60),
        BreakConfig(name="Pause Après-midi", start_time="15:00", duration=15)
    ])
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
    breaks: Optional[List[BreakConfig]] = None
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
    """Get schedule for a specific day"""
    if day_name is None:
        day_name = datetime.now(timezone.utc).strftime('%A').lower()
    
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

def calculate_estimated_takts(line: dict, day_name: str = None) -> int:
    """Calculate estimated number of takts for the day"""
    try:
        schedule = get_day_schedule(line, day_name)
        
        if not schedule.get('is_working_day', True):
            return 0
        
        day_start_parts = schedule['day_start'].split(":")
        day_end_parts = schedule['day_end'].split(":")
        
        start_minutes = int(day_start_parts[0]) * 60 + int(day_start_parts[1])
        end_minutes = int(day_end_parts[0]) * 60 + int(day_end_parts[1])
        
        total_work_minutes = end_minutes - start_minutes
        
        # Subtract breaks
        breaks = schedule.get('breaks', line.get('breaks', []))
        for break_config in breaks:
            duration = break_config.get('duration', 0) if isinstance(break_config, dict) else break_config.duration
            if duration > 0:
                total_work_minutes -= duration
        
        takt_duration = line.get('takt_duration', 30)
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

@api_router.post("/lines/{line_id}/start")
async def start_takt(line_id: str):
    line = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    
    state = line.get('state', {})
    current_status = state.get('status', 'idle')
    now = datetime.now(timezone.utc)
    
    if current_status == 'paused':
        new_state = {
            "status": "running",
            "current_takt": state.get('current_takt', 1),
            "takt_start_time": state.get('takt_start_time', now.isoformat()),
            "elapsed_seconds": state.get('elapsed_seconds', 0),
            "paused_at": None
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
            expected_duration_seconds=line.get('takt_duration', 30) * 60
        )
    
    await db.production_lines.update_one({"id": line_id}, {"$set": {"state": new_state}})
    updated = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    await manager.broadcast(line_id, {"type": "state_update", "data": updated})
    
    return {"message": "Takt started", "state": new_state}

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
async def start_break(line_id: str, break_name: str = "Pause"):
    line = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    
    state = line.get('state', {})
    now = datetime.now(timezone.utc)
    
    elapsed = state.get('elapsed_seconds', 0)
    if state.get('status') == 'running' and state.get('takt_start_time'):
        takt_start = datetime.fromisoformat(state['takt_start_time'].replace('Z', '+00:00'))
        elapsed += int((now - takt_start).total_seconds())
    
    new_state = {
        "status": "break",
        "current_takt": state.get('current_takt', 0),
        "takt_start_time": state.get('takt_start_time'),
        "elapsed_seconds": elapsed,
        "paused_at": now.isoformat(),
        "current_break_name": break_name,
        "break_end_time": None
    }
    
    await log_takt_event(line_id, line.get('site_id', ''), 'break_start', state.get('current_takt', 0), details={"break_name": break_name})
    await db.production_lines.update_one({"id": line_id}, {"$set": {"state": new_state}})
    
    updated = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    await manager.broadcast(line_id, {"type": "state_update", "data": updated})
    
    return {"message": f"Break '{break_name}' started", "state": new_state}

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
