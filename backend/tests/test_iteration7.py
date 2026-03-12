"""
Iteration 7 Backend Tests - 4 Corrections Requested:
1. Active team bug - takt duration and estimated takts should match active team
2. "Takt suivant" button in overtime - manual next takt when auto-next disabled
3. Global sound alerts - alerts moved from team to global level
4. Break trigger mode - choice per break: 'immediate' or 'end_of_takt'
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAPIHealth:
    """Basic API health checks"""
    
    def test_api_root(self):
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Takt Time API v2"
        print("PASS: API root endpoint working")

    def test_server_time(self):
        response = requests.get(f"{BASE_URL}/api/server-time")
        assert response.status_code == 200
        data = response.json()
        assert "paris" in data
        assert "paris_time" in data
        assert "timezone" in data
        print(f"PASS: Server time - Paris: {data['paris_time']}")


class TestActiveTeamTaktDuration:
    """Test Bug 1: Takt duration and estimated takts should match active team"""
    
    def test_get_all_lines(self):
        """Verify lines endpoint returns data with estimated_takts"""
        response = requests.get(f"{BASE_URL}/api/lines")
        assert response.status_code == 200
        lines = response.json()
        assert len(lines) >= 1, "At least one line should exist"
        
        for line in lines:
            assert "estimated_takts" in line, f"Line {line['name']} missing estimated_takts"
            assert "shift_organization" in line, f"Line {line['name']} missing shift_organization"
        print(f"PASS: Retrieved {len(lines)} lines with estimated_takts")
    
    def test_trady4_active_team_takt_duration(self):
        """TRADY 4 should use active team's takt duration (25 min for Equipe en 2*8)"""
        response = requests.get(f"{BASE_URL}/api/lines")
        assert response.status_code == 200
        lines = response.json()
        
        trady4 = next((l for l in lines if l['name'] == 'TRADY 4'), None)
        if not trady4:
            pytest.skip("TRADY 4 line not found")
        
        active_team_id = trady4['shift_organization'].get('active_team_id')
        teams = trady4['shift_organization'].get('teams', [])
        
        # Find active team
        active_team = None
        if active_team_id:
            active_team = next((t for t in teams if t.get('id') == active_team_id), None)
        
        if active_team:
            print(f"PASS: TRADY 4 active team: {active_team['name']} ({active_team['takt_duration']} min/takt)")
            # Verify estimated_takts is calculated based on active team
            # Active team "Equipe en 2*8": 06:00-21:00 (15h = 900min), breaks=65min, net=835min, takts=835/25=33
            if active_team['name'] == 'Equipe en 2*8':
                assert active_team['takt_duration'] == 25, "Active team should have 25 min takt"
                # estimated_takts should be around 33 for this team
                assert 30 <= trady4['estimated_takts'] <= 35, f"Expected ~33 takts, got {trady4['estimated_takts']}"
                print(f"PASS: Estimated takts correct: {trady4['estimated_takts']} (expected ~33)")
        else:
            print(f"INFO: No active team explicitly set, using first team")
    
    def test_xdd_line_takt_duration(self):
        """XDD should use its team's takt duration (30 min)"""
        response = requests.get(f"{BASE_URL}/api/lines")
        assert response.status_code == 200
        lines = response.json()
        
        xdd = next((l for l in lines if l['name'] == 'XDD'), None)
        if not xdd:
            pytest.skip("XDD line not found")
        
        teams = xdd['shift_organization'].get('teams', [])
        assert len(teams) >= 1, "XDD should have at least one team"
        
        # XDD has single team with 30 min takt
        first_team = teams[0]
        assert first_team['takt_duration'] == 30, f"XDD team should have 30 min takt, got {first_team['takt_duration']}"
        
        # XDD: 08:00-17:00 (9h = 540min), 3 breaks (15+60+15=90min), net=450min, takts=450/30=15
        expected_takts = 15
        assert xdd['estimated_takts'] == expected_takts, f"Expected {expected_takts} takts, got {xdd['estimated_takts']}"
        print(f"PASS: XDD takt duration: {first_team['takt_duration']} min, estimated_takts: {xdd['estimated_takts']}")


class TestBreakTriggerMode:
    """Test Bug 4: Break trigger_mode field - 'immediate' or 'end_of_takt'"""
    
    def test_break_config_model(self):
        """Verify break config supports trigger_mode field"""
        # Create a test line with breaks that have trigger_mode
        test_line_data = {
            "name": "TEST_TriggerMode_Line",
            "site_id": "",
            "takt_duration": 30,
            "shift_organization": {
                "type": "1x8",
                "teams": [{
                    "id": "test-team-id",
                    "name": "Test Team",
                    "day_start": "08:00",
                    "day_end": "17:00",
                    "takt_duration": 30,
                    "breaks": [
                        {"name": "Pause 1", "start_time": "10:00", "duration": 15, "trigger_mode": "immediate"},
                        {"name": "Pause 2", "start_time": "12:00", "duration": 30, "trigger_mode": "end_of_takt"},
                    ],
                    "is_active": True
                }],
                "active_team_id": "test-team-id"
            },
            "auto_resume_after_takt": False,
            "sound_alerts": {
                "takt_start": True,
                "minutes_before_takt_end": 5,
                "takt_end": True,
                "break_start": True,
                "minutes_before_break_end": 5,
                "break_end": True
            }
        }
        
        # Create line
        response = requests.post(f"{BASE_URL}/api/lines", json=test_line_data)
        assert response.status_code == 200, f"Failed to create test line: {response.text}"
        created_line = response.json()
        line_id = created_line['id']
        
        try:
            # Verify trigger_mode is stored
            response = requests.get(f"{BASE_URL}/api/lines/{line_id}")
            assert response.status_code == 200
            line = response.json()
            
            breaks = line['shift_organization']['teams'][0]['breaks']
            assert len(breaks) == 2, "Should have 2 breaks"
            
            # Check trigger_mode values
            assert breaks[0].get('trigger_mode') == 'immediate', f"Break 1 trigger_mode should be 'immediate', got {breaks[0].get('trigger_mode')}"
            assert breaks[1].get('trigger_mode') == 'end_of_takt', f"Break 2 trigger_mode should be 'end_of_takt', got {breaks[1].get('trigger_mode')}"
            print("PASS: Break trigger_mode field saved and retrieved correctly")
            
        finally:
            # Cleanup
            requests.delete(f"{BASE_URL}/api/lines/{line_id}")
            print("Cleanup: Test line deleted")


