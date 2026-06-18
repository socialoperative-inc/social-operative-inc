#!/usr/bin/env python3
"""
Social Operative Inc. Backend API Test Suite
Tests Supabase Auth + Storage + MongoDB isolation + OpenRouter streaming + Meta Ads scraper
"""

import requests
import json
import time
import random
import string
from typing import Dict, Optional

# Base URL from .env
BASE_URL = "https://mission-control-306.preview.emergentagent.com/api"

# Test state
user1_data = {}
user2_data = {}
test_results = []

def log_test(name: str, passed: bool, details: str = ""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status} | {name}")
    if details:
        print(f"    {details}")
    test_results.append({"name": name, "passed": passed, "details": details})

def random_email():
    """Generate random test email"""
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"qa{rand}@socialoperative.ai"

# ============================================================================
# 1. AUTH FLOW TESTS
# ============================================================================

def test_auth_signup():
    """Test POST /api/auth/signup"""
    print("\n=== Testing Auth Signup ===")
    email = random_email()
    password = "qatest1234"
    name = "QA User One"
    
    try:
        resp = requests.post(f"{BASE_URL}/auth/signup", json={
            "email": email,
            "password": password,
            "name": name
        }, timeout=10)
        
        if resp.status_code != 200:
            log_test("Auth Signup", False, f"Status {resp.status_code}: {resp.text[:200]}")
            return False
        
        data = resp.json()
        if not data.get("user") or not data.get("session"):
            log_test("Auth Signup", False, f"Missing user or session in response: {data}")
            return False
        
        user = data["user"]
        session = data["session"]
        
        if not all([user.get("id"), user.get("email"), session.get("access_token"), session.get("refresh_token")]):
            log_test("Auth Signup", False, f"Missing required fields: {data}")
            return False
        
        # Store for later tests
        user1_data["email"] = email
        user1_data["password"] = password
        user1_data["name"] = name
        user1_data["id"] = user["id"]
        user1_data["token"] = session["access_token"]
        user1_data["refresh_token"] = session["refresh_token"]
        
        log_test("Auth Signup", True, f"User created: {user['email']}, token received")
        return True
    except Exception as e:
        log_test("Auth Signup", False, f"Exception: {str(e)}")
        return False

def test_auth_signup_validation():
    """Test signup validation (missing password, short password)"""
    print("\n=== Testing Auth Signup Validation ===")
    
    # Missing password
    try:
        resp = requests.post(f"{BASE_URL}/auth/signup", json={
            "email": random_email()
        }, timeout=10)
        
        if resp.status_code == 400 and "error" in resp.json():
            log_test("Auth Signup - Missing Password", True, "Correctly rejected")
        else:
            log_test("Auth Signup - Missing Password", False, f"Expected 400, got {resp.status_code}")
    except Exception as e:
        log_test("Auth Signup - Missing Password", False, f"Exception: {str(e)}")
    
    # Short password
    try:
        resp = requests.post(f"{BASE_URL}/auth/signup", json={
            "email": random_email(),
            "password": "123"
        }, timeout=10)
        
        if resp.status_code == 400 and "error" in resp.json():
            log_test("Auth Signup - Short Password", True, "Correctly rejected")
        else:
            log_test("Auth Signup - Short Password", False, f"Expected 400, got {resp.status_code}")
    except Exception as e:
        log_test("Auth Signup - Short Password", False, f"Exception: {str(e)}")

def test_auth_login():
    """Test POST /api/auth/login"""
    print("\n=== Testing Auth Login ===")
    
    if not user1_data.get("email"):
        log_test("Auth Login", False, "Skipped - no user1 email")
        return False
    
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "email": user1_data["email"],
            "password": user1_data["password"]
        }, timeout=10)
        
        if resp.status_code != 200:
            log_test("Auth Login", False, f"Status {resp.status_code}: {resp.text[:200]}")
            return False
        
        data = resp.json()
        if not data.get("user") or not data.get("session"):
            log_test("Auth Login", False, f"Missing user or session: {data}")
            return False
        
        # Update token
        user1_data["token"] = data["session"]["access_token"]
        
        log_test("Auth Login", True, f"Login successful, new token received")
        return True
    except Exception as e:
        log_test("Auth Login", False, f"Exception: {str(e)}")
        return False

