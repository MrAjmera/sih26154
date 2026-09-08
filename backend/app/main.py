from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import health, outputs, submissions

app = FastAPI(title="SIH26154 GenAI Content Transformation Platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(outputs.router)
app.include_router(submissions.router)
