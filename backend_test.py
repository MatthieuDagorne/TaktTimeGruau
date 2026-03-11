import requests
import sys
import json
from datetime import datetime

class TaktTimeAPITester:
    def __init__(self, base_url="https://takt-timer.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.created_line_id = None

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
            "takt_duration": 25,
            "day_start": "08:00",
            "day_end": "17:00",
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
    print("🚀 Starting Takt Time API Tests")
    print("="*50)
    
    tester = TaktTimeAPITester()
    
    # Run all tests in order
    test_methods = [
        tester.test_api_root,
        tester.test_get_lines_empty,
        tester.test_create_line,
        tester.test_get_single_line,
        tester.test_get_lines_with_data,
        tester.test_update_line,
        tester.test_start_takt,
        tester.test_pause_takt,
        tester.test_next_takt,
        tester.test_stop_takt,
        tester.test_start_break,
        tester.test_get_nonexistent_line,
        tester.test_delete_line,
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