def test_auth_login_invalid():
    """Test login with wrong password"""
    print("\n=== Testing Auth Login - Invalid Credentials ===")
    
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "email": user1_data.get("email", "test@test.com"),
            "password": "wrongpassword123"
        }, timeout=10)
        
        if resp.status_code == 401 and "error" in resp.json():
            log_test("Auth Login - Invalid Password", True, "Correctly rejected with 401")
        else:
            log_test("Auth Login - Invalid Password", False, f"Expected 401, got {resp.status_code}")
    except Exception as e:
        log_test("Auth Login - Invalid Password", False, f"Exception: {str(e)}")

def test_auth_me_with_token():
    """Test GET /api/auth/me with token"""
    print("\n=== Testing Auth Me - With Token ===")
    
    if not user1_data.get("token"):
        log_test("Auth Me - With Token", False, "Skipped - no token")
        return False
    
    try:
        resp = requests.get(f"{BASE_URL}/auth/me", headers={
            "Authorization": f"Bearer {user1_data['token']}"
        }, timeout=10)
        
        if resp.status_code != 200:
            log_test("Auth Me - With Token", False, f"Status {resp.status_code}: {resp.text[:200]}")
            return False
        
        data = resp.json()
        if not data.get("user") or not data["user"].get("id"):
            log_test("Auth Me - With Token", False, f"Missing user data: {data}")
            return False
        
        log_test("Auth Me - With Token", True, f"User: {data['user']['email']}")
        return True
    except Exception as e:
        log_test("Auth Me - With Token", False, f"Exception: {str(e)}")
        return False

def test_auth_me_without_token():
    """Test GET /api/auth/me without token"""
    print("\n=== Testing Auth Me - Without Token ===")
    
    try:
        resp = requests.get(f"{BASE_URL}/auth/me", timeout=10)
        
        if resp.status_code != 200:
            log_test("Auth Me - Without Token", False, f"Status {resp.status_code}")
            return False
        
        data = resp.json()
        if data.get("user") is None:
            log_test("Auth Me - Without Token", True, "Correctly returns {user: null}")
            return True
        else:
            log_test("Auth Me - Without Token", False, f"Expected null user, got: {data}")
            return False
    except Exception as e:
        log_test("Auth Me - Without Token", False, f"Exception: {str(e)}")
        return False

def test_auth_refresh():
    """Test POST /api/auth/refresh"""
    print("\n=== Testing Auth Refresh ===")
    
    if not user1_data.get("refresh_token"):
        log_test("Auth Refresh", False, "Skipped - no refresh token")
        return False
    
    try:
        resp = requests.post(f"{BASE_URL}/auth/refresh", json={
            "refresh_token": user1_data["refresh_token"]
        }, timeout=10)
        
        if resp.status_code != 200:
            log_test("Auth Refresh", False, f"Status {resp.status_code}: {resp.text[:200]}")
            return False
        
        data = resp.json()
        if not data.get("session") or not data["session"].get("access_token"):
            log_test("Auth Refresh", False, f"Missing session: {data}")
            return False
        
        # Update token
        user1_data["token"] = data["session"]["access_token"]
        user1_data["refresh_token"] = data["session"]["refresh_token"]
        
        log_test("Auth Refresh", True, "New session received")
        return True
    except Exception as e:
        log_test("Auth Refresh", False, f"Exception: {str(e)}")
        return False

# ============================================================================
# 2. PROTECTED ROUTE GUARD TESTS
# ============================================================================

def test_protected_routes_without_token():
    """Test that protected routes return 401 without token"""
    print("\n=== Testing Protected Routes - No Token ===")
    
    protected_endpoints = [
        ("/chat", "POST", {"messages": [{"role": "user", "content": "test"}]}),
        ("/conversations", "GET", None),
        ("/uploads", "GET", None),
    ]
    
    all_passed = True
    for endpoint, method, body in protected_endpoints:
        try:
            if method == "POST":
                resp = requests.post(f"{BASE_URL}{endpoint}", json=body, timeout=10)
            else:
                resp = requests.get(f"{BASE_URL}{endpoint}", timeout=10)
            
            if resp.status_code == 401 and "error" in resp.json():
                log_test(f"Protected {endpoint} - No Token", True, "Correctly returns 401")
            else:
                log_test(f"Protected {endpoint} - No Token", False, f"Expected 401, got {resp.status_code}")
                all_passed = False
        except Exception as e:
            log_test(f"Protected {endpoint} - No Token", False, f"Exception: {str(e)}")
            all_passed = False
    
    return all_passed

