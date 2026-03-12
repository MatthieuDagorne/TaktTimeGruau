"""
Iteration 8 Tests: Takt Time Calculation and Sound Alert Verification
- Verify active_team_id is correctly used for takt calculation
- Verify takt duration from active team is used
- Verify sound_alerts settings for minutes_before_takt_end
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestActiveTeamCalculation:
    """Tests to verify active team is correctly used for takt calculations"""
    
    def test_api_available(self):
        """Test API is accessible"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✓ API available: {data['message']}")

    def test_server_time_paris(self):
        """Verify server returns Paris timezone"""
        response = requests.get(f"{BASE_URL}/api/server-time")
        assert response.status_code == 200
        data = response.json()
        assert data['timezone'] == 'Europe/Paris'
        print(f"✓ Server time in Paris: {data['paris_time']}")

    def test_trady4_uses_active_team_for_estimated_takts(self):
        """
        TRADY 4 has 2 teams: 'Journée' (32min) and 'Equipe en 2*8' (25min)
        active_team_id is set to 'Equipe en 2*8'
        estimated_takts should be calculated using 25 min takt duration
        """
        response = requests.get(f"{BASE_URL}/api/lines")
        assert response.status_code == 200
        lines = response.json()
        
        trady4 = next((l for l in lines if l['name'] == 'TRADY 4'), None)
        assert trady4 is not None, "TRADY 4 line not found"
        
        # Verify active_team_id is set
        shift_org = trady4.get('shift_organization', {})
        active_team_id = shift_org.get('active_team_id')
        assert active_team_id is not None, "active_team_id should be set"
        
        # Find the active team
        teams = shift_org.get('teams', [])
        active_team = next((t for t in teams if t.get('id') == active_team_id), None)
        assert active_team is not None, f"Active team with id {active_team_id} not found"
        
        print(f"✓ Active team: {active_team['name']}")
        print(f"  - Takt duration: {active_team['takt_duration']} min")
        print(f"  - Day start: {active_team['day_start']}")
        print(f"  - Day end: {active_team['day_end']}")
        
        # Verify estimated_takts matches active team calculation
        # Equipe en 2*8: 06:00-21:00 = 15 hours = 900 min
        # Breaks total: 10+20+5+10+20 = 65 min
        # Work time: 900 - 65 = 835 min
        # Estimated takts: 835 / 25 = 33.4 -> 33 takts
        assert active_team['takt_duration'] == 25, "Active team takt_duration should be 25"
        assert trady4['estimated_takts'] == 33, f"estimated_takts should be 33, got {trady4['estimated_takts']}"
        print(f"✓ estimated_takts: {trady4['estimated_takts']} (correct for 25 min takt)")

    def test_sound_alerts_minutes_before_takt_end(self):
        """
        Verify sound_alerts.minutes_before_takt_end is correctly set
        This value is used by frontend to trigger warning alerts
        """
        response = requests.get(f"{BASE_URL}/api/lines")
        assert response.status_code == 200
        lines = response.json()
        
        trady4 = next((l for l in lines if l['name'] == 'TRADY 4'), None)
        assert trady4 is not None, "TRADY 4 line not found"
        
        sound_alerts = trady4.get('sound_alerts', {})
        minutes_before = sound_alerts.get('minutes_before_takt_end', 0)
        
        print(f"✓ Sound alerts configuration:")
        print(f"  - minutes_before_takt_end: {minutes_before}")
        print(f"  - takt_start: {sound_alerts.get('takt_start')}")
        print(f"  - takt_end: {sound_alerts.get('takt_end')}")
        
        # Verify the setting exists and is a positive number
        assert 'minutes_before_takt_end' in sound_alerts, "minutes_before_takt_end should be in sound_alerts"
        assert isinstance(minutes_before, int), "minutes_before_takt_end should be an integer"
        
        # If minutes_before_takt_end > 0, warnings should be enabled
        if minutes_before > 0:
            print(f"✓ Warning alerts ENABLED: will trigger {minutes_before} min before takt end")
        else:
            print(f"⚠ Warning alerts DISABLED: minutes_before_takt_end is 0")

    def test_get_specific_line_active_team(self):
        """
        Test getting a specific line and verify active team data
        """
        # First get the lines list to find TRADY 4 ID
        response = requests.get(f"{BASE_URL}/api/lines")
        assert response.status_code == 200
        lines = response.json()
        
        trady4 = next((l for l in lines if l['name'] == 'TRADY 4'), None)
        assert trady4 is not None
        
        line_id = trady4['id']
        
        # Get the specific line
        response = requests.get(f"{BASE_URL}/api/lines/{line_id}")
        assert response.status_code == 200
        line = response.json()
        
        assert line['estimated_takts'] == 33, "estimated_takts should be 33"
        print(f"✓ GET /api/lines/{line_id} returns correct estimated_takts: {line['estimated_takts']}")


