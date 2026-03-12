"""
Test suite for Takt Time API - Iteration 5
Tests for the 7 modifications requested by user:
1. Stop button removed
2. Next takt button removed  
3. Screen management replaced with URL
4. Working hours display from shift_organization
5. Takt duration 20-90 min
6. Auto-start at day begin option
7. Overtime display only when auto-next disabled
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://takt-control-panel.preview.emergentagent.com"

# Test line IDs
TRADY4_LINE_ID = "aba1336d-f810-4e7b-872c-b59efae4c132"
XDD_LINE_ID = "dd3fed61-d14a-4209-a5e0-7e6fe1beb683"


class TestAPIHealth:
    """Basic API health checks"""
    
    def test_api_root(self):
        """Test API is accessible"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Takt Time" in data["message"]
        print("SUCCESS: API is accessible")
    
    def test_server_time(self):
        """Test server time endpoint returns Paris timezone"""
        response = requests.get(f"{BASE_URL}/api/server-time")
        assert response.status_code == 200
        data = response.json()
        assert "paris" in data
        assert "paris_time" in data
        assert "timezone" in data
        assert data["timezone"] == "Europe/Paris"
        print(f"SUCCESS: Server time - Paris: {data['paris_time']}")


class TestLinesAPI:
    """Test production lines API"""
    
    def test_get_lines(self):
        """Test fetching all lines"""
        response = requests.get(f"{BASE_URL}/api/lines")
        assert response.status_code == 200
        lines = response.json()
        assert isinstance(lines, list)
        assert len(lines) >= 2
        print(f"SUCCESS: Found {len(lines)} production lines")
    
    def test_get_trady4_line(self):
        """Test TRADY 4 line details"""
        response = requests.get(f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}")
        assert response.status_code == 200
        line = response.json()
        
        # Verify basic fields
        assert line["name"] == "TRADY 4"
        assert line["id"] == TRADY4_LINE_ID
        
        # Verify shift_organization structure
        assert "shift_organization" in line
        shift_org = line["shift_organization"]
        assert "teams" in shift_org
        assert len(shift_org["teams"]) >= 1
        
        # Verify team schedule
        team = shift_org["teams"][0]
        assert "day_start" in team
        assert "day_end" in team
        print(f"SUCCESS: TRADY 4 team schedule: {team['day_start']} - {team['day_end']}")
    
    def test_trady4_schedule_from_shift_organization(self):
        """Test that TRADY 4 hours come from shift_organization.teams (06:00-21:00)"""
        response = requests.get(f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}")
        assert response.status_code == 200
        line = response.json()
        
        team = line["shift_organization"]["teams"][0]
        assert team["day_start"] == "06:00", f"Expected 06:00, got {team['day_start']}"
        assert team["day_end"] == "21:00", f"Expected 21:00, got {team['day_end']}"
        print("SUCCESS: TRADY 4 working hours from shift_organization: 06:00 - 21:00")
    
    def test_xdd_schedule_from_shift_organization(self):
        """Test that XDD hours come from shift_organization.teams (08:00-17:00)"""
        response = requests.get(f"{BASE_URL}/api/lines/{XDD_LINE_ID}")
        assert response.status_code == 200
        line = response.json()
        
        team = line["shift_organization"]["teams"][0]
        assert team["day_start"] == "08:00", f"Expected 08:00, got {team['day_start']}"
        assert team["day_end"] == "17:00", f"Expected 17:00, got {team['day_end']}"
        print("SUCCESS: XDD working hours from shift_organization: 08:00 - 17:00")


class TestAutoStartAtDayBegin:
    """Tests for auto_start_at_day_begin feature (Modification #6)"""
    
    def test_auto_start_field_exists(self):
        """Test that auto_start_at_day_begin field is returned"""
        response = requests.get(f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}")
        assert response.status_code == 200
        line = response.json()
        
        # Field should exist
        assert "auto_start_at_day_begin" in line
        print(f"SUCCESS: auto_start_at_day_begin field exists, value: {line['auto_start_at_day_begin']}")
    
    def test_auto_start_can_be_updated(self):
        """Test that auto_start_at_day_begin can be set to true"""
        # Set to true
        response = requests.put(
            f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}",
            json={"auto_start_at_day_begin": True}
        )
        assert response.status_code == 200
        line = response.json()
        assert line["auto_start_at_day_begin"] == True
        print("SUCCESS: auto_start_at_day_begin set to True")
    
    def test_auto_start_persists(self):
        """Test that auto_start_at_day_begin value persists after update"""
        # First set to a known value
        requests.put(
            f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}",
            json={"auto_start_at_day_begin": True}
        )
        
        # Then fetch and verify
        response = requests.get(f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}")
        assert response.status_code == 200
        line = response.json()
        assert line["auto_start_at_day_begin"] == True
        print("SUCCESS: auto_start_at_day_begin persists correctly")
    
    def test_auto_start_can_be_disabled(self):
        """Test that auto_start_at_day_begin can be set to false"""
        response = requests.put(
            f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}",
            json={"auto_start_at_day_begin": False}
        )
        assert response.status_code == 200
        line = response.json()
        assert line["auto_start_at_day_begin"] == False
        print("SUCCESS: auto_start_at_day_begin set to False")