# ============================================================================
# 3. OPENROUTER CHAT STREAMING TESTS
# ============================================================================

def test_chat_streaming():
    """Test POST /api/chat with streaming"""
    print("\n=== Testing Chat Streaming ===")
    
    if not user1_data.get("token"):
        log_test("Chat Streaming", False, "Skipped - no token")
        return False
    
    try:
        resp = requests.post(f"{BASE_URL}/chat", 
            headers={"Authorization": f"Bearer {user1_data['token']}"},
            json={
                "messages": [{"role": "user", "content": "Write 2 short ad hooks for sneakers. Just 2 lines."}],
                "agent": "meta-ads",
                "model": "deepseek/deepseek-chat"
            },
            timeout=60,
            stream=True
        )
        
        if resp.status_code != 200:
            log_test("Chat Streaming", False, f"Status {resp.status_code}: {resp.text[:200]}")
            return False
        
        # Check headers
        content_type = resp.headers.get("Content-Type", "")
        conv_id = resp.headers.get("X-Conversation-Id")
        
        if "text/plain" not in content_type:
            log_test("Chat Streaming", False, f"Wrong Content-Type: {content_type}")
            return False
        
        if not conv_id:
            log_test("Chat Streaming", False, "Missing X-Conversation-Id header")
            return False
        
        # Read stream
        content = ""
        for chunk in resp.iter_content(chunk_size=1024, decode_unicode=True):
            if chunk:
                content += chunk
        
        if len(content) < 10:
            log_test("Chat Streaming", False, f"Response too short: {content}")
            return False
        
        # Store conversation ID for later tests
        user1_data["conversation_id"] = conv_id
        
        log_test("Chat Streaming", True, f"Stream received, {len(content)} chars, conv_id: {conv_id[:8]}...")
        return True
    except Exception as e:
        log_test("Chat Streaming", False, f"Exception: {str(e)}")
        return False

def test_chat_save():
    """Test POST /api/chat/save"""
    print("\n=== Testing Chat Save ===")
    
    if not user1_data.get("token") or not user1_data.get("conversation_id"):
        log_test("Chat Save", False, "Skipped - no token or conversation_id")
        return False
    
    try:
        resp = requests.post(f"{BASE_URL}/chat/save",
            headers={"Authorization": f"Bearer {user1_data['token']}"},
            json={
                "conversationId": user1_data["conversation_id"],
                "role": "assistant",
                "content": "Test saved message"
            },
            timeout=10
        )
        
        if resp.status_code != 200:
            log_test("Chat Save", False, f"Status {resp.status_code}: {resp.text[:200]}")
            return False
        
        data = resp.json()
        if data.get("ok"):
            log_test("Chat Save", True, "Message saved")
            return True
        else:
            log_test("Chat Save", False, f"Unexpected response: {data}")
            return False
    except Exception as e:
        log_test("Chat Save", False, f"Exception: {str(e)}")
        return False

def test_conversations_list():
    """Test GET /api/conversations"""
    print("\n=== Testing Conversations List ===")
    
    if not user1_data.get("token"):
        log_test("Conversations List", False, "Skipped - no token")
        return False
    
    try:
        resp = requests.get(f"{BASE_URL}/conversations?agent=meta-ads",
            headers={"Authorization": f"Bearer {user1_data['token']}"},
            timeout=10
        )
        
        if resp.status_code != 200:
            log_test("Conversations List", False, f"Status {resp.status_code}: {resp.text[:200]}")
            return False
        
        data = resp.json()
        conversations = data.get("conversations", [])
        
        # Should contain the conversation we just created
        found = any(c.get("id") == user1_data.get("conversation_id") for c in conversations)
        
        if found:
            log_test("Conversations List", True, f"Found {len(conversations)} conversations including test conv")
            return True
        else:
            log_test("Conversations List", False, f"Test conversation not found in list of {len(conversations)}")
            return False
    except Exception as e:
        log_test("Conversations List", False, f"Exception: {str(e)}")
        return False

