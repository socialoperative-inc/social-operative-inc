"""
Lightweight FastAPI proxy.

This container ships with supervisor expecting a backend on port 8001.
The actual application is a Next.js app running on port 3000 (which serves
both the UI and its own /api/* routes). This proxy simply forwards every
incoming request to the Next.js server so the public ingress (which routes
/api/* to port 8001) keeps working without supervisor config changes.
"""
import httpx
from fastapi import FastAPI, Request, Response
from fastapi.responses import StreamingResponse

NEXT_ORIGIN = "http://localhost:3000"

app = FastAPI(title="Next.js API proxy")

# Single long-lived client for connection pooling.
_client = httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0), follow_redirects=False)


@app.get("/healthz")
async def healthz():
    return {"ok": True, "proxy_to": NEXT_ORIGIN}


@app.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
async def proxy(path: str, request: Request):
    # Build upstream URL preserving path + query string.
    upstream_url = f"{NEXT_ORIGIN}/{path}"
    if request.url.query:
        upstream_url = f"{upstream_url}?{request.url.query}"

    # Filter hop-by-hop / forbidden headers.
    hop = {"host", "content-length", "connection", "transfer-encoding", "accept-encoding"}
    fwd_headers = {k: v for k, v in request.headers.items() if k.lower() not in hop}

    body = await request.body()

    upstream = await _client.request(
        request.method,
        upstream_url,
        content=body,
        headers=fwd_headers,
    )

    # Filter response hop-by-hop headers.
    resp_hop = {"content-encoding", "transfer-encoding", "connection", "content-length"}
    resp_headers = {k: v for k, v in upstream.headers.items() if k.lower() not in resp_hop}

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=resp_headers,
        media_type=upstream.headers.get("content-type"),
    )
