from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import chat, fleet, predict, conversations
from app.host.llm_host import startup_mcp_session, shutdown_mcp_session


@asynccontextmanager
async def lifespan(app: FastAPI) :
    #starts the mcp server subprocess once, when the API boots and keeps it alive for the app's lifetime 
    #previously a fresh subprocess was spawned on every single/chat request, which was the single largest sourve of response latency
    await startup_mcp_session()
    yield
    await shutdown_mcp_session()

app = FastAPI(title="Predictive Maintenance Agent API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


app.include_router(chat.router, prefix="/api")
app.include_router(fleet.router, prefix="/api")
app.include_router(predict.router, prefix="/api")
app.include_router(conversations.router, prefix="/api")