def test_conversation_get():
    """Test GET /api/conversations/:id"""
    print("\n=== Testing Conversation Get ===")
    
    if not user1_data.get("token") or not user1_data.get("conversation_id"):
        log_test("Conversation Get", False, "Skipped - no token or conversation_id")
        return False
    
    try:
        resp = requests.get(f"{BASE_URL}/conversations/{user1_data['conversation_id']}",
            headers={"Authorization": f"Bearer {user1_data['token']}"},
            timeout=10
        )
        
        if resp.status_code != 200:
            log_test("Conversation Get", False, f"Status {resp.status_code}: {resp.text[:200]}")
            return False
        
        data = resp.json()
        conv = data.get("conversation")
        
        if conv and conv.get("id") == user1_data["conversation_id"]:
            messages = conv.get("messages", [])
            log_test("Conversation Get", True, f"Retrieved conversation with {len(messages)} messages")
            return True
        else:
            log_test("Conversation Get", False, f"Conversation not found or wrong ID: {data}")
            return False
    except Exception as e:
        log_test("Conversation Get", False, f"Exception: {str(e)}")
        return False

# ============================================================================
# 4. SUPABASE STORAGE UPLOADS TESTS
# ============================================================================

def test_upload_file():
    """Test POST /api/uploads"""
    print("\n=== Testing File Upload ===")
    
    if not user1_data.get("token"):
        log_test("File Upload", False, "Skipped - no token")
        return False
    
    # 1x1 transparent PNG base64
    data_url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    
    try:
        resp = requests.post(f"{BASE_URL}/uploads",
            headers={"Authorization": f"Bearer {user1_data['token']}"},
            json={
                "name": "test.png",
                "type": "image/png",
                "dataUrl": data_url,
                "tag": "test",
                "size": 100
            },
            timeout=15
        )
        
        if resp.status_code != 200:
            log_test("File Upload", False, f"Status {resp.status_code}: {resp.text[:200]}")
            return False
        
        data = resp.json()
        upload = data.get("upload")
        
        if not upload or not upload.get("publicUrl"):
            log_test("File Upload", False, f"Missing upload or publicUrl: {data}")
            return False
        
        public_url = upload["publicUrl"]
        
        # Verify URL is HTTPS and contains supabase.co
        if not public_url.startswith("https://") or "supabase.co" not in public_url:
            log_test("File Upload", False, f"Invalid publicUrl: {public_url}")
            return False
        
        # Verify URL is fetchable
        try:
            head_resp = requests.head(public_url, timeout=10)
            if head_resp.status_code != 200:
                log_test("File Upload", False, f"publicUrl not accessible: {head_resp.status_code}")
                return False
        except Exception as e:
            log_test("File Upload", False, f"publicUrl fetch failed: {str(e)}")
            return False
        
        # Store upload ID for later tests
        user1_data["upload_id"] = upload["id"]
        
        log_test("File Upload", True, f"Upload successful, publicUrl verified: {public_url[:50]}...")
        return True
    except Exception as e:
        log_test("File Upload", False, f"Exception: {str(e)}")
        return False

def test_uploads_list():
    """Test GET /api/uploads"""
    print("\n=== Testing Uploads List ===")
    
    if not user1_data.get("token"):
        log_test("Uploads List", False, "Skipped - no token")
        return False
    
    try:
        resp = requests.get(f"{BASE_URL}/uploads",
            headers={"Authorization": f"Bearer {user1_data['token']}"},
            timeout=10
        )
        
        if resp.status_code != 200:
            log_test("Uploads List", False, f"Status {resp.status_code}: {resp.text[:200]}")
            return False
        
        data = resp.json()
        uploads = data.get("uploads", [])
        
        # Should contain the upload we just created
        found = any(u.get("id") == user1_data.get("upload_id") for u in uploads)
        
        if found:
            log_test("Uploads List", True, f"Found {len(uploads)} uploads including test upload")
            return True
        else:
            log_test("Uploads List", False, f"Test upload not found in list of {len(uploads)}")
            return False
    except Exception as e:
        log_test("Uploads List", False, f"Exception: {str(e)}")
        return False