class TestTaktDurationRange:
    """Tests for takt duration 20-90 min range (Modification #5)"""
    
    def test_takt_duration_min_value(self):
        """Test that takt duration of 20 min is accepted"""
        response = requests.get(f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}")
        line = response.json()
        
        # Get current shift_organization
        shift_org = line["shift_organization"]
        shift_org["teams"][0]["takt_duration"] = 20
        
        response = requests.put(
            f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}",
            json={"shift_organization": shift_org}
        )
        assert response.status_code == 200
        updated = response.json()
        assert updated["shift_organization"]["teams"][0]["takt_duration"] == 20
        print("SUCCESS: Takt duration 20 min accepted")
    
    def test_takt_duration_max_value(self):
        """Test that takt duration of 90 min is accepted"""
        response = requests.get(f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}")
        line = response.json()
        
        shift_org = line["shift_organization"]
        shift_org["teams"][0]["takt_duration"] = 90
        
        response = requests.put(
            f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}",
            json={"shift_organization": shift_org}
        )
        assert response.status_code == 200
        updated = response.json()
        assert updated["shift_organization"]["teams"][0]["takt_duration"] == 90
        print("SUCCESS: Takt duration 90 min accepted")
    
    def test_restore_original_takt_duration(self):
        """Restore TRADY 4 to original 20 min takt"""
        response = requests.get(f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}")
        line = response.json()
        
        shift_org = line["shift_organization"]
        shift_org["teams"][0]["takt_duration"] = 20
        
        response = requests.put(
            f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}",
            json={"shift_organization": shift_org}
        )
        assert response.status_code == 200
        print("SUCCESS: Restored TRADY 4 takt duration to 20 min")


class TestAutoResumeAfterTakt:
    """Tests for auto_resume_after_takt (controls overtime display - Modification #7)"""
    
    def test_auto_resume_field_exists(self):
        """Test that auto_resume_after_takt field exists"""
        response = requests.get(f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}")
        assert response.status_code == 200
        line = response.json()
        
        assert "auto_resume_after_takt" in line
        print(f"SUCCESS: auto_resume_after_takt exists, value: {line['auto_resume_after_takt']}")
    
    def test_auto_resume_can_be_toggled(self):
        """Test that auto_resume_after_takt can be toggled"""
        # Get current value
        response = requests.get(f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}")
        current_value = response.json()["auto_resume_after_takt"]
        
        # Toggle it
        new_value = not current_value
        response = requests.put(
            f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}",
            json={"auto_resume_after_takt": new_value}
        )
        assert response.status_code == 200
        assert response.json()["auto_resume_after_takt"] == new_value
        
        # Restore original
        requests.put(
            f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}",
            json={"auto_resume_after_takt": current_value}
        )
        print("SUCCESS: auto_resume_after_takt can be toggled")


class TestTaktControls:
    """Tests for takt control endpoints"""
    
    def test_start_takt(self):
        """Test starting a takt"""
        # Make sure line is stopped first
        requests.post(f"{BASE_URL}/api/lines/{XDD_LINE_ID}/stop")
        
        # Start takt
        response = requests.post(f"{BASE_URL}/api/lines/{XDD_LINE_ID}/start")
        assert response.status_code == 200
        data = response.json()
        assert data["state"]["status"] == "running"
        assert data["state"]["current_takt"] >= 1
        print(f"SUCCESS: Started takt #{data['state']['current_takt']}")
    
    def test_pause_takt(self):
        """Test pausing a takt"""
        response = requests.post(f"{BASE_URL}/api/lines/{XDD_LINE_ID}/pause")
        assert response.status_code == 200
        data = response.json()
        assert data["state"]["status"] == "paused"
        print("SUCCESS: Takt paused")
    
    def test_resume_takt(self):
        """Test resuming a paused takt"""
        response = requests.post(f"{BASE_URL}/api/lines/{XDD_LINE_ID}/start")
        assert response.status_code == 200
        data = response.json()
        assert data["state"]["status"] == "running"
        print("SUCCESS: Takt resumed")
    
    def test_next_takt(self):
        """Test moving to next takt"""
        response = requests.post(f"{BASE_URL}/api/lines/{XDD_LINE_ID}/next")
        assert response.status_code == 200
        data = response.json()
        assert data["state"]["status"] == "running"
        print(f"SUCCESS: Advanced to takt #{data['state']['current_takt']}")
    
    def test_stop_takt(self):
        """Test stopping the takt"""
        response = requests.post(f"{BASE_URL}/api/lines/{XDD_LINE_ID}/stop")
        assert response.status_code == 200
        data = response.json()
        assert data["state"]["status"] == "idle"
        assert data["state"]["current_takt"] == 0
        print("SUCCESS: Takt stopped and reset")


class TestCleanup:
    """Cleanup tests to restore initial state"""
    
    def test_restore_trady4_auto_start(self):
        """Restore TRADY 4 auto_start to True for UI testing"""
        response = requests.put(
            f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}",
            json={"auto_start_at_day_begin": True}
        )
        assert response.status_code == 200
        print("SUCCESS: Restored TRADY 4 auto_start_at_day_begin to True")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