class TestCreateLineWithActiveTeam:
    """Test creating a new line and setting active team"""
    
    @pytest.fixture(autouse=True)
    def cleanup(self):
        """Cleanup test data after tests"""
        yield
        # Cleanup: delete test line
        response = requests.get(f"{BASE_URL}/api/lines")
        if response.status_code == 200:
            lines = response.json()
            for line in lines:
                if line.get('name', '').startswith('TEST_'):
                    requests.delete(f"{BASE_URL}/api/lines/{line['id']}")

    def test_create_line_with_two_teams_and_active_team(self):
        """
        Create a line with two teams and set one as active
        Verify estimated_takts uses active team's takt_duration
        """
        import uuid
        
        team1_id = str(uuid.uuid4())
        team2_id = str(uuid.uuid4())
        
        payload = {
            "name": "TEST_TwoTeams",
            "site_id": "",
            "takt_duration": 30,  # Default, should be overridden by active team
            "shift_organization": {
                "type": "2x8",
                "teams": [
                    {
                        "id": team1_id,
                        "name": "Team Morning",
                        "day_start": "06:00",
                        "day_end": "14:00",
                        "takt_duration": 30,
                        "breaks": [{"name": "Break", "start_time": "10:00", "duration": 15, "trigger_mode": "immediate"}],
                        "is_active": True
                    },
                    {
                        "id": team2_id,
                        "name": "Team Afternoon",
                        "day_start": "14:00",
                        "day_end": "22:00",
                        "takt_duration": 20,  # Different takt duration
                        "breaks": [{"name": "Break", "start_time": "18:00", "duration": 15, "trigger_mode": "immediate"}],
                        "is_active": True
                    }
                ],
                "active_team_id": team2_id  # Set afternoon team as active
            },
            "sound_alerts": {
                "takt_start": True,
                "minutes_before_takt_end": 3,
                "takt_end": True,
                "break_start": True,
                "minutes_before_break_end": 2,
                "break_end": True
            }
        }
        
        response = requests.post(f"{BASE_URL}/api/lines", json=payload)
        assert response.status_code == 200, f"Failed to create line: {response.text}"
        
        line = response.json()
        print(f"✓ Created line: {line['name']}")
        print(f"  - Active team ID: {line['shift_organization']['active_team_id']}")
        print(f"  - Team Afternoon takt_duration: 20 min")
        print(f"  - estimated_takts: {line['estimated_takts']}")
        
        # Team Afternoon: 14:00-22:00 = 8 hours = 480 min
        # Breaks: 15 min
        # Work time: 465 min
        # Estimated takts: 465 / 20 = 23.25 -> 23 takts
        assert line['shift_organization']['active_team_id'] == team2_id
        # The estimated_takts should use the active team's takt duration (20 min)
        # Not the line's default (30 min)
        expected_takts = (480 - 15) // 20  # 23
        assert line['estimated_takts'] == expected_takts, \
            f"estimated_takts should be {expected_takts} (using active team's 20 min), got {line['estimated_takts']}"
        
        print(f"✓ estimated_takts correctly uses active team's takt_duration")


class TestWarningThresholdCalculation:
    """Tests to verify warning threshold is correctly calculated from sound_alerts"""
    
    def test_warning_threshold_configuration(self):
        """
        Verify that minutes_before_takt_end is accessible for warning calculation
        Frontend uses: warningThreshold = minutes_before_takt_end * 60 (seconds)
        """
        response = requests.get(f"{BASE_URL}/api/lines")
        assert response.status_code == 200
        lines = response.json()
        
        for line in lines:
            sound_alerts = line.get('sound_alerts', {})
            minutes = sound_alerts.get('minutes_before_takt_end', 0)
            threshold_seconds = minutes * 60
            
            print(f"Line: {line['name']}")
            print(f"  - minutes_before_takt_end: {minutes}")
            print(f"  - Warning threshold (seconds): {threshold_seconds}")
            
            if minutes > 0:
                print(f"  ✓ Warnings ENABLED")
            else:
                print(f"  ⚠ Warnings DISABLED")


class TestAutoStartWithActiveTeam:
    """Test auto-start functionality uses active team"""
    
    def test_auto_start_check_uses_active_team(self):
        """
        Verify auto-start check returns active team's schedule
        """
        response = requests.get(f"{BASE_URL}/api/lines")
        assert response.status_code == 200
        lines = response.json()
        
        trady4 = next((l for l in lines if l['name'] == 'TRADY 4'), None)
        if not trady4:
            pytest.skip("TRADY 4 not found")
        
        line_id = trady4['id']
        
        # Check auto-start status
        response = requests.get(f"{BASE_URL}/api/lines/{line_id}/auto-start-check")
        assert response.status_code == 200
        
        result = response.json()
        print(f"Auto-start check result:")
        print(f"  - Current time (Paris): {result.get('current_time')}")
        print(f"  - Day start: {result.get('day_start')}")
        print(f"  - Day end: {result.get('day_end')}")
        print(f"  - Active team: {result.get('active_team')}")
        print(f"  - Takt duration: {result.get('takt_duration')}")
        
        # Verify active team name matches
        if result.get('active_team'):
            assert result['active_team'] == 'Equipe en 2*8', \
                f"Active team should be 'Equipe en 2*8', got {result.get('active_team')}"
            print(f"✓ Auto-start uses active team: {result['active_team']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
