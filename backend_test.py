import requests
import sys
import json
from datetime import datetime

class TaktTimeAPITester:
    def __init__(self, base_url="https://takt-control-panel.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.created_line_id = None
        self.created_site_id = None
        self.created_screen_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}" if endpoint else f"{self.api_url}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, params=params)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            print(f"   Status: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed")
                try:
                    response_data = response.json()
                    if isinstance(response_data, dict) and len(str(response_data)) < 500:
                        print(f"   Response: {response_data}")
                    return True, response_data
                except:
                    return True, response.text
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except requests.exceptions.RequestException as e:
            print(f"❌ Failed - Network Error: {str(e)}")
            return False, {}
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_api_root(self):
        """Test API root endpoint"""
        success, response = self.run_test("API Root", "GET", "", 200)
        return success

    def test_get_lines_empty(self):
        """Test getting lines (might be empty initially)"""
        success, response = self.run_test("Get All Lines (Initial)", "GET", "lines", 200)
        if success and isinstance(response, list):
            print(f"   Found {len(response)} existing lines")
        return success

    def test_create_line(self):
        """Test creating a new production line"""
        line_data = {
            "name": f"Test Line {datetime.now().strftime('%H:%M:%S')}",
            "site_id": self.created_site_id if self.created_site_id else "",
            "takt_duration": 25,
            "team_config": {
                "name": "Équipe Test",
                "shift_type": "1x8",
                "weekly_schedule": {
                    "monday": {"day_start": "08:00", "day_end": "17:00", "is_working_day": True},
                    "tuesday": {"day_start": "08:00", "day_end": "17:00", "is_working_day": True},
                    "wednesday": {"day_start": "08:00", "day_end": "17:00", "is_working_day": True},
                    "thursday": {"day_start": "08:00", "day_end": "17:00", "is_working_day": True},
                    "friday": {"day_start": "08:00", "day_end": "16:00", "is_working_day": True},
                    "saturday": {"day_start": "08:00", "day_end": "17:00", "is_working_day": False},
                    "sunday": {"day_start": "08:00", "day_end": "17:00", "is_working_day": False}
                }
            },
            "breaks": [
                {"name": "Pause Matin", "start_time": "10:00", "duration": 15},
                {"name": "Pause Midi", "start_time": "12:00", "duration": 60},
                {"name": "Pause Après-midi", "start_time": "15:00", "duration": 15}
            ],
            "auto_resume_after_break": True,
            "auto_resume_after_takt": True,
            "sound_alerts": {
                "takt_start": True,
                "minutes_before_takt_end": 5,
                "takt_end": True,
                "break_start": True,
                "minutes_before_break_end": 5,
                "break_end": True
            }
        }
        
        success, response = self.run_test("Create New Line", "POST", "lines", 200, line_data)
        if success and isinstance(response, dict) and 'id' in response:
            self.created_line_id = response['id']
            print(f"   Created line ID: {self.created_line_id}")
        return success

    def test_get_single_line(self):
        """Test getting a specific line"""
        if not self.created_line_id:
            print("❌ No line ID available for single line test")
            return False
        
        success, response = self.run_test(
            f"Get Line {self.created_line_id[:8]}", 
            "GET", 
            f"lines/{self.created_line_id}", 
            200
        )
        return success

    def test_get_lines_with_data(self):
        """Test getting all lines after creating one"""
        success, response = self.run_test("Get All Lines (With Data)", "GET", "lines", 200)
        if success and isinstance(response, list) and len(response) > 0:
            print(f"   Lines found: {len(response)}")
            # Use the first line's ID if we don't have one
            if not self.created_line_id and len(response) > 0:
                self.created_line_id = response[0].get('id')
                print(f"   Using existing line ID: {self.created_line_id}")
        return success

    def test_update_line(self):
        """Test updating a line"""
        if not self.created_line_id:
            print("❌ No line ID available for update test")
            return False
        
        update_data = {
            "name": f"Updated Test Line {datetime.now().strftime('%H:%M:%S')}",
            "takt_duration": 35
        }
        
        success, response = self.run_test(
            f"Update Line {self.created_line_id[:8]}", 
            "PUT", 
            f"lines/{self.created_line_id}", 
            200, 
            update_data
        )
        return success

    def test_start_takt(self):
        """Test starting a takt"""
        if not self.created_line_id:
            print("❌ No line ID available for start takt test")
            return False
        
        success, response = self.run_test(
            f"Start Takt {self.created_line_id[:8]}", 
            "POST", 
            f"lines/{self.created_line_id}/start", 
            200
        )
        return success

    def test_pause_takt(self):
        """Test pausing a takt"""
        if not self.created_line_id:
            print("❌ No line ID available for pause takt test")
            return False
        
        success, response = self.run_test(
            f"Pause Takt {self.created_line_id[:8]}", 
            "POST", 
            f"lines/{self.created_line_id}/pause", 
            200
        )
        return success

    def test_next_takt(self):
        """Test moving to next takt"""
        if not self.created_line_id:
            print("❌ No line ID available for next takt test")
            return False
        
        success, response = self.run_test(
            f"Next Takt {self.created_line_id[:8]}", 
            "POST", 
            f"lines/{self.created_line_id}/next", 
            200
        )
        return success

    def test_stop_takt(self):
        """Test stopping a takt"""
        if not self.created_line_id:
            print("❌ No line ID available for stop takt test")
            return False
        
        success, response = self.run_test(
            f"Stop Takt {self.created_line_id[:8]}", 
            "POST", 
            f"lines/{self.created_line_id}/stop", 
            200
        )
        return success

    def test_start_break(self):
        """Test starting a break"""
        if not self.created_line_id:
            print("❌ No line ID available for break test")
            return False
        
        success, response = self.run_test(
            f"Start Break {self.created_line_id[:8]}", 
            "POST", 
            f"lines/{self.created_line_id}/break", 
            200,
            params={"break_name": "Pause Matin"}
        )
        return success

    # ==================== SITES API TESTS ====================
    def test_get_sites_empty(self):
        """Test getting sites (might be empty initially)"""
        success, response = self.run_test("Get All Sites (Initial)", "GET", "sites", 200)
        if success and isinstance(response, list):
            print(f"   Found {len(response)} existing sites")
        return success

    def test_create_site(self):
        """Test creating a new site"""
        site_data = {
            "name": f"Test Site {datetime.now().strftime('%H:%M:%S')}",
            "location": "Lyon, France",
            "description": "Site de test pour l'API"
        }
        
        success, response = self.run_test("Create New Site", "POST", "sites", 200, site_data)
        if success and isinstance(response, dict) and 'id' in response:
            self.created_site_id = response['id']
            print(f"   Created site ID: {self.created_site_id}")
        return success

    def test_get_sites_with_data(self):
        """Test getting all sites after creating one"""
        success, response = self.run_test("Get All Sites (With Data)", "GET", "sites", 200)
        if success and isinstance(response, list) and len(response) > 0:
            print(f"   Sites found: {len(response)}")
            # Use the first site's ID if we don't have one
            if not self.created_site_id and len(response) > 0:
                self.created_site_id = response[0].get('id')
                print(f"   Using existing site ID: {self.created_site_id}")
        return success

    def test_get_single_site(self):
        """Test getting a specific site"""
        if not self.created_site_id:
            print("❌ No site ID available for single site test")
            return False
        
        success, response = self.run_test(
            f"Get Site {self.created_site_id[:8]}", 
            "GET", 
            f"sites/{self.created_site_id}", 
            200
        )
        return success

    def test_update_site(self):
        """Test updating a site"""
        if not self.created_site_id:
            print("❌ No site ID available for update test")
            return False
        
        update_data = {
            "name": f"Updated Test Site {datetime.now().strftime('%H:%M:%S')}",
            "location": "Paris, France",
            "description": "Site mis à jour"
        }
        
        success, response = self.run_test(
            f"Update Site {self.created_site_id[:8]}", 
            "PUT", 
            f"sites/{self.created_site_id}", 
            200, 
            update_data
        )
        return success

    # ==================== SCREENS API TESTS ====================
    def test_get_screens_empty(self):
        """Test getting screens (might be empty initially)"""
        success, response = self.run_test("Get All Screens (Initial)", "GET", "screens", 200)
        if success and isinstance(response, list):
            print(f"   Found {len(response)} existing screens")
        return success

    def test_create_screen(self):
        """Test creating a new screen"""
        if not self.created_line_id:
            print("❌ No line ID available for screen creation")
            return False
            
        screen_data = {
            "name": f"Test Screen {datetime.now().strftime('%H:%M:%S')}",
            "ip_address": "192.168.1.100",
            "line_id": self.created_line_id,
            "position": "debut",
            "is_active": True
        }
        
        success, response = self.run_test("Create New Screen", "POST", "screens", 200, screen_data)
        if success and isinstance(response, dict) and 'id' in response:
            self.created_screen_id = response['id']
            print(f"   Created screen ID: {self.created_screen_id}")
        return success

    def test_get_screens_with_data(self):
        """Test getting all screens after creating one"""
        success, response = self.run_test("Get All Screens (With Data)", "GET", "screens", 200)
        if success and isinstance(response, list):
            print(f"   Screens found: {len(response)}")
        return success

    def test_get_screens_by_line(self):
        """Test getting screens filtered by line"""
        if not self.created_line_id:
            print("❌ No line ID available for filtered screens test")
            return False
            
        success, response = self.run_test(
            f"Get Screens by Line {self.created_line_id[:8]}", 
            "GET", 
            "screens", 
            200,
            params={"line_id": self.created_line_id}
        )
        return success

    def test_get_single_screen(self):
        """Test getting a specific screen"""
        if not self.created_screen_id:
            print("❌ No screen ID available for single screen test")
            return False
        
        success, response = self.run_test(
            f"Get Screen {self.created_screen_id[:8]}", 
            "GET", 
            f"screens/{self.created_screen_id}", 
            200
        )
        return success

    def test_update_screen(self):
        """Test updating a screen"""
        if not self.created_screen_id:
            print("❌ No screen ID available for update test")
            return False
        
        update_data = {
            "name": f"Updated Test Screen {datetime.now().strftime('%H:%M:%S')}",
            "ip_address": "192.168.1.101",
            "line_id": self.created_line_id,
            "position": "fin",
            "is_active": False
        }
        
        success, response = self.run_test(
            f"Update Screen {self.created_screen_id[:8]}", 
            "PUT", 
            f"screens/{self.created_screen_id}", 
            200, 
            update_data
        )
        return success

    def test_ping_screen(self):
        """Test pinging a screen"""
        if not self.created_screen_id:
            print("❌ No screen ID available for ping test")
            return False
        
        success, response = self.run_test(
            f"Ping Screen {self.created_screen_id[:8]}", 
            "POST", 
            f"screens/{self.created_screen_id}/ping", 
            200
        )
        return success

    # ==================== EVENTS & STATISTICS API TESTS ====================
    def test_get_events(self):
        """Test getting events"""
        success, response = self.run_test("Get Events", "GET", "events", 200)
        if success and isinstance(response, list):
            print(f"   Events found: {len(response)}")
        return success

    def test_get_events_by_line(self):
        """Test getting events filtered by line"""
        if not self.created_line_id:
            print("❌ No line ID available for events test")
            return False
            
        success, response = self.run_test(
            f"Get Events by Line {self.created_line_id[:8]}", 
            "GET", 
            "events", 
            200,
            params={"line_id": self.created_line_id, "days": 1}
        )
        return success

    def test_get_statistics(self):
        """Test getting statistics for a line"""
        if not self.created_line_id:
            print("❌ No line ID available for statistics test")
            return False
        
        success, response = self.run_test(
            f"Get Statistics for Line {self.created_line_id[:8]}", 
            "GET", 
            f"statistics/{self.created_line_id}", 
            200,
            params={"days": 1}
        )
        return success

    def test_export_csv(self):
        """Test CSV export endpoint"""
        success, response = self.run_test(
            "Export CSV", 
            "GET", 
            "export/csv", 
            200,
            params={"days": 1}
        )
        return success

    # ==================== CLEANUP TESTS ====================
    def test_delete_screen(self):
        """Test deleting a screen"""
        if not self.created_screen_id:
            print("❌ No screen ID available for delete test")
            return False
        
        success, response = self.run_test(
            f"Delete Screen {self.created_screen_id[:8]}", 
            "DELETE", 
            f"screens/{self.created_screen_id}", 
            200
        )
        return success

    def test_delete_line(self):
        """Test deleting a line"""
        if not self.created_line_id:
            print("❌ No line ID available for delete test")
            return False
        
        success, response = self.run_test(
            f"Delete Line {self.created_line_id[:8]}", 
            "DELETE", 
            f"lines/{self.created_line_id}", 
            200
        )
        return success

    def test_delete_site(self):
        """Test deleting a site"""
        if not self.created_site_id:
            print("❌ No site ID available for delete test")
            return False
        
        success, response = self.run_test(
            f"Delete Site {self.created_site_id[:8]}", 
            "DELETE", 
            f"sites/{self.created_site_id}", 
            200
        )
        return success

    def test_get_nonexistent_line(self):
        """Test getting a non-existent line"""
        fake_id = "nonexistent-line-id"
        success, response = self.run_test(
            "Get Non-existent Line", 
            "GET", 
            f"lines/{fake_id}", 
            404
        )
        return success

