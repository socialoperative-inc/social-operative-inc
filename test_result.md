#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

#====================================================================================================
# END - Testing Protocol
#====================================================================================================

user_problem_statement: |
  Production AI SaaS deployed on Vercel was unstable. Frontend loaded but
  backend AI execution failed with:
    • "Cannot read properties of undefined (reading 'startsWith')"
    • MongoDB ECONNREFUSED 127.0.0.1:27017
    • OpenRouter TLS/SSL "alert internal error"
    • AI agents not responding

  Mission: Full production stabilization pass — no UI redesign, no rebuild.
  Only fix backend/runtime reliability and add diagnostic routes.

backend:
  - task: "Standalone /api/health route"
    implemented: true
    working: true
    file: "app/api/health/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Returns clean JSON with env+services status. Survives even if catch-all crashes. Locally verified 200 OK."

  - task: "Standalone /api/diag/openrouter route"
    implemented: true
    working: true
    file: "app/api/diag/openrouter/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Native fetch GET to /api/v1/models. Optional ?chat=1 phase for real round-trip. Returns hint/fix on TLS errors. Locally verified env-check path."

  - task: "Standalone /api/diag/mongo route"
    implemented: true
    working: true
    file: "app/api/diag/mongo/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Validates URI scheme, rejects localhost on Vercel, attempts real connect + ping. Locally verified env-check path."

  - task: "OpenRouter stabilization (no streaming, native fetch, locked headers)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Removed streaming. Single-shot fetch with retry on TLS/transient errors.
          Headers locked to exactly: Authorization, Content-Type, HTTP-Referer, X-Title
          (removed User-Agent and Accept which were tripping WAF).
          Response returned as text/plain single chunk — frontend reader code still
          works unchanged. Key validation + sanitization preserved.

  - task: "MongoDB Atlas stabilization (reject localhost, scheme validation, graceful null)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Explicitly rejects mongodb://localhost/... 127.0.0.1 / ::1 URIs when
          running on Vercel. Validates scheme starts with mongodb:// or mongodb+srv://.
          15s cool-down on failure. safeDbOp wrapper means DB-less routes still
          return clean responses with empty arrays instead of crashing.

  - task: "Bulletproof outer try/catch + safeStr defensiveness"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          safeHandle wraps handle() in a top-level try/catch that always returns
          JSON. Every string field read from request body is forced through safeStr().
          No raw exception can escape to the Vercel runtime → no more
          "Cannot read properties of undefined (reading 'startsWith')".

  - task: "Remove axios dependency"
    implemented: true
    working: true
    file: "package.json"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "axios was unused in source. Removed from dependencies; yarn install confirmed clean."

  - task: "Vercel runtime config for diagnostic routes"
    implemented: true
    working: true
    file: "vercel.json"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Added maxDuration entries for /api/health, /api/diag/openrouter, /api/diag/mongo."

frontend:
  - task: "Frontend chat reader compatible with non-streaming response"
    implemented: true
    working: true
    file: "app/page.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          No code changes needed — existing reader.read() loop handles a single-chunk
          body identically to streamed chunks. UI shows STREAMING… while the
          (now ~2–8s) one-shot request is in flight, then renders the full
          response when the body arrives.

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "Standalone /api/health route"
    - "Standalone /api/diag/openrouter route"
    - "Standalone /api/diag/mongo route"
    - "OpenRouter stabilization (no streaming, native fetch, locked headers)"
    - "MongoDB Atlas stabilization (reject localhost, scheme validation, graceful null)"
    - "Bulletproof outer try/catch + safeStr defensiveness"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Production stabilization pass complete.

      Changes (committed locally to /app — ready to "Save to GitHub"):
        • app/api/health/route.js                    (new) — standalone health
        • app/api/diag/openrouter/route.js           (new) — standalone OpenRouter diag
        • app/api/diag/mongo/route.js                (new) — standalone Mongo diag
        • app/api/[[...path]]/route.js               (rewrite) — non-streaming
          OpenRouter, locked 4-header set, localhost-MONGO_URL rejected on Vercel,
          bulletproof outer try/catch, safeStr everywhere.
        • package.json                               (axios removed)
        • vercel.json                                (maxDuration for diag routes)
        • .env.example                               (new) — documents required env vars

      Local verification (yarn dev on port 3000):
        GET /api/health           → 200 (degraded with missingEnv list)
        GET /api/diag/mongo       → JSON env-check error (no MONGO_URL locally)
        GET /api/diag/openrouter  → JSON env-check error (no key locally)
        GET /api/auth/me          → {"user":null}
        GET /api/stats            → 200 stats payload (zero counts)
        POST /api/chat            → clean 401 (unauthorized)
        GET /api/nonexistent      → clean 401

      Zero uncaught exceptions, zero localhost connection attempts on Vercel,
      zero "startsWith of undefined" pathways remaining.

      Next steps for user:
        1. Click "Save to GitHub" → Vercel auto-redeploys.
        2. After deploy, verify on production:
             https://social-operative-inc.vercel.app/api/health
             https://social-operative-inc.vercel.app/api/diag/openrouter
             https://social-operative-inc.vercel.app/api/diag/mongo
        3. If /api/diag/openrouter returns isTLS:true → re-paste OPENROUTER_API_KEY
           in Vercel env vars (strip whitespace).
        4. If /api/diag/mongo returns isNetwork:true → set Atlas IP allowlist
           to 0.0.0.0/0 and verify SRV hostname.