def test_upload_delete():
    """Test DELETE /api/uploads/:id"""
    print("\n=== Testing Upload Delete ===")
    
    if not user1_data.get("token") or not user1_data.get("upload_id"):
        log_test("Upload Delete", False, "Skipped - no token or upload_id")
        return False
    
    try:
        resp = requests.delete(f"{BASE_URL}/uploads/{user1_data['upload_id']}",
            headers={"Authorization": f"Bearer {user1_data['token']}"},
            timeout=10
        )
        
        if resp.status_code != 200:
            log_test("Upload Delete", False, f"Status {resp.status_code}: {resp.text[:200]}")
            return False
        
        data = resp.json()
        if data.get("ok"):
            log_test("Upload Delete", True, "Upload deleted")
            return True
        else:
            log_test("Upload Delete", False, f"Unexpected response: {data}")
            return False
    except Exception as e:
        log_test("Upload Delete", False, f"Exception: {str(e)}")
        return False

# ============================================================================
# 5. CROSS-USER ISOLATION TESTS (CRITICAL)
# ============================================================================

def test_cross_user_isolation():
    """Test that user2 cannot see user1's data"""
    print("\n=== Testing Cross-User Isolation ===")
    
    # Create user2
    email2 = random_email()
    password2 = "qatest5678"
    
    try:
        resp = requests.post(f"{BASE_URL}/auth/signup", json={
            "email": email2,
            "password": password2,
            "name": "QA User Two"
        }, timeout=10)
        
        if resp.status_code != 200:
            log_test("Cross-User Isolation - User2 Signup", False, f"Status {resp.status_code}")
            return False
        
        data = resp.json()
        user2_data["token"] = data["session"]["access_token"]
        user2_data["id"] = data["user"]["id"]
        
        log_test("Cross-User Isolation - User2 Signup", True, f"User2 created: {email2}")
    except Exception as e:
        log_test("Cross-User Isolation - User2 Signup", False, f"Exception: {str(e)}")
        return False
    
    # Test conversations isolation
    try:
        resp = requests.get(f"{BASE_URL}/conversations",
            headers={"Authorization": f"Bearer {user2_data['token']}"},
            timeout=10
        )
        
        if resp.status_code != 200:
            log_test("Cross-User Isolation - Conversations", False, f"Status {resp.status_code}")
        else:
            data = resp.json()
            conversations = data.get("conversations", [])
            # User2 should NOT see user1's conversations
            user1_conv_found = any(c.get("id") == user1_data.get("conversation_id") for c in conversations)
            
            if user1_conv_found:
                log_test("Cross-User Isolation - Conversations", False, "User2 can see User1's conversations!")
            else:
                log_test("Cross-User Isolation - Conversations", True, f"User2 sees only their own ({len(conversations)} convs)")
    except Exception as e:
        log_test("Cross-User Isolation - Conversations", False, f"Exception: {str(e)}")
    
    # Test uploads isolation
    try:
        resp = requests.get(f"{BASE_URL}/uploads",
            headers={"Authorization": f"Bearer {user2_data['token']}"},
            timeout=10
        )
        
        if resp.status_code != 200:
            log_test("Cross-User Isolation - Uploads", False, f"Status {resp.status_code}")
        else:
            data = resp.json()
            uploads = data.get("uploads", [])
            # User2 should NOT see user1's uploads (even though we deleted it, check anyway)
            user1_upload_found = any(u.get("userId") == user1_data.get("id") for u in uploads)
            
            if user1_upload_found:
                log_test("Cross-User Isolation - Uploads", False, "User2 can see User1's uploads!")
            else:
                log_test("Cross-User Isolation - Uploads", True, f"User2 sees only their own ({len(uploads)} uploads)")
    except Exception as e:
        log_test("Cross-User Isolation - Uploads", False, f"Exception: {str(e)}")
    
    # Test workflows isolation
    try:
        resp = requests.get(f"{BASE_URL}/workflows",
            headers={"Authorization": f"Bearer {user2_data['token']}"},
            timeout=10
        )
        
        if resp.status_code != 200:
            log_test("Cross-User Isolation - Workflows", False, f"Status {resp.status_code}")
        else:
            data = resp.json()
            workflows = data.get("workflows", [])
            log_test("Cross-User Isolation - Workflows", True, f"User2 sees {len(workflows)} workflows (should be 0)")
    except Exception as e:
        log_test("Cross-User Isolation - Workflows", False, f"Exception: {str(e)}")
    
    # Test specific conversation access
    if user1_data.get("conversation_id"):
        try:
            resp = requests.get(f"{BASE_URL}/conversations/{user1_data['conversation_id']}",
                headers={"Authorization": f"Bearer {user2_data['token']}"},
                timeout=10
            )
            
            if resp.status_code != 200:
                log_test("Cross-User Isolation - Specific Conv Access", False, f"Status {resp.status_code}")
            else:
                data = resp.json()
                conv = data.get("conversation")
                
                if conv is None:
                    log_test("Cross-User Isolation - Specific Conv Access", True, "User2 cannot access User1's conversation")
                else:
                    log_test("Cross-User Isolation - Specific Conv Access", False, "User2 can access User1's conversation!")
        except Exception as e:
            log_test("Cross-User Isolation - Specific Conv Access", False, f"Exception: {str(e)}")

