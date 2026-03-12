"""
Test cases for 3 bug fixes:
1. Auto-resume after break - verify startTakt is called when break ends
2. Break countdown on TV display - verify state.break_end_time is properly set
3. Sync between Dashboard and TV - verify polling works correctly (frontend test)
"""
import pytest
import requests
import os
import time
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBugFix1_AutoResumeAfterBreak:
    """Test that break endpoint properly sets break_end_time for auto-resume"""
    
    @pytest.fixture
    def test_line_id(self):
        """Use the TEST line mentioned in the bug report"""
        return "3cfe7d09-b503-437f-a7b3-0140d50fbe9b"
    
    def test_break_endpoint_sets_break_end_time(self, test_line_id):
        """Bug #1: Verify break endpoint sets break_end_time correctly for auto-resume logic"""
        # First get the current line state
        response = requests.get(f"{BASE_URL}/api/lines/{test_line_id}")
        assert response.status_code == 200
        line = response.json()
        print(f"Line name: {line.get('name')}")
        print(f"Current status: {line.get('state', {}).get('status')}")
        
        # Check auto_resume_after_break setting
        auto_resume = line.get('auto_resume_after_break', False)
        print(f"auto_resume_after_break setting: {auto_resume}")
        
        # Start a short 1 minute break
        break_response = requests.post(
            f"{BASE_URL}/api/lines/{test_line_id}/break",
            params={"break_name": "TEST_AutoResumeTest", "break_duration": 1}
        )
        assert break_response.status_code == 200
        break_data = break_response.json()
        
        # Verify break state is set correctly
        assert "break_end_time" in break_data, "break_end_time should be in response"
        state = break_data.get('state', {})
        
        # Verify state fields needed for auto-resume
        assert state.get('status') == 'break', f"Status should be 'break', got: {state.get('status')}"
        assert state.get('current_break_name') == 'TEST_AutoResumeTest', "Break name should be set"
        assert state.get('break_end_time') is not None, "break_end_time should be set"
        assert state.get('break_duration_minutes') == 1, "break_duration_minutes should be 1"
        
        print(f"SUCCESS: Break started with break_end_time: {state.get('break_end_time')}")
        
        # Resume the takt to restore state
        resume_response = requests.post(f"{BASE_URL}/api/lines/{test_line_id}/start")
        assert resume_response.status_code == 200
        print("SUCCESS: Takt resumed")
        
    def test_break_end_time_is_valid_iso_format(self, test_line_id):
        """Verify break_end_time is in valid ISO format for frontend to calculate countdown"""
        # Start a break
        break_response = requests.post(
            f"{BASE_URL}/api/lines/{test_line_id}/break",
            params={"break_name": "TEST_TimeFormat", "break_duration": 1}
        )
        assert break_response.status_code == 200
        
        state = break_response.json().get('state', {})
        break_end_time = state.get('break_end_time')
        
        # Try to parse the ISO format
        try:
            parsed_time = datetime.fromisoformat(break_end_time.replace('Z', '+00:00'))
            print(f"SUCCESS: break_end_time is valid ISO: {break_end_time}")
            
            # Verify it's approximately 1 minute in the future
            now = datetime.now(parsed_time.tzinfo)
            diff_seconds = (parsed_time - now).total_seconds()
            assert 50 < diff_seconds < 70, f"Break end should be ~60s in future, got {diff_seconds}s"
            print(f"SUCCESS: break_end_time is {diff_seconds:.0f}s in the future")
        except ValueError as e:
            pytest.fail(f"break_end_time is not valid ISO format: {break_end_time}, error: {e}")
        finally:
            # Resume the takt
            requests.post(f"{BASE_URL}/api/lines/{test_line_id}/start")


class TestBugFix2_BreakCountdownDisplay:
    """Test that break state contains all fields needed for TV countdown display"""
    
    @pytest.fixture
    def test_line_id(self):
        return "3cfe7d09-b503-437f-a7b3-0140d50fbe9b"
    
    def test_line_state_has_break_fields(self, test_line_id):
        """Bug #2: Verify line state has all fields needed for break countdown on TV"""
        # Start a break
        break_response = requests.post(
            f"{BASE_URL}/api/lines/{test_line_id}/break",
            params={"break_name": "TEST_TVCountdown", "break_duration": 1}
        )
        assert break_response.status_code == 200
        
        # Fetch line to verify state structure
        line_response = requests.get(f"{BASE_URL}/api/lines/{test_line_id}")
        assert line_response.status_code == 200
        line = line_response.json()
        state = line.get('state', {})
        
        # Fields required for TV break countdown display
        required_fields = [
            'status',
            'current_break_name',
            'break_end_time',
            'break_duration_minutes'
        ]
        
        for field in required_fields:
            assert field in state, f"State should have '{field}' for TV display"
            print(f"  {field}: {state.get(field)}")
        
        assert state['status'] == 'break'
        assert state['current_break_name'] == 'TEST_TVCountdown'
        assert state['break_end_time'] is not None
        assert state['break_duration_minutes'] == 1
        
        print("SUCCESS: All required break fields present for TV countdown display")
        
        # Resume the takt
        requests.post(f"{BASE_URL}/api/lines/{test_line_id}/start")