def main():
    print("🚀 Starting Takt Time API Tests v2")
    print("="*50)
    
    tester = TaktTimeAPITester()
    
    # Run all tests in logical order
    test_methods = [
        # Basic API
        tester.test_api_root,
        
        # Sites API
        tester.test_get_sites_empty,
        tester.test_create_site,
        tester.test_get_sites_with_data,
        tester.test_get_single_site,
        tester.test_update_site,
        
        # Lines API
        tester.test_get_lines_empty,
        tester.test_create_line,
        tester.test_get_single_line,
        tester.test_get_lines_with_data,
        tester.test_update_line,
        
        # Screens API
        tester.test_get_screens_empty,
        tester.test_create_screen,
        tester.test_get_screens_with_data,
        tester.test_get_screens_by_line,
        tester.test_get_single_screen,
        tester.test_update_screen,
        tester.test_ping_screen,
        
        # Takt Control
        tester.test_start_takt,
        tester.test_pause_takt,
        tester.test_next_takt,
        tester.test_stop_takt,
        tester.test_start_break,
        
        # Events & Statistics
        tester.test_get_events,
        tester.test_get_events_by_line,
        tester.test_get_statistics,
        tester.test_export_csv,
        
        # Error handling
        tester.test_get_nonexistent_line,
        
        # Cleanup
        tester.test_delete_screen,
        tester.test_delete_line,
        tester.test_delete_site,
    ]
    
    failed_tests = []
    
    for test_method in test_methods:
        try:
            if not test_method():
                failed_tests.append(test_method.__name__)
        except Exception as e:
            print(f"❌ {test_method.__name__} crashed: {str(e)}")
            failed_tests.append(test_method.__name__)
    
    # Print results
    print("\n" + "="*50)
    print(f"📊 Tests Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    if failed_tests:
        print(f"❌ Failed tests: {', '.join(failed_tests)}")
        return 1
    else:
        print("✅ All tests passed!")
        return 0

if __name__ == "__main__":
    sys.exit(main())