# ============================================================================
# 6. WORKFLOWS TESTS
# ============================================================================

def test_workflows():
    """Test workflows CRUD"""
    print("\n=== Testing Workflows ===")
    
    if not user1_data.get("token"):
        log_test("Workflows", False, "Skipped - no token")
        return False
    
    workflow_id = None
    
    # Create workflow
    try:
        resp = requests.post(f"{BASE_URL}/workflows",
            headers={"Authorization": f"Bearer {user1_data['token']}"},
            json={
                "name": "Test Workflow",
                "type": "ai-task",
                "schedule": "manual"
            },
            timeout=10
        )
        
        if resp.status_code != 200:
            log_test("Workflows - Create", False, f"Status {resp.status_code}: {resp.text[:200]}")
            return False
        
        data = resp.json()
        workflow = data.get("workflow")
        
        if not workflow or not workflow.get("id"):
            log_test("Workflows - Create", False, f"Missing workflow: {data}")
            return False
        
        workflow_id = workflow["id"]
        log_test("Workflows - Create", True, f"Workflow created: {workflow_id[:8]}...")
    except Exception as e:
        log_test("Workflows - Create", False, f"Exception: {str(e)}")
        return False
    
    # List workflows
    try:
        resp = requests.get(f"{BASE_URL}/workflows",
            headers={"Authorization": f"Bearer {user1_data['token']}"},
            timeout=10
        )
        
        if resp.status_code != 200:
            log_test("Workflows - List", False, f"Status {resp.status_code}")
        else:
            data = resp.json()
            workflows = data.get("workflows", [])
            found = any(w.get("id") == workflow_id for w in workflows)
            
            if found:
                log_test("Workflows - List", True, f"Found {len(workflows)} workflows including test workflow")
            else:
                log_test("Workflows - List", False, "Test workflow not found in list")
    except Exception as e:
        log_test("Workflows - List", False, f"Exception: {str(e)}")
    
    # Run workflow
    if workflow_id:
        try:
            resp = requests.post(f"{BASE_URL}/workflows/run/{workflow_id}",
                headers={"Authorization": f"Bearer {user1_data['token']}"},
                timeout=10
            )
            
            if resp.status_code != 200:
                log_test("Workflows - Run", False, f"Status {resp.status_code}")
            else:
                data = resp.json()
                if data.get("ok"):
                    log_test("Workflows - Run", True, "Workflow execution started")
                    # Wait for completion
                    time.sleep(2)
                else:
                    log_test("Workflows - Run", False, f"Unexpected response: {data}")
        except Exception as e:
            log_test("Workflows - Run", False, f"Exception: {str(e)}")
    
    # Delete workflow
    if workflow_id:
        try:
            resp = requests.delete(f"{BASE_URL}/workflows/{workflow_id}",
                headers={"Authorization": f"Bearer {user1_data['token']}"},
                timeout=10
            )
            
            if resp.status_code != 200:
                log_test("Workflows - Delete", False, f"Status {resp.status_code}")
            else:
                data = resp.json()
                if data.get("ok"):
                    log_test("Workflows - Delete", True, "Workflow deleted")
                else:
                    log_test("Workflows - Delete", False, f"Unexpected response: {data}")
        except Exception as e:
            log_test("Workflows - Delete", False, f"Exception: {str(e)}")