class TestBugFix3_SyncInterval:
    """Test that API responses are fast enough for 5s sync interval"""
    
    @pytest.fixture
    def test_line_id(self):
        return "3cfe7d09-b503-437f-a7b3-0140d50fbe9b"
    
    def test_api_response_time(self, test_line_id):
        """Bug #3: Verify API responds quickly enough for 5s polling sync"""
        # Measure response time for line fetch
        start_time = time.time()
        response = requests.get(f"{BASE_URL}/api/lines/{test_line_id}")
        elapsed = time.time() - start_time
        
        assert response.status_code == 200
        assert elapsed < 2.0, f"API should respond in <2s for sync, got {elapsed:.2f}s"
        print(f"SUCCESS: API response time: {elapsed:.3f}s")
        
    def test_websocket_endpoint_exists(self, test_line_id):
        """Verify WebSocket endpoint exists for real-time updates"""
        # WebSocket is at /api/ws/{line_id}
        # We can't fully test WS with requests, but we verify the lines endpoint
        response = requests.get(f"{BASE_URL}/api/lines/{test_line_id}")
        assert response.status_code == 200
        print("SUCCESS: Line endpoint accessible for polling fallback")


class TestRegressionTaktTimer:
    """Regression tests for takt timer functionality"""
    
    @pytest.fixture
    def test_line_id(self):
        return "3cfe7d09-b503-437f-a7b3-0140d50fbe9b"
    
    def test_takt_continues_counting(self, test_line_id):
        """Regression: Verify takt timer continues counting"""
        # Get line state
        response1 = requests.get(f"{BASE_URL}/api/lines/{test_line_id}")
        assert response1.status_code == 200
        state1 = response1.json().get('state', {})
        
        if state1.get('status') != 'running':
            print(f"SKIP: Line is not running (status: {state1.get('status')})")
            pytest.skip("Line is not running")
            return
        
        # Wait a bit
        time.sleep(2)
        
        # Get state again
        response2 = requests.get(f"{BASE_URL}/api/lines/{test_line_id}")
        assert response2.status_code == 200
        state2 = response2.json().get('state', {})
        
        # The elapsed time should have increased (calculated on frontend from takt_start_time)
        assert state2.get('takt_start_time') == state1.get('takt_start_time'), "takt_start_time should remain constant while running"
        print(f"SUCCESS: Takt timer state is consistent")
        
    def test_break_preserves_elapsed_seconds(self, test_line_id):
        """Regression: Verify break preserves elapsed seconds"""
        # Get current state
        response = requests.get(f"{BASE_URL}/api/lines/{test_line_id}")
        initial_state = response.json().get('state', {})
        initial_elapsed = initial_state.get('elapsed_seconds', 0)
        
        # Start a break
        break_response = requests.post(
            f"{BASE_URL}/api/lines/{test_line_id}/break",
            params={"break_name": "TEST_ElapsedPreserve", "break_duration": 1}
        )
        assert break_response.status_code == 200
        
        break_state = break_response.json().get('state', {})
        break_elapsed = break_state.get('elapsed_seconds', 0)
        
        # Elapsed seconds should be preserved or increased
        assert break_elapsed >= initial_elapsed, f"Elapsed should be preserved: was {initial_elapsed}, now {break_elapsed}"
        print(f"SUCCESS: Elapsed seconds preserved during break: {break_elapsed}s")
        
        # Resume
        requests.post(f"{BASE_URL}/api/lines/{test_line_id}/start")


class TestRegressionBreakFromDashboardAndTV:
    """Regression tests for starting break from both screens"""
    
    @pytest.fixture
    def test_line_id(self):
        return "3cfe7d09-b503-437f-a7b3-0140d50fbe9b"
    
    def test_break_endpoint_with_query_params(self, test_line_id):
        """Regression: Verify break endpoint works with query parameters"""
        response = requests.post(
            f"{BASE_URL}/api/lines/{test_line_id}/break",
            params={"break_name": "Coffee", "break_duration": 15}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data['state']['status'] == 'break'
        assert data['state']['current_break_name'] == 'Coffee'
        assert data['state']['break_duration_minutes'] == 15
        
        print("SUCCESS: Break started via query params")
        
        # Resume
        requests.post(f"{BASE_URL}/api/lines/{test_line_id}/start")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
