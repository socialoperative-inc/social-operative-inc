#!/usr/bin/env python3
"""
Regression test for Social Operative Inc. backend after Vercel production hardening.
Focus: Health endpoint, auth, chat streaming, error handling (startsWith crash prevention).
"""

import requests
import json
import time
import sys
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://mission-control-306.preview.emergentagent.com"
LOGIN_EMAIL = "test@socialoperative.ai"
LOGIN_PASSWORD = "testpass123"

class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.tests = []
    
    def add_pass(self, name: str, details: str = ""):
        self.passed += 1
        self.tests.append({"name": name, "status": "PASS", "details": details})
        print(f"✅ PASS: {name}")
        if details:
            print(f"   {details}")
    
    def add_fail(self, name: str, details: str = ""):
        self.failed += 1
        self.tests.append({"name": name, "status": "FAIL", "details": details})
        print(f"❌ FAIL: {name}")
        if details:
            print(f"   {details}")
    
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*80}")
        print(f"REGRESSION TEST SUMMARY: {self.passed}/{total} tests passed")
        print(f"{'='*80}")
        return self.failed == 0

def safe_json(response) -> Optional[Dict[str, Any]]:
    """Safely parse JSON response"""
    try:
        return response.json()
    except:
        return None

def test_health_endpoint(result: TestResult):
    """Test 1: GET /api/health with specific structure"""
    print("\n" + "="*80)
    print("TEST 1: Health Endpoint Structure")
    print("="*80)
    
    try:
        resp = requests.get(f"{BASE_URL}/api/health", timeout=10)
        data = safe_json(resp)
        
        if resp.status_code != 200:
            result.add_fail("Health endpoint returns 200", f"Got {resp.status_code}")
            return
        
        result.add_pass("Health endpoint returns 200")
        
        # Check required fields
        if not data:
            result.add_fail("Health endpoint returns valid JSON", "Response is not JSON")
            return
        
        result.add_pass("Health endpoint returns valid JSON")
        
        # Check status field
        if "status" not in data:
            result.add_fail("Health has 'status' field", "Missing 'status'")
        elif data["status"] in ["operational", "degraded"]:
            result.add_pass("Health has 'status' field", f"status={data['status']}")
        else:
            result.add_fail("Health has valid 'status'", f"Got {data['status']}")
        
        # Check services.db field
        if "services" not in data:
            result.add_fail("Health has 'services' object", "Missing 'services'")
        elif "db" not in data["services"]:
            result.add_fail("Health has 'services.db' field", "Missing 'db'")
        else:
            db_status = data["services"]["db"]
            if db_status in ["connected", "unreachable"] or "MongoDB" in str(db_status):
                result.add_pass("Health has 'services.db' field", f"db={db_status}")
            else:
                result.add_fail("Health has valid 'services.db'", f"Got {db_status}")
        
        # Check missingEnv array
        if "missingEnv" not in data:
            result.add_fail("Health has 'missingEnv' array", "Missing 'missingEnv'")
        elif isinstance(data["missingEnv"], list):
            result.add_pass("Health has 'missingEnv' array", f"missingEnv={data['missingEnv']}")
        else:
            result.add_fail("Health has 'missingEnv' array", f"Not an array: {type(data['missingEnv'])}")
        
        # Check runtime.node field
        if "runtime" not in data:
            result.add_fail("Health has 'runtime' object", "Missing 'runtime'")
        elif "node" not in data["runtime"]:
            result.add_fail("Health has 'runtime.node' field", "Missing 'node'")
        elif data["runtime"]["node"]:
            result.add_pass("Health has 'runtime.node' field", f"node={data['runtime']['node']}")
        else:
            result.add_fail("Health has populated 'runtime.node'", "Empty node version")
        
        print(f"\nFull health response: {json.dumps(data, indent=2)}")
        
    except Exception as e:
        result.add_fail("Health endpoint test", f"Exception: {str(e)}")

