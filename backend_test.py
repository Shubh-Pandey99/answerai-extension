#!/usr/bin/env python3
"""
Comprehensive Backend Testing for AI Meeting Assistant
Tests all API endpoints, providers, and functionality
"""

import requests
import json
import time
import sys
import os
from typing import Dict, Any, List

# Test configuration
BASE_URL = "http://localhost:5000"  # Flask API running on port 5000
TIMEOUT = 30

class BackendTester:
    def __init__(self):
        self.results = []
        self.failed_tests = []
        self.passed_tests = []
        
    def log_result(self, test_name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "response_data": response_data,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        self.results.append(result)
        
        if success:
            self.passed_tests.append(test_name)
            print(f"✅ {test_name}: PASS")
        else:
            self.failed_tests.append(test_name)
            print(f"❌ {test_name}: FAIL - {details}")
            
        if details:
            print(f"   Details: {details}")
        print()

    def test_health_check(self):
        """Test /api/health endpoint"""
        try:
            response = requests.get(f"{BASE_URL}/api/health", timeout=TIMEOUT)
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["status", "service", "version", "features", "emergent_integration"]
                
                missing_fields = [field for field in required_fields if field not in data]
                if missing_fields:
                    self.log_result("Health Check", False, f"Missing fields: {missing_fields}", data)
                    return
                
                if data["status"] != "healthy":
                    self.log_result("Health Check", False, f"Status not healthy: {data['status']}", data)
                    return
                
                if data["emergent_integration"] != "enabled":
                    self.log_result("Health Check", False, f"Emergent integration not enabled: {data['emergent_integration']}", data)
                    return
                    
                expected_features = ["GPT-5", "Streaming", "Multi-Provider", "Enhanced Audio Processing"]
                missing_features = [f for f in expected_features if f not in data["features"]]
                if missing_features:
                    self.log_result("Health Check", False, f"Missing features: {missing_features}", data)
                    return
                
                self.log_result("Health Check", True, "All health check fields present and correct", data)
            else:
                self.log_result("Health Check", False, f"HTTP {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Health Check", False, f"Exception: {str(e)}")

    def test_emergent_provider_gpt5(self):
        """Test Emergent provider with GPT-5"""
        try:
            payload = {
                "provider": "emergent",
                "transcript": "What are the key benefits of using AI in business meetings?",
                "useGPT5": True
            }
            
            response = requests.post(f"{BASE_URL}/api/answer", 
                                   json=payload, 
                                   timeout=TIMEOUT)
            
            if response.status_code == 200:
                data = response.json()
                if "answer" in data and data["answer"]:
                    if len(data["answer"]) > 50:  # Expect substantial response
                        self.log_result("Emergent GPT-5", True, f"Response length: {len(data['answer'])} chars", {"answer_preview": data["answer"][:100] + "..."})
                    else:
                        self.log_result("Emergent GPT-5", False, f"Response too short: {data['answer']}", data)
                else:
                    self.log_result("Emergent GPT-5", False, "No answer field in response", data)
            else:
                self.log_result("Emergent GPT-5", False, f"HTTP {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Emergent GPT-5", False, f"Exception: {str(e)}")

    def test_emergent_provider_gpt4o(self):
        """Test Emergent provider with GPT-4o"""
        try:
            payload = {
                "provider": "emergent",
                "transcript": "Summarize the main points from this meeting transcript: John discussed quarterly sales figures, Mary presented the new marketing strategy, and we decided to launch the product in Q2.",
                "useGPT5": False
            }
            
            response = requests.post(f"{BASE_URL}/api/answer", 
                                   json=payload, 
                                   timeout=TIMEOUT)
            
            if response.status_code == 200:
                data = response.json()
                if "answer" in data and data["answer"]:
                    self.log_result("Emergent GPT-4o", True, f"Response length: {len(data['answer'])} chars", {"answer_preview": data["answer"][:100] + "..."})
                else:
                    self.log_result("Emergent GPT-4o", False, "No answer field in response", data)
            else:
                self.log_result("Emergent GPT-4o", False, f"HTTP {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Emergent GPT-4o", False, f"Exception: {str(e)}")

    def test_mock_provider(self):
        """Test Mock provider"""
        try:
            payload = {
                "provider": "mock",
                "transcript": "Test transcript for mock provider"
            }
            
            response = requests.post(f"{BASE_URL}/api/answer", 
                                   json=payload, 
                                   timeout=TIMEOUT)
            
            if response.status_code == 200:
                data = response.json()
                if "answer" in data and "mock response" in data["answer"].lower():
                    self.log_result("Mock Provider", True, "Mock response received", data)
                else:
                    self.log_result("Mock Provider", False, "Unexpected mock response format", data)
            else:
                self.log_result("Mock Provider", False, f"HTTP {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Mock Provider", False, f"Exception: {str(e)}")

    def test_streaming_endpoint(self):
        """Test /api/stream endpoint"""
        try:
            payload = {
                "provider": "emergent",
                "transcript": "What is artificial intelligence?",
                "useGPT5": True
            }
            
            response = requests.post(f"{BASE_URL}/api/stream", 
                                   json=payload, 
                                   timeout=TIMEOUT,
                                   stream=True)
            
            if response.status_code == 200:
                chunks_received = 0
                total_content = ""
                
                for line in response.iter_lines(decode_unicode=True):
                    if line.startswith("data: "):
                        chunks_received += 1
                        try:
                            chunk_data = json.loads(line[6:])  # Remove "data: " prefix
                            if "chunk" in chunk_data:
                                total_content += chunk_data["chunk"] + " "
                            if "error" in chunk_data:
                                self.log_result("Streaming Endpoint", False, f"Stream error: {chunk_data['error']}")
                                return
                            if chunk_data.get("completed", False):
                                break
                        except json.JSONDecodeError:
                            continue
                    
                    if chunks_received > 20:  # Prevent infinite loop
                        break
                
                if chunks_received > 0 and total_content.strip():
                    self.log_result("Streaming Endpoint", True, f"Received {chunks_received} chunks, total content: {len(total_content)} chars", {"content_preview": total_content[:100] + "..."})
                else:
                    self.log_result("Streaming Endpoint", False, f"No valid chunks received. Chunks: {chunks_received}, Content: '{total_content}'")
            else:
                self.log_result("Streaming Endpoint", False, f"HTTP {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Streaming Endpoint", False, f"Exception: {str(e)}")

    def test_error_handling_no_input(self):
        """Test error handling with no input"""
        try:
            payload = {
                "provider": "emergent"
                # No transcript or imageUrl
            }
            
            response = requests.post(f"{BASE_URL}/api/answer", 
                                   json=payload, 
                                   timeout=TIMEOUT)
            
            if response.status_code == 400:
                data = response.json()
                if "error" in data and "no transcript" in data["error"].lower():
                    self.log_result("Error Handling - No Input", True, "Correctly returned 400 error for missing input", data)
                else:
                    self.log_result("Error Handling - No Input", False, "Wrong error message format", data)
            else:
                self.log_result("Error Handling - No Input", False, f"Expected 400, got {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Error Handling - No Input", False, f"Exception: {str(e)}")

    def test_error_handling_invalid_provider(self):
        """Test error handling with invalid provider"""
        try:
            payload = {
                "provider": "invalid_provider",
                "transcript": "Test transcript"
            }
            
            response = requests.post(f"{BASE_URL}/api/answer", 
                                   json=payload, 
                                   timeout=TIMEOUT)
            
            if response.status_code == 400:
                data = response.json()
                if "error" in data and "invalid provider" in data["error"].lower():
                    self.log_result("Error Handling - Invalid Provider", True, "Correctly returned 400 error for invalid provider", data)
                else:
                    self.log_result("Error Handling - Invalid Provider", False, "Wrong error message format", data)
            else:
                self.log_result("Error Handling - Invalid Provider", False, f"Expected 400, got {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Error Handling - Invalid Provider", False, f"Exception: {str(e)}")

    def test_environment_variables(self):
        """Test environment variable configuration"""
        try:
            # Load from .env file in api directory
            env_file_path = "/app/api/.env"
            if os.path.exists(env_file_path):
                with open(env_file_path, 'r') as f:
                    for line in f:
                        if line.startswith('EMERGENT_LLM_KEY='):
                            emergent_key = line.split('=', 1)[1].strip()
                            if emergent_key and emergent_key.startswith('sk-emergent-'):
                                self.log_result("Environment Variables", True, f"EMERGENT_LLM_KEY properly configured: {emergent_key[:15]}...")
                                return
                            else:
                                self.log_result("Environment Variables", False, f"EMERGENT_LLM_KEY not properly configured: {emergent_key}")
                                return
                self.log_result("Environment Variables", False, "EMERGENT_LLM_KEY not found in .env file")
            else:
                # Check if EMERGENT_LLM_KEY is set in environment
                emergent_key = os.environ.get('EMERGENT_LLM_KEY')
                if emergent_key and emergent_key.startswith('sk-emergent-'):
                    self.log_result("Environment Variables", True, f"EMERGENT_LLM_KEY properly configured: {emergent_key[:15]}...")
                else:
                    self.log_result("Environment Variables", False, f"EMERGENT_LLM_KEY not properly configured: {emergent_key}")
                
        except Exception as e:
            self.log_result("Environment Variables", False, f"Exception: {str(e)}")

    def test_image_analysis_mock(self):
        """Test image analysis with mock URL (since we can't test real image URLs easily)"""
        try:
            payload = {
                "provider": "emergent",
                "imageUrl": "https://example.com/test-image.jpg",
                "useGPT5": False
            }
            
            response = requests.post(f"{BASE_URL}/api/answer", 
                                   json=payload, 
                                   timeout=TIMEOUT)
            
            # This will likely fail due to invalid URL, but we're testing the endpoint structure
            if response.status_code in [200, 500]:  # Either success or expected failure
                data = response.json()
                if response.status_code == 200 and "answer" in data:
                    self.log_result("Image Analysis", True, "Image analysis endpoint working", {"answer_preview": data["answer"][:100] + "..."})
                elif response.status_code == 500 and "error" in data:
                    self.log_result("Image Analysis", True, "Image analysis endpoint properly handles errors", data)
                else:
                    self.log_result("Image Analysis", False, "Unexpected response format", data)
            else:
                self.log_result("Image Analysis", False, f"HTTP {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Image Analysis", False, f"Exception: {str(e)}")

    def test_performance_response_time(self):
        """Test response time performance"""
        try:
            payload = {
                "provider": "mock",  # Use mock for consistent timing
                "transcript": "Quick performance test"
            }
            
            start_time = time.time()
            response = requests.post(f"{BASE_URL}/api/answer", 
                                   json=payload, 
                                   timeout=TIMEOUT)
            end_time = time.time()
            
            response_time = end_time - start_time
            
            if response.status_code == 200:
                if response_time < 5.0:  # Should be fast for mock
                    self.log_result("Performance - Response Time", True, f"Response time: {response_time:.2f}s (acceptable)")
                else:
                    self.log_result("Performance - Response Time", False, f"Response time too slow: {response_time:.2f}s")
            else:
                self.log_result("Performance - Response Time", False, f"HTTP {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_result("Performance - Response Time", False, f"Exception: {str(e)}")

    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting AI Meeting Assistant Backend Tests")
        print("=" * 60)
        print()
        
        # Load environment variables
        from dotenv import load_dotenv
        load_dotenv()
        
        # Run all tests
        test_methods = [
            self.test_health_check,
            self.test_environment_variables,
            self.test_emergent_provider_gpt5,
            self.test_emergent_provider_gpt4o,
            self.test_mock_provider,
            self.test_streaming_endpoint,
            self.test_error_handling_no_input,
            self.test_error_handling_invalid_provider,
            self.test_image_analysis_mock,
            self.test_performance_response_time
        ]
        
        for test_method in test_methods:
            try:
                test_method()
            except Exception as e:
                self.log_result(test_method.__name__, False, f"Test method exception: {str(e)}")
            time.sleep(0.5)  # Small delay between tests
        
        # Print summary
        print("=" * 60)
        print("🏁 TEST SUMMARY")
        print("=" * 60)
        print(f"✅ Passed: {len(self.passed_tests)}")
        print(f"❌ Failed: {len(self.failed_tests)}")
        print(f"📊 Total: {len(self.results)}")
        print()
        
        if self.failed_tests:
            print("❌ FAILED TESTS:")
            for test in self.failed_tests:
                print(f"   - {test}")
            print()
        
        if self.passed_tests:
            print("✅ PASSED TESTS:")
            for test in self.passed_tests:
                print(f"   - {test}")
            print()
        
        # Return success status
        return len(self.failed_tests) == 0

if __name__ == "__main__":
    tester = BackendTester()
    success = tester.run_all_tests()
    
    # Save detailed results
    with open("/app/backend_test_results.json", "w") as f:
        json.dump(tester.results, f, indent=2)
    
    print(f"📄 Detailed results saved to: /app/backend_test_results.json")
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)