from fastapi import FastAPI # type: ignore
from fastapi.middleware.cors import CORSMiddleware # type: ignore
from fastapi.responses import JSONResponse # type: ignore
import os

app = FastAPI(title="Finance Graph Generator API")

# Configure CORS for frontend requests
origins = [
    "http://localhost:5173",  # Vite default dev server
    "http://localhost:3000",  # Alternative
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}

@app.get("/")
def root():
    """Root endpoint"""
    return {"message": "Finance Graph Generator API"}

@app.post("/generate-graph")
def generate_graph(data: dict):
    """Generate a financial graph (placeholder)"""
    return {"message": "Graph generation endpoint", "data": data}