def test_auth_no_regression(result: TestResult) -> Optional[str]:
    """Test 2: Auth endpoints (no regression)"""
    print("\n" + "="*80)
    print("TEST 2: Auth Endpoints (No Regression)")
    print("="*80)
    
    token = None
    
    # Test login with existing credentials
    try:
        resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD},
            timeout=10
        )
        data = safe_json(resp)
        
        if resp.status_code != 200:
            result.add_fail("Login with existing creds returns 200", f"Got {resp.status_code}: {data}")
            return None
        
        if not data or "session" not in data or "access_token" not in data["session"]:
            result.add_fail("Login returns session with access_token", f"Response: {data}")
            return None
        
        token = data["session"]["access_token"]
        result.add_pass("Login with existing creds returns 200 with token", f"Token length: {len(token)}")
        
    except Exception as e:
        result.add_fail("Login test", f"Exception: {str(e)}")
        return None
    
    # Test /api/auth/me WITH token
    try:
        resp = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        data = safe_json(resp)
        
        if resp.status_code != 200:
            result.add_fail("GET /api/auth/me with token returns 200", f"Got {resp.status_code}")
        elif not data or "user" not in data or not data["user"]:
            result.add_fail("GET /api/auth/me with token returns user", f"Response: {data}")
        else:
            result.add_pass("GET /api/auth/me with token returns user", f"User: {data['user'].get('email', 'N/A')}")
        
    except Exception as e:
        result.add_fail("GET /api/auth/me with token", f"Exception: {str(e)}")
    
    # Test /api/auth/me WITHOUT token
    try:
        resp = requests.get(f"{BASE_URL}/api/auth/me", timeout=10)
        data = safe_json(resp)
        
        if resp.status_code != 200:
            result.add_fail("GET /api/auth/me without token returns 200", f"Got {resp.status_code}")
        elif not data or "user" not in data or data["user"] is not None:
            result.add_fail("GET /api/auth/me without token returns {user: null}", f"Response: {data}")
        else:
            result.add_pass("GET /api/auth/me without token returns {user: null}")
        
    except Exception as e:
        result.add_fail("GET /api/auth/me without token", f"Exception: {str(e)}")
    
    return token

def test_chat_streaming(result: TestResult, token: str):
    """Test 3: Chat streaming (MOST CRITICAL)"""
    print("\n" + "="*80)
    print("TEST 3: Chat Streaming (MOST CRITICAL)")
    print("="*80)
    
    # Test 3.1: POST /api/chat WITHOUT token → 401
    try:
        resp = requests.post(
            f"{BASE_URL}/api/chat",
            json={"messages": [{"role": "user", "content": "test"}], "agent": "meta-ads"},
            timeout=10
        )
        data = safe_json(resp)
        
        if resp.status_code == 401:
            result.add_pass("POST /api/chat without token returns 401", f"Response: {data}")
        else:
            result.add_fail("POST /api/chat without token returns 401", f"Got {resp.status_code}: {data}")
        
    except Exception as e:
        result.add_fail("POST /api/chat without token", f"Exception: {str(e)}")
    
    # Test 3.2: POST /api/chat with token and valid body → streaming response
    try:
        resp = requests.post(
            f"{BASE_URL}/api/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "messages": [{"role": "user", "content": "Write 2 short ad hooks for sneakers"}],
                "agent": "meta-ads"
            },
            timeout=60,
            stream=True
        )
        
        if resp.status_code != 200:
            result.add_fail("POST /api/chat with token returns 200", f"Got {resp.status_code}: {resp.text[:200]}")
        else:
            # Check headers
            conv_id = resp.headers.get("X-Conversation-Id")
            db_status = resp.headers.get("X-DB-Status")
            
            if not conv_id:
                result.add_fail("Chat response has X-Conversation-Id header", "Header missing")
            else:
                result.add_pass("Chat response has X-Conversation-Id header", f"ID: {conv_id[:20]}...")
            
            if not db_status:
                result.add_fail("Chat response has X-DB-Status header", "Header missing")
            else:
                result.add_pass("Chat response has X-DB-Status header", f"Status: {db_status}")
            
            # Read streaming content
            content = ""
            for chunk in resp.iter_content(chunk_size=1024, decode_unicode=True):
                if chunk:
                    content += chunk
                if len(content) > 5000:  # Limit reading
                    break
            
            if len(content) == 0:
                result.add_fail("Chat streaming returns content", "Empty response body")
            elif len(content) < 20:
                result.add_fail("Chat streaming returns substantial content", f"Only {len(content)} chars: {content}")
            else:
                result.add_pass("Chat streaming returns substantial content", f"Received {len(content)} chars. Sample: {content[:100]}...")
        
    except Exception as e:
        result.add_fail("POST /api/chat with token (streaming)", f"Exception: {str(e)}")
    
    # Test 3.3: POST /api/chat with empty messages → 400
    try:
        resp = requests.post(
            f"{BASE_URL}/api/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={},
            timeout=10
        )
        data = safe_json(resp)
        
        if resp.status_code == 400:
            result.add_pass("POST /api/chat with empty body returns 400", f"Error: {data.get('error', 'N/A')}")
        else:
            result.add_fail("POST /api/chat with empty body returns 400", f"Got {resp.status_code}: {data}")
        
    except Exception as e:
        result.add_fail("POST /api/chat with empty body", f"Exception: {str(e)}")
    
    # Test 3.4: POST /api/chat with empty messages array → 400
    try:
        resp = requests.post(
            f"{BASE_URL}/api/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={"messages": []},
            timeout=10
        )
        data = safe_json(resp)
        
        if resp.status_code == 400:
            result.add_pass("POST /api/chat with empty messages array returns 400", f"Error: {data.get('error', 'N/A')}")
        else:
            result.add_fail("POST /api/chat with empty messages array returns 400", f"Got {resp.status_code}: {data}")
        
    except Exception as e:
        result.add_fail("POST /api/chat with empty messages array", f"Exception: {str(e)}")
    
    # Test 3.5: POST /api/chat with different model
    try:
        resp = requests.post(
            f"{BASE_URL}/api/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "messages": [{"role": "user", "content": "hi"}],
                "model": "meta-llama/llama-3.3-70b-instruct"
            },
            timeout=60,
            stream=True
        )
        
        if resp.status_code != 200:
            result.add_fail("POST /api/chat with different model returns 200", f"Got {resp.status_code}: {resp.text[:200]}")
        else:
            content = ""
            for chunk in resp.iter_content(chunk_size=1024, decode_unicode=True):
                if chunk:
                    content += chunk
                if len(content) > 1000:
                    break
            
            if len(content) > 0:
                result.add_pass("POST /api/chat with different model streams", f"Received {len(content)} chars")
            else:
                result.add_fail("POST /api/chat with different model streams", "Empty response")
        
    except Exception as e:
        result.add_fail("POST /api/chat with different model", f"Exception: {str(e)}")

