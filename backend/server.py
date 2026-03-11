from fastapi import FastAPI, APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import asyncio
import json

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

# Define Models
class BreakConfig(BaseModel):
    name: str = ""
    start_time: str = ""  # HH:MM format
    duration: int = 0  # minutes

class SoundAlertConfig(BaseModel):
    takt_start: bool = True
    minutes_before_takt_end: int = 5
    takt_end: bool = True
    break_start: bool = True
    minutes_before_break_end: int = 5
    break_end: bool = True

class ProductionLineBase(BaseModel):
    name: str
    takt_duration: int = 30  # minutes (20-40)
    day_start: str = "08:00"  # HH:MM
    day_end: str = "17:00"  # HH:MM
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
    takt_duration: Optional[int] = None
    day_start: Optional[str] = None
    day_end: Optional[str] = None
    breaks: Optional[List[BreakConfig]] = None
    auto_resume_after_break: Optional[bool] = None
    auto_resume_after_takt: Optional[bool] = None
    sound_alerts: Optional[SoundAlertConfig] = None

class TaktState(BaseModel):
    status: str = "idle"  # idle, running, paused, break, finished
    current_takt: int = 0
    takt_start_time: Optional[str] = None
    elapsed_seconds: int = 0
    paused_at: Optional[str] = None
    current_break_name: Optional[str] = None
    break_end_time: Optional[str] = None

class ProductionLine(ProductionLineBase):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    state: TaktState = Field(default_factory=TaktState)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Helper functions
def calculate_estimated_takts(line: ProductionLineBase) -> int:
    """Calculate estimated number of takts for the day"""
    try:
        day_start_parts = line.day_start.split(":")
        day_end_parts = line.day_end.split(":")
        
        start_minutes = int(day_start_parts[0]) * 60 + int(day_start_parts[1])
        end_minutes = int(day_end_parts[0]) * 60 + int(day_end_parts[1])
        
        total_work_minutes = end_minutes - start_minutes
        
        # Subtract breaks
        for break_config in line.breaks:
            if break_config.duration > 0:
                total_work_minutes -= break_config.duration
        
        if total_work_minutes <= 0 or line.takt_duration <= 0:
            return 0
            
        return total_work_minutes // line.takt_duration
    except:
        return 0

def serialize_line(line_doc: dict) -> dict:
    """Serialize MongoDB document to API response"""
    if 'created_at' in line_doc and isinstance(line_doc['created_at'], datetime):
        line_doc['created_at'] = line_doc['created_at'].isoformat()
    return line_doc

# CRUD Endpoints
@api_router.get("/")
async def root():
    return {"message": "Takt Time API"}

@api_router.post("/lines", response_model=dict)
async def create_line(line_data: ProductionLineCreate):
    line = ProductionLine(**line_data.model_dump())
    doc = line.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.production_lines.insert_one(doc)
    
    # Fetch the created line without _id
    created = await db.production_lines.find_one({"id": line.id}, {"_id": 0})
    estimated_takts = calculate_estimated_takts(line)
    created['estimated_takts'] = estimated_takts
    return created

@api_router.get("/lines", response_model=List[dict])
async def get_lines():
    lines = await db.production_lines.find({}, {"_id": 0}).to_list(100)
    for line in lines:
        line_obj = ProductionLineBase(**{k: v for k, v in line.items() if k in ProductionLineBase.model_fields})
        line['estimated_takts'] = calculate_estimated_takts(line_obj)
    return lines

@api_router.get("/lines/{line_id}", response_model=dict)
async def get_line(line_id: str):
    line = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    
    line_obj = ProductionLineBase(**{k: v for k, v in line.items() if k in ProductionLineBase.model_fields})
    line['estimated_takts'] = calculate_estimated_takts(line_obj)
    return line

@api_router.put("/lines/{line_id}", response_model=dict)
async def update_line(line_id: str, update_data: ProductionLineUpdate):
    existing = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Line not found")
    
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    # Handle nested models
    if 'breaks' in update_dict:
        update_dict['breaks'] = [b.model_dump() if isinstance(b, BreakConfig) else b for b in update_dict['breaks']]
    if 'sound_alerts' in update_dict:
        update_dict['sound_alerts'] = update_dict['sound_alerts'].model_dump() if isinstance(update_dict['sound_alerts'], SoundAlertConfig) else update_dict['sound_alerts']
    
    if update_dict:
        await db.production_lines.update_one({"id": line_id}, {"$set": update_dict})
    
    updated = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    line_obj = ProductionLineBase(**{k: v for k, v in updated.items() if k in ProductionLineBase.model_fields})
    updated['estimated_takts'] = calculate_estimated_takts(line_obj)
    
    # Broadcast update
    await manager.broadcast(line_id, {"type": "config_update", "data": updated})
    
    return updated

