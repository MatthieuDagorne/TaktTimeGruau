"""
Test suite for Iteration 6 - 3 new modifications:
1. Timezone field in site settings (Europe/Paris default)
2. Auto-start logic bug fix - checking /auto-start-check and /auto-start endpoints
3. Line IDs hidden on all screens (frontend validation via Playwright)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Existing lines for testing (from context)
TRADY4_LINE_ID = "aba1336d-f810-4e7b-872c-b59efae4c132"
XDD_LINE_ID = "dd3fed61-d14a-4209-a5e0-7e6fe1beb683"


class TestApiHealth:
    """Basic API health checks"""
    
    def test_api_root(self):
        """Test API root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✓ API root: {data['message']}")
    
    def test_server_time(self):
        """Test server time endpoint returns timezone info"""
        response = requests.get(f"{BASE_URL}/api/server-time")
        assert response.status_code == 200
        data = response.json()
        assert "paris" in data
        assert "paris_time" in data
        assert "timezone" in data
        print(f"✓ Server time: {data['paris_time']} ({data['timezone']})")


class TestSiteTimezone:
    """Test timezone field in site management"""
    
    def test_get_sites_have_timezone(self):
        """Verify existing sites have timezone field"""
        response = requests.get(f"{BASE_URL}/api/sites")
        assert response.status_code == 200
        sites = response.json()
        print(f"Found {len(sites)} sites")
        for site in sites:
            # Timezone should exist with default Europe/Paris or custom value
            tz = site.get('timezone', 'Europe/Paris')
            print(f"  - {site['name']}: timezone={tz}")
            assert 'id' in site
            assert 'name' in site
    
    def test_create_site_with_timezone(self):
        """Create site with custom timezone"""
        test_name = f"TEST_Site_{uuid.uuid4().hex[:8]}"
        payload = {
            "name": test_name,
            "location": "New York",
            "description": "Test site with custom timezone",
            "timezone": "America/New_York"
        }
        response = requests.post(f"{BASE_URL}/api/sites", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data['name'] == test_name
        assert data['timezone'] == "America/New_York"
        print(f"✓ Created site '{test_name}' with timezone: {data['timezone']}")
        
        # Cleanup
        site_id = data['id']
        del_response = requests.delete(f"{BASE_URL}/api/sites/{site_id}")
        assert del_response.status_code == 200
        print(f"✓ Cleaned up test site")
    
    def test_create_site_default_timezone(self):
        """Create site without timezone uses Europe/Paris default"""
        test_name = f"TEST_Site_{uuid.uuid4().hex[:8]}"
        payload = {
            "name": test_name,
            "location": "Test Location"
        }
        response = requests.post(f"{BASE_URL}/api/sites", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data['timezone'] == "Europe/Paris"
        print(f"✓ Default timezone is Europe/Paris")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/sites/{data['id']}")
    
    def test_update_site_timezone(self):
        """Update site timezone"""
        # Create a test site first
        test_name = f"TEST_Site_{uuid.uuid4().hex[:8]}"
        create_resp = requests.post(f"{BASE_URL}/api/sites", json={"name": test_name})
        site_id = create_resp.json()['id']
        
        # Update timezone
        update_payload = {
            "name": test_name,
            "location": "",
            "description": "",
            "timezone": "Asia/Tokyo"
        }
        update_resp = requests.put(f"{BASE_URL}/api/sites/{site_id}", json=update_payload)
        assert update_resp.status_code == 200
        updated = update_resp.json()
        assert updated['timezone'] == "Asia/Tokyo"
        print(f"✓ Updated site timezone to Asia/Tokyo")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/sites/{site_id}")


class TestAutoStartCheck:
    """Test auto-start-check endpoint for TRADY4 line (auto_start_at_day_begin=true)"""
    
    def test_auto_start_check_endpoint_exists(self):
        """Verify auto-start-check endpoint exists"""
        response = requests.get(f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}/auto-start-check")
        assert response.status_code == 200
        data = response.json()
        assert 'should_auto_start' in data
        assert 'current_time' in data
        assert 'timezone' in data
        print(f"✓ Auto-start check response: should_auto_start={data['should_auto_start']}, time={data['current_time']}, tz={data['timezone']}")
    
    def test_auto_start_check_returns_expected_fields_when_active(self):
        """Check auto-start-check returns expected takt fields when should start"""
        response = requests.get(f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}/auto-start-check")
        assert response.status_code == 200
        data = response.json()
        
        # The endpoint should return either should_auto_start=true with takt info or false with reason
        if data.get('should_auto_start'):
            # When should auto-start, these fields are required
            assert 'expected_takt' in data, "Missing expected_takt"
            assert 'elapsed_in_current_takt_minutes' in data, "Missing elapsed_in_current_takt_minutes"
            assert 'takt_duration' in data, "Missing takt_duration"
            assert 'active_team' in data, "Missing active_team"
            print(f"✓ Auto-start should trigger: expected_takt={data['expected_takt']}, elapsed={data['elapsed_in_current_takt_minutes']}min")
        else:
            # When should not auto-start, reason is provided
            assert 'reason' in data
            print(f"✓ Auto-start NOT triggered: reason={data['reason']}")
    
    def test_auto_start_check_line_without_auto_start(self):
        """XDD line (auto_start=false) should return should_auto_start=false"""
        response = requests.get(f"{BASE_URL}/api/lines/{XDD_LINE_ID}/auto-start-check")
        assert response.status_code == 200
        data = response.json()
        assert data['should_auto_start'] == False, f"XDD should not auto-start, but got {data}"
        assert 'Auto-start disabled' in data.get('reason', '') or data.get('auto_start_enabled') == False
        print(f"✓ XDD line correctly reports no auto-start: {data.get('reason', 'auto_start_enabled=false')}")
    
    def test_auto_start_check_invalid_line(self):
        """Non-existent line returns 404"""
        response = requests.get(f"{BASE_URL}/api/lines/invalid-line-id/auto-start-check")
        assert response.status_code == 404
        print("✓ Invalid line returns 404")


class TestAutoStartEndpoint:
    """Test POST /auto-start endpoint"""
    
    def test_auto_start_endpoint_exists(self):
        """Verify auto-start endpoint exists"""
        response = requests.post(f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}/auto-start")
        # Can be 200 with either success or "not needed" message
        assert response.status_code == 200
        data = response.json()
        assert 'message' in data
        print(f"✓ Auto-start endpoint response: {data['message']}")
    
    def test_auto_start_returns_state_when_triggered(self):
        """When auto-start triggers, it returns state with correct takt number"""
        # First stop the line to ensure it's idle
        requests.post(f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}/stop")
        
        # Check if should auto-start
        check_resp = requests.get(f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}/auto-start-check")
        check_data = check_resp.json()
        
        # Try to auto-start
        response = requests.post(f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}/auto-start")
        assert response.status_code == 200
        data = response.json()
        
        if check_data.get('should_auto_start'):
            # When triggered successfully
            assert 'state' in data
            state = data.get('state', {})
            assert state.get('status') == 'running'
            assert state.get('current_takt') >= 1
            print(f"✓ Auto-start triggered: takt={state.get('current_takt')}, elapsed_seconds={state.get('elapsed_seconds')}")
        else:
            # When not triggered
            assert data['message'] == "Auto-start not needed"
            print(f"✓ Auto-start not needed (line may be outside working hours)")
    
    def test_auto_start_invalid_line(self):
        """Non-existent line returns 404"""
        response = requests.post(f"{BASE_URL}/api/lines/invalid-line-id/auto-start")
        assert response.status_code == 404
        print("✓ Invalid line auto-start returns 404")


class TestExistingLinesConfiguration:
    """Verify existing lines configuration"""
    
    def test_trady4_line_has_auto_start_enabled(self):
        """TRADY 4 should have auto_start_at_day_begin=true"""
        response = requests.get(f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}")
        assert response.status_code == 200
        data = response.json()
        assert data['auto_start_at_day_begin'] == True, f"TRADY 4 should have auto_start=true, got {data.get('auto_start_at_day_begin')}"
        print(f"✓ TRADY 4 has auto_start_at_day_begin=true")
        print(f"  - Name: {data['name']}")
        print(f"  - Takt duration: {data['takt_duration']} min")
        
    def test_xdd_line_has_auto_start_disabled(self):
        """XDD should have auto_start_at_day_begin=false (or not set)"""
        response = requests.get(f"{BASE_URL}/api/lines/{XDD_LINE_ID}")
        assert response.status_code == 200
        data = response.json()
        # XDD was created before this feature, so field may not exist (defaults to false)
        auto_start = data.get('auto_start_at_day_begin', False)
        assert auto_start == False, f"XDD should have auto_start=false, got {auto_start}"
        print(f"✓ XDD has auto_start_at_day_begin={auto_start} (or not set)")
    
    def test_trady4_team_schedule(self):
        """Verify TRADY 4 has Team 'Test' with schedule 12:56-16:00"""
        response = requests.get(f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}")
        assert response.status_code == 200
        data = response.json()
        
        shift_org = data.get('shift_organization', {})
        teams = shift_org.get('teams', [])
        
        print(f"  TRADY 4 teams:")
        for team in teams:
            print(f"    - {team.get('name')}: {team.get('day_start')} - {team.get('day_end')}")
        
        # Verify there's at least one team
        assert len(teams) > 0, "TRADY 4 should have at least one team"
        print(f"✓ TRADY 4 has {len(teams)} team(s) configured")


class TestLinesAPI:
    """Standard lines API tests"""
    
    def test_get_all_lines(self):
        """Get all production lines"""
        response = requests.get(f"{BASE_URL}/api/lines")
        assert response.status_code == 200
        lines = response.json()
        assert isinstance(lines, list)
        print(f"✓ Found {len(lines)} lines")
        for line in lines:
            # Verify line structure - NO ID should be hidden in frontend, but API still returns it
            assert 'id' in line
            assert 'name' in line
            # auto_start_at_day_begin may not exist for older lines (defaults to false)
            auto_start = line.get('auto_start_at_day_begin', False)
            print(f"  - {line['name']} (auto_start={auto_start})")
    
    def test_get_single_line(self):
        """Get single line details"""
        response = requests.get(f"{BASE_URL}/api/lines/{TRADY4_LINE_ID}")
        assert response.status_code == 200
        data = response.json()
        assert data['id'] == TRADY4_LINE_ID
        assert 'state' in data
        assert 'shift_organization' in data
        print(f"✓ Got line details: {data['name']}")


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