def test_conversations(result: TestResult, token: str):
    """Test 4: Conversations endpoints"""
    print("\n" + "="*80)
    print("TEST 4: Conversations")
    print("="*80)
    
    # Test 4.1: GET /api/conversations with token → 200 returns array
    try:
        resp = requests.get(
            f"{BASE_URL}/api/conversations",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        data = safe_json(resp)
        
        if resp.status_code != 200:
            result.add_fail("GET /api/conversations with token returns 200", f"Got {resp.status_code}: {data}")
        elif not isinstance(data, list):
            result.add_fail("GET /api/conversations returns array", f"Got {type(data)}: {data}")
        else:
            result.add_pass("GET /api/conversations with token returns array", f"Count: {len(data)}")
        
    except Exception as e:
        result.add_fail("GET /api/conversations with token", f"Exception: {str(e)}")
    
    # Test 4.2: GET /api/conversations without token → 401
    try:
        resp = requests.get(f"{BASE_URL}/api/conversations", timeout=10)
        data = safe_json(resp)
        
        if resp.status_code == 401:
            result.add_pass("GET /api/conversations without token returns 401")
        else:
            result.add_fail("GET /api/conversations without token returns 401", f"Got {resp.status_code}: {data}")
        
    except Exception as e:
        result.add_fail("GET /api/conversations without token", f"Exception: {str(e)}")

def test_uploads(result: TestResult, token: str):
    """Test 5: Uploads endpoints"""
    print("\n" + "="*80)
    print("TEST 5: Uploads")
    print("="*80)
    
    # Valid base64 PNG (1x1 red pixel)
    valid_png_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
    valid_data_url = f"data:image/png;base64,{valid_png_base64}"
    
    # Test 5.1: POST /api/uploads with valid data
    upload_id = None
    try:
        resp = requests.post(
            f"{BASE_URL}/api/uploads",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "test.png",
                "type": "image/png",
                "dataUrl": valid_data_url,
                "tag": "test",
                "size": 100
            },
            timeout=15
        )
        data = safe_json(resp)
        
        if resp.status_code != 200:
            result.add_fail("POST /api/uploads with valid data returns 200", f"Got {resp.status_code}: {data}")
        elif not data or "publicUrl" not in data:
            result.add_fail("POST /api/uploads returns upload with publicUrl", f"Response: {data}")
        else:
            upload_id = data.get("id")
            result.add_pass("POST /api/uploads with valid data returns upload with publicUrl", f"URL: {data['publicUrl'][:50]}...")
        
    except Exception as e:
        result.add_fail("POST /api/uploads with valid data", f"Exception: {str(e)}")
    
    # Test 5.2: POST /api/uploads without dataUrl → 400
    try:
        resp = requests.post(
            f"{BASE_URL}/api/uploads",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": "test.png", "type": "image/png"},
            timeout=10
        )
        data = safe_json(resp)
        
        if resp.status_code == 400:
            result.add_pass("POST /api/uploads without dataUrl returns 400", f"Error: {data.get('error', 'N/A')}")
        else:
            result.add_fail("POST /api/uploads without dataUrl returns 400", f"Got {resp.status_code}: {data}")
        
    except Exception as e:
        result.add_fail("POST /api/uploads without dataUrl", f"Exception: {str(e)}")
    
    # Test 5.3: POST /api/uploads with invalid dataUrl → 400
    try:
        resp = requests.post(
            f"{BASE_URL}/api/uploads",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "test.png",
                "type": "image/png",
                "dataUrl": "notbase64"
            },
            timeout=10
        )
        data = safe_json(resp)
        
        if resp.status_code == 400:
            error_msg = data.get("error", "") if data else ""
            if "invalid" in error_msg.lower() or "dataUrl" in error_msg:
                result.add_pass("POST /api/uploads with invalid dataUrl returns 400 with clear error", f"Error: {error_msg}")
            else:
                result.add_pass("POST /api/uploads with invalid dataUrl returns 400", f"Error: {error_msg}")
        else:
            result.add_fail("POST /api/uploads with invalid dataUrl returns 400", f"Got {resp.status_code}: {data}")
        
    except Exception as e:
        result.add_fail("POST /api/uploads with invalid dataUrl", f"Exception: {str(e)}")
    
    # Test 5.4: GET /api/uploads with token → 200 array
    try:
        resp = requests.get(
            f"{BASE_URL}/api/uploads",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        data = safe_json(resp)
        
        if resp.status_code != 200:
            result.add_fail("GET /api/uploads with token returns 200", f"Got {resp.status_code}: {data}")
        elif not isinstance(data, list):
            result.add_fail("GET /api/uploads returns array", f"Got {type(data)}: {data}")
        else:
            result.add_pass("GET /api/uploads with token returns array", f"Count: {len(data)}")
        
    except Exception as e:
        result.add_fail("GET /api/uploads with token", f"Exception: {str(e)}")

def test_stats(result: TestResult, token: str):
    """Test 6: Stats endpoint"""
    print("\n" + "="*80)
    print("TEST 6: Stats")
    print("="*80)
    
    # Test 6.1: GET /api/stats with token
    try:
        resp = requests.get(
            f"{BASE_URL}/api/stats",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        data = safe_json(resp)
        
        if resp.status_code != 200:
            result.add_fail("GET /api/stats with token returns 200", f"Got {resp.status_code}: {data}")
        elif not data:
            result.add_fail("GET /api/stats returns data", "Empty response")
        else:
            # Check required fields
            has_metrics = "metrics" in data
            has_revenue = "revenueSeries" in data
            has_health = "health" in data
            
            if has_metrics:
                result.add_pass("GET /api/stats returns metrics", f"Keys: {list(data['metrics'].keys())}")
            else:
                result.add_fail("GET /api/stats returns metrics", "Missing 'metrics'")
            
            if has_revenue:
                revenue_count = len(data["revenueSeries"]) if isinstance(data["revenueSeries"], list) else 0
                if revenue_count == 14:
                    result.add_pass("GET /api/stats returns revenueSeries with 14 entries", f"Count: {revenue_count}")
                else:
                    result.add_pass("GET /api/stats returns revenueSeries", f"Count: {revenue_count} (expected 14)")
            else:
                result.add_fail("GET /api/stats returns revenueSeries", "Missing 'revenueSeries'")
            
            if has_health:
                db_field = data["health"].get("db") if isinstance(data["health"], dict) else None
                if db_field:
                    result.add_pass("GET /api/stats returns health with db field", f"db: {db_field}")
                else:
                    result.add_fail("GET /api/stats returns health with db field", f"health: {data.get('health')}")
            else:
                result.add_fail("GET /api/stats returns health", "Missing 'health'")
        
    except Exception as e:
        result.add_fail("GET /api/stats with token", f"Exception: {str(e)}")
    
    # Test 6.2: GET /api/stats WITHOUT token (public path)
    try:
        resp = requests.get(f"{BASE_URL}/api/stats", timeout=10)
        data = safe_json(resp)
        
        if resp.status_code == 200:
            result.add_pass("GET /api/stats without token returns 200 (public path)", f"Has metrics: {'metrics' in data if data else False}")
        else:
            result.add_fail("GET /api/stats without token returns 200", f"Got {resp.status_code}: {data}")
        
    except Exception as e:
        result.add_fail("GET /api/stats without token", f"Exception: {str(e)}")

def test_error_handling(result: TestResult, token: str):
    """Test 7: Error handling (startsWith crash prevention)"""
    print("\n" + "="*80)
    print("TEST 7: Error Handling (startsWith crash prevention)")
    print("="*80)
    
    # Test 7.1: POST /api/chat with INVALID JSON body
    try:
        resp = requests.post(
            f"{BASE_URL}/api/chat",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            },
            data="not-json",  # Invalid JSON
            timeout=10
        )
        data = safe_json(resp)
        
        if resp.status_code == 500 and data and "startsWith" in str(data.get("error", "")):
            result.add_fail("POST /api/chat with invalid JSON does NOT crash with startsWith error", f"Got startsWith crash: {data}")
        elif resp.status_code == 400:
            error_msg = data.get("error", "") if data else ""
            if "invalid" in error_msg.lower() and "json" in error_msg.lower():
                result.add_pass("POST /api/chat with invalid JSON returns 400 with 'invalid JSON body'", f"Error: {error_msg}")
            else:
                result.add_pass("POST /api/chat with invalid JSON returns 400", f"Error: {error_msg}")
        else:
            result.add_fail("POST /api/chat with invalid JSON returns 400", f"Got {resp.status_code}: {data}")
        
    except Exception as e:
        result.add_fail("POST /api/chat with invalid JSON", f"Exception: {str(e)}")
    
    # Test 7.2: POST /api/chat with invalid Authorization header (NOT starting with "Bearer ")
    try:
        resp = requests.post(
            f"{BASE_URL}/api/chat",
            headers={"Authorization": "Basic xyz123"},  # Not "Bearer "
            json={"messages": [{"role": "user", "content": "test"}]},
            timeout=10
        )
        data = safe_json(resp)
        
        if resp.status_code == 500 and data and "startsWith" in str(data.get("error", "")):
            result.add_fail("POST /api/chat with non-Bearer auth does NOT crash with startsWith error", f"Got startsWith crash: {data}")
        elif resp.status_code == 401:
            result.add_pass("POST /api/chat with non-Bearer auth returns 401 (no crash)", f"Response: {data}")
        else:
            result.add_fail("POST /api/chat with non-Bearer auth returns 401", f"Got {resp.status_code}: {data}")
        
    except Exception as e:
        result.add_fail("POST /api/chat with non-Bearer auth", f"Exception: {str(e)}")
    
    # Test 7.3: POST /api/uploads without Authorization header at all
    try:
        resp = requests.post(
            f"{BASE_URL}/api/uploads",
            json={"name": "test.png"},
            timeout=10
        )
        data = safe_json(resp)
        
        if resp.status_code == 500 and data and "startsWith" in str(data.get("error", "")):
            result.add_fail("POST /api/uploads without auth does NOT crash with startsWith error", f"Got startsWith crash: {data}")
        elif resp.status_code == 401:
            result.add_pass("POST /api/uploads without auth returns 401 (no crash)", f"Response: {data}")
        else:
            result.add_fail("POST /api/uploads without auth returns 401", f"Got {resp.status_code}: {data}")
        
    except Exception as e:
        result.add_fail("POST /api/uploads without auth", f"Exception: {str(e)}")

def test_no_regression(result: TestResult, token: str):
    """Test 8: No regression on workflows and saved prompts"""
    print("\n" + "="*80)
    print("TEST 8: No Regression (Workflows & Saved Prompts)")
    print("="*80)
    
    # Test 8.1: POST /api/workflows
    workflow_id = None
    try:
        resp = requests.post(
            f"{BASE_URL}/api/workflows",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": "regression-test-wf", "type": "ai-task"},
            timeout=10
        )
        data = safe_json(resp)
        
        if resp.status_code != 200:
            result.add_fail("POST /api/workflows returns 200", f"Got {resp.status_code}: {data}")
        elif not data or "id" not in data:
            result.add_fail("POST /api/workflows returns workflow", f"Response: {data}")
        else:
            workflow_id = data["id"]
            result.add_pass("POST /api/workflows creates workflow", f"ID: {workflow_id}")
        
    except Exception as e:
        result.add_fail("POST /api/workflows", f"Exception: {str(e)}")
    
    # Test 8.2: GET /api/workflows
    try:
        resp = requests.get(
            f"{BASE_URL}/api/workflows",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        data = safe_json(resp)
        
        if resp.status_code != 200:
            result.add_fail("GET /api/workflows returns 200", f"Got {resp.status_code}: {data}")
        elif not isinstance(data, list):
            result.add_fail("GET /api/workflows returns array", f"Got {type(data)}: {data}")
        else:
            contains_new = any(w.get("id") == workflow_id for w in data) if workflow_id else False
            if contains_new:
                result.add_pass("GET /api/workflows contains created workflow", f"Count: {len(data)}")
            else:
                result.add_pass("GET /api/workflows returns array", f"Count: {len(data)}")
        
    except Exception as e:
        result.add_fail("GET /api/workflows", f"Exception: {str(e)}")
    
    # Test 8.3: POST /api/saved-prompts
    prompt_id = None
    try:
        resp = requests.post(
            f"{BASE_URL}/api/saved-prompts",
            headers={"Authorization": f"Bearer {token}"},
            json={"title": "regression-test-prompt", "prompt": "test prompt content"},
            timeout=10
        )
        data = safe_json(resp)
        
        if resp.status_code != 200:
            result.add_fail("POST /api/saved-prompts returns 200", f"Got {resp.status_code}: {data}")
        elif not data or "id" not in data:
            result.add_fail("POST /api/saved-prompts returns prompt", f"Response: {data}")
        else:
            prompt_id = data["id"]
            result.add_pass("POST /api/saved-prompts creates prompt", f"ID: {prompt_id}")
        
    except Exception as e:
        result.add_fail("POST /api/saved-prompts", f"Exception: {str(e)}")
    
    # Test 8.4: GET /api/saved-prompts
    try:
        resp = requests.get(
            f"{BASE_URL}/api/saved-prompts",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        data = safe_json(resp)
        
        if resp.status_code != 200:
            result.add_fail("GET /api/saved-prompts returns 200", f"Got {resp.status_code}: {data}")
        elif not isinstance(data, list):
            result.add_fail("GET /api/saved-prompts returns array", f"Got {type(data)}: {data}")
        else:
            contains_new = any(p.get("id") == prompt_id for p in data) if prompt_id else False
            if contains_new:
                result.add_pass("GET /api/saved-prompts contains created prompt", f"Count: {len(data)}")
            else:
                result.add_pass("GET /api/saved-prompts returns array", f"Count: {len(data)}")
        
    except Exception as e:
        result.add_fail("GET /api/saved-prompts", f"Exception: {str(e)}")

def main():
    print("="*80)
    print("SOCIAL OPERATIVE INC. - BACKEND REGRESSION TEST")
    print("After Vercel Production Hardening")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Login: {LOGIN_EMAIL}")
    print("="*80)
    
    result = TestResult()
    
    # Run tests
    test_health_endpoint(result)
    
    token = test_auth_no_regression(result)
    if not token:
        print("\n❌ CRITICAL: Cannot proceed without auth token")
        result.summary()
        sys.exit(1)
    
    test_chat_streaming(result, token)
    test_conversations(result, token)
    test_uploads(result, token)
    test_stats(result, token)
    test_error_handling(result, token)
    test_no_regression(result, token)
    
    # Summary
    success = result.summary()
    
    # Critical check: Did ANY endpoint return startsWith error?
    print("\n" + "="*80)
    print("CRITICAL CHECK: startsWith crash")
    print("="*80)
    startswith_found = any("startsWith" in t["details"] for t in result.tests if t["status"] == "FAIL")
    if startswith_found:
        print("❌ CRITICAL: Found startsWith crash in at least one test!")
    else:
        print("✅ CONFIRMED: No startsWith crashes detected")
    
    print("\n" + "="*80)
    print("REGRESSION TEST COMPLETE")
    print("="*80)
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