@api_router.delete("/lines/{line_id}")
async def delete_line(line_id: str):
    result = await db.production_lines.delete_one({"id": line_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Line not found")
    return {"message": "Line deleted"}

# Takt Control Endpoints
@api_router.post("/lines/{line_id}/start")
async def start_takt(line_id: str):
    line = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    
    state = line.get('state', {})
    current_status = state.get('status', 'idle')
    
    now = datetime.now(timezone.utc).isoformat()
    
    if current_status == 'paused':
        # Resume from pause
        new_state = {
            "status": "running",
            "current_takt": state.get('current_takt', 1),
            "takt_start_time": state.get('takt_start_time', now),
            "elapsed_seconds": state.get('elapsed_seconds', 0),
            "paused_at": None
        }
    else:
        # Start new takt
        new_state = {
            "status": "running",
            "current_takt": state.get('current_takt', 0) + 1,
            "takt_start_time": now,
            "elapsed_seconds": 0,
            "paused_at": None
        }
    
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
    
    # Calculate elapsed time
    takt_start = datetime.fromisoformat(state['takt_start_time'].replace('Z', '+00:00'))
    elapsed = state.get('elapsed_seconds', 0) + int((now - takt_start).total_seconds())
    
    new_state = {
        "status": "paused",
        "current_takt": state['current_takt'],
        "takt_start_time": state['takt_start_time'],
        "elapsed_seconds": elapsed,
        "paused_at": now.isoformat()
    }
    
    await db.production_lines.update_one({"id": line_id}, {"$set": {"state": new_state}})
    
    updated = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    await manager.broadcast(line_id, {"type": "state_update", "data": updated})
    
    return {"message": "Takt paused", "state": new_state}

@api_router.post("/lines/{line_id}/stop")
async def stop_takt(line_id: str):
    line = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    
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
    """Move to next takt"""
    line = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    
    state = line.get('state', {})
    now = datetime.now(timezone.utc).isoformat()
    
    new_state = {
        "status": "running",
        "current_takt": state.get('current_takt', 0) + 1,
        "takt_start_time": now,
        "elapsed_seconds": 0,
        "paused_at": None
    }
    
    await db.production_lines.update_one({"id": line_id}, {"$set": {"state": new_state}})
    
    updated = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    await manager.broadcast(line_id, {"type": "state_update", "data": updated})
    
    return {"message": "Next takt started", "state": new_state}

@api_router.post("/lines/{line_id}/break")
async def start_break(line_id: str, break_name: str = "Pause"):
    """Start a break"""
    line = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
    
    state = line.get('state', {})
    now = datetime.now(timezone.utc)
    
    # Find break duration
    break_duration = 15  # default
    for b in line.get('breaks', []):
        if b.get('name') == break_name:
            break_duration = b.get('duration', 15)
            break
    
    break_end = now + asyncio.coroutines.timedelta(minutes=break_duration) if hasattr(asyncio.coroutines, 'timedelta') else now
    
    # Store elapsed time before break
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
    
    await db.production_lines.update_one({"id": line_id}, {"$set": {"state": new_state}})
    
    updated = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
    await manager.broadcast(line_id, {"type": "state_update", "data": updated})
    
    return {"message": f"Break '{break_name}' started", "state": new_state}

# WebSocket endpoint for real-time updates
@api_router.websocket("/ws/{line_id}")
async def websocket_endpoint(websocket: WebSocket, line_id: str):
    await manager.connect(websocket, line_id)
    try:
        # Send initial state
        line = await db.production_lines.find_one({"id": line_id}, {"_id": 0})
        if line:
            await websocket.send_json({"type": "initial", "data": line})
        
        while True:
            # Keep connection alive and wait for messages
            data = await websocket.receive_text()
            # Handle ping/pong or other messages if needed
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket, line_id)
    except Exception as e:
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

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
