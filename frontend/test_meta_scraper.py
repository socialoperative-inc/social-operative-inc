#!/usr/bin/env python3
"""Quick test for Meta Ads scraper after Playwright install"""

import requests

BASE_URL = "https://mission-control-306.preview.emergentagent.com/api"

# Use existing user token from previous test
# First, create a new user
email = "qametascraper@socialoperative.ai"
password = "qatest1234"

print("Creating test user...")
resp = requests.post(f"{BASE_URL}/auth/signup", json={
    "email": email,
    "password": password,
    "name": "QA Meta Scraper"
}, timeout=10)

if resp.status_code != 200:
    print(f"❌ Signup failed: {resp.status_code}")
    exit(1)

token = resp.json()["session"]["access_token"]
print(f"✅ User created, token: {token[:20]}...")

print("\nTesting Meta Ads scraper (this may take 30-60 seconds)...")
resp = requests.post(f"{BASE_URL}/scrape/meta-ads",
    headers={"Authorization": f"Bearer {token}"},
    json={
        "query": "nike",
        "limit": 3
    },
    timeout=90
)

print(f"\nStatus: {resp.status_code}")
if resp.status_code == 200:
    data = resp.json()
    ads = data.get("ads", [])
    print(f"✅ Scraper completed successfully!")
    print(f"   Found {len(ads)} ads")
    if len(ads) > 0:
        print(f"   First ad has libraryId: {ads[0].get('libraryId', 'N/A')}")
else:
    print(f"❌ Scraper failed: {resp.text[:300]}")