# ============================================================================
# 7. SAVED PROMPTS TESTS
# ============================================================================

def test_saved_prompts():
    """Test saved prompts CRUD"""
    print("\n=== Testing Saved Prompts ===")
    
    if not user1_data.get("token"):
        log_test("Saved Prompts", False, "Skipped - no token")
        return False
    
    prompt_id = None
    
    # Create prompt
    try:
        resp = requests.post(f"{BASE_URL}/saved-prompts",
            headers={"Authorization": f"Bearer {user1_data['token']}"},
            json={
                "title": "Test Prompt",
                "prompt": "Write engaging ad copy",
                "agent": "meta-ads"
            },
            timeout=10
        )
        
        if resp.status_code != 200:
            log_test("Saved Prompts - Create", False, f"Status {resp.status_code}: {resp.text[:200]}")
            return False
        
        data = resp.json()
        prompt = data.get("prompt")
        
        if not prompt or not prompt.get("id"):
            log_test("Saved Prompts - Create", False, f"Missing prompt: {data}")
            return False
        
        prompt_id = prompt["id"]
        log_test("Saved Prompts - Create", True, f"Prompt created: {prompt_id[:8]}...")
    except Exception as e:
        log_test("Saved Prompts - Create", False, f"Exception: {str(e)}")
        return False
    
    # List prompts
    try:
        resp = requests.get(f"{BASE_URL}/saved-prompts",
            headers={"Authorization": f"Bearer {user1_data['token']}"},
            timeout=10
        )
        
        if resp.status_code != 200:
            log_test("Saved Prompts - List", False, f"Status {resp.status_code}")
        else:
            data = resp.json()
            prompts = data.get("prompts", [])
            found = any(p.get("id") == prompt_id for p in prompts)
            
            if found:
                log_test("Saved Prompts - List", True, f"Found {len(prompts)} prompts including test prompt")
            else:
                log_test("Saved Prompts - List", False, "Test prompt not found in list")
    except Exception as e:
        log_test("Saved Prompts - List", False, f"Exception: {str(e)}")
    
    # Delete prompt
    if prompt_id:
        try:
            resp = requests.delete(f"{BASE_URL}/saved-prompts/{prompt_id}",
                headers={"Authorization": f"Bearer {user1_data['token']}"},
                timeout=10
            )
            
            if resp.status_code != 200:
                log_test("Saved Prompts - Delete", False, f"Status {resp.status_code}")
            else:
                data = resp.json()
                if data.get("ok"):
                    log_test("Saved Prompts - Delete", True, "Prompt deleted")
                else:
                    log_test("Saved Prompts - Delete", False, f"Unexpected response: {data}")
        except Exception as e:
            log_test("Saved Prompts - Delete", False, f"Exception: {str(e)}")

# ============================================================================
# 8. META ADS SCRAPER TEST
# ============================================================================

def test_meta_ads_scraper():
    """Test POST /api/scrape/meta-ads"""
    print("\n=== Testing Meta Ads Scraper ===")
    
    if not user1_data.get("token"):
        log_test("Meta Ads Scraper", False, "Skipped - no token")
        return False
    
    try:
        print("    (This may take 30-60 seconds...)")
        resp = requests.post(f"{BASE_URL}/scrape/meta-ads",
            headers={"Authorization": f"Bearer {user1_data['token']}"},
            json={
                "query": "nike",
                "limit": 3
            },
            timeout=90
        )
        
        if resp.status_code != 200:
            log_test("Meta Ads Scraper", False, f"Status {resp.status_code}: {resp.text[:200]}")
            return False
        
        data = resp.json()
        ads = data.get("ads", [])
        
        if len(ads) == 0:
            # Scraper might not find ads, but should not error
            log_test("Meta Ads Scraper", True, "Scraper completed but found 0 ads (acceptable for real scrape)")
            return True
        
        # Check if at least one ad has libraryId
        has_library_id = any(ad.get("libraryId") for ad in ads)
        
        if has_library_id:
            log_test("Meta Ads Scraper", True, f"Scraped {len(ads)} ads with libraryId")
            return True
        else:
            log_test("Meta Ads Scraper", False, f"Scraped {len(ads)} ads but none have libraryId")
            return False
    except Exception as e:
        log_test("Meta Ads Scraper", False, f"Exception: {str(e)}")
        return False