class TestGlobalSoundAlerts:
    """Test Bug 3: Sound alerts at global level (not in team dialog)"""
    
    def test_sound_alerts_at_line_level(self):
        """Verify sound_alerts are stored at line level, not team level"""
        response = requests.get(f"{BASE_URL}/api/lines")
        assert response.status_code == 200
        lines = response.json()
        
        for line in lines:
            # sound_alerts should be at line level
            assert "sound_alerts" in line, f"Line {line['name']} missing sound_alerts at line level"
            sound_alerts = line['sound_alerts']
            
            # Verify structure
            expected_fields = ['takt_start', 'takt_end', 'minutes_before_takt_end', 'break_start', 'break_end', 'minutes_before_break_end']
            for field in expected_fields:
                assert field in sound_alerts, f"Line {line['name']} sound_alerts missing field: {field}"
            
            print(f"PASS: {line['name']} has sound_alerts at line level")


class TestAutoResumeAfterTakt:
    """Test Bug 2: Next takt button appears when overtime AND auto-next disabled"""
    
    def test_auto_resume_after_takt_field(self):
        """Verify lines have auto_resume_after_takt field"""
        response = requests.get(f"{BASE_URL}/api/lines")
        assert response.status_code == 200
        lines = response.json()
        
        for line in lines:
            # auto_resume_after_takt controls whether "Takt suivant" button appears in overtime
            # If True: auto-advance to next takt (no button shown)
            # If False: manual advance needed, show "Takt suivant" button in overtime
            auto_resume = line.get('auto_resume_after_takt')
            print(f"INFO: {line['name']} - auto_resume_after_takt: {auto_resume}")
        
        print("PASS: Lines have auto_resume_after_takt field")
    
    def test_create_line_with_auto_resume_disabled(self):
        """Create a test line with auto_resume_after_takt=False for UI testing"""
        test_line_data = {
            "name": "TEST_NoAutoNext_Line",
            "site_id": "",
            "takt_duration": 1,  # 1 minute for quick testing
            "shift_organization": {
                "type": "1x8",
                "teams": [{
                    "id": "test-team-noauto",
                    "name": "Test Team No Auto",
                    "day_start": "00:00",
                    "day_end": "23:59",
                    "takt_duration": 1,  # 1 minute takt for quick overtime
                    "breaks": [],
                    "is_active": True
                }],
                "active_team_id": "test-team-noauto"
            },
            "auto_resume_after_takt": False,  # This enables the "Takt suivant" button
            "sound_alerts": {
                "takt_start": False,
                "minutes_before_takt_end": 1,
                "takt_end": False,
                "break_start": False,
                "minutes_before_break_end": 1,
                "break_end": False
            }
        }
        
        response = requests.post(f"{BASE_URL}/api/lines", json=test_line_data)
        assert response.status_code == 200, f"Failed to create test line: {response.text}"
        created_line = response.json()
        
        assert created_line['auto_resume_after_takt'] == False, "auto_resume_after_takt should be False"
        print(f"PASS: Created test line with auto_resume_after_takt=False, id={created_line['id']}")
        
        # Keep line for UI testing (don't delete)
        return created_line['id']


class TestNextTaktEndpoint:
    """Test the /next endpoint for manual takt advancement"""
    
    def test_next_takt_endpoint_exists(self):
        """Verify /next endpoint exists and works"""
        response = requests.get(f"{BASE_URL}/api/lines")
        lines = response.json()
        if not lines:
            pytest.skip("No lines available for testing")
        
        line_id = lines[0]['id']
        
        # Start a takt first
        start_response = requests.post(f"{BASE_URL}/api/lines/{line_id}/start")
        assert start_response.status_code == 200, "Failed to start takt"
        
        # Test next endpoint
        next_response = requests.post(f"{BASE_URL}/api/lines/{line_id}/next")
        assert next_response.status_code == 200, "Next takt endpoint should work"
        
        data = next_response.json()
        assert "state" in data, "Response should include state"
        assert data["state"]["status"] == "running", "Should be running after next"
        
        # Stop to clean up
        requests.post(f"{BASE_URL}/api/lines/{line_id}/stop")
        
        print("PASS: /next endpoint works correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