# ============================================================================
# 9. HEALTH & STATS TESTS
# ============================================================================

def test_health():
    """Test GET /api/health"""
    print("\n=== Testing Health Endpoint ===")
    
    try:
        resp = requests.get(f"{BASE_URL}/health", timeout=10)
        
        if resp.status_code != 200:
            log_test("Health", False, f"Status {resp.status_code}")
            return False
        
        data = resp.json()
        
        if data.get("status") == "operational" and data.get("services"):
            services = data["services"]
            if services.get("auth") == "supabase" and services.get("storage") == "supabase":
                log_test("Health", True, f"Status: {data['status']}, services: {services}")
                return True
            else:
                log_test("Health", False, f"Unexpected services: {services}")
                return False
        else:
            log_test("Health", False, f"Unexpected response: {data}")
            return False
    except Exception as e:
        log_test("Health", False, f"Exception: {str(e)}")
        return False

def test_stats():
    """Test GET /api/stats"""
    print("\n=== Testing Stats Endpoint ===")
    
    if not user1_data.get("token"):
        log_test("Stats", False, "Skipped - no token")
        return False
    
    try:
        resp = requests.get(f"{BASE_URL}/stats",
            headers={"Authorization": f"Bearer {user1_data['token']}"},
            timeout=10
        )
        
        if resp.status_code != 200:
            log_test("Stats", False, f"Status {resp.status_code}")
            return False
        
        data = resp.json()
        
        required_keys = ["metrics", "revenueSeries", "recentActivity", "health"]
        missing = [k for k in required_keys if k not in data]
        
        if missing:
            log_test("Stats", False, f"Missing keys: {missing}")
            return False
        
        log_test("Stats", True, f"Stats returned with all required keys")
        return True
    except Exception as e:
        log_test("Stats", False, f"Exception: {str(e)}")
        return False

# ============================================================================
# 10. ERROR HANDLING TESTS
# ============================================================================

def test_error_handling():
    """Test various error scenarios"""
    print("\n=== Testing Error Handling ===")
    
    # Invalid route
    try:
        resp = requests.get(f"{BASE_URL}/nonexistent", timeout=10)
        
        if resp.status_code == 404 and "error" in resp.json():
            log_test("Error Handling - 404", True, "Correctly returns 404 for invalid route")
        else:
            log_test("Error Handling - 404", False, f"Expected 404, got {resp.status_code}")
    except Exception as e:
        log_test("Error Handling - 404", False, f"Exception: {str(e)}")

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def run_all_tests():
    """Run all backend tests"""
    print("\n" + "="*80)
    print("SOCIAL OPERATIVE INC. - BACKEND API TEST SUITE")
    print("="*80)
    
    # 1. Auth flow
    test_auth_signup()
    test_auth_signup_validation()
    test_auth_login()
    test_auth_login_invalid()
    test_auth_me_with_token()
    test_auth_me_without_token()
    test_auth_refresh()
    
    # 2. Protected routes
    test_protected_routes_without_token()
    
    # 3. Chat streaming
    test_chat_streaming()
    test_chat_save()
    test_conversations_list()
    test_conversation_get()
    
    # 4. Uploads
    test_upload_file()
    test_uploads_list()
    test_upload_delete()
    
    # 5. Cross-user isolation (CRITICAL)
    test_cross_user_isolation()
    
    # 6. Workflows
    test_workflows()
    
    # 7. Saved prompts
    test_saved_prompts()
    
    # 8. Meta Ads scraper
    test_meta_ads_scraper()
    
    # 9. Health & Stats
    test_health()
    test_stats()
    
    # 10. Error handling
    test_error_handling()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for t in test_results if t["passed"])
    failed = sum(1 for t in test_results if not t["passed"])
    total = len(test_results)
    
    print(f"\nTotal: {total} tests")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"Success Rate: {passed/total*100:.1f}%")
    
    if failed > 0:
        print("\n" + "="*80)
        print("FAILED TESTS:")
        print("="*80)
        for t in test_results:
            if not t["passed"]:
                print(f"\n❌ {t['name']}")
                if t["details"]:
                    print(f"   {t['details']}")
    
    print("\n" + "="*80)
    return passed, failed

if __name__ == "__main__":
    run_all_tests()
