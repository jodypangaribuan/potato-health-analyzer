"""
FastAPI Backend for Potato Health Classification System
Replaces Django backend with a lightweight, fast API server.
"""

import os

# Set OpenBLAS to single-threaded mode to avoid memory issues
os.environ['OPENBLAS_NUM_THREADS'] = '1'

import shutil
import uuid
from pathlib import Path
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from services.image_processor import ImageProcessor

# Initialize FastAPI app
app = FastAPI(
    title="Potato Health Classification API",
    description="API for analyzing potato plant health using spectral imagery",
    version="1.0.0"
)

# CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:22444",
        "http://127.0.0.1:22444",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directory setup
BASE_DIR = Path(__file__).resolve().parent
MEDIA_DIR = BASE_DIR / "media"
UPLOAD_DIR = MEDIA_DIR / "uploads"
RESULTS_DIR = MEDIA_DIR / "results"

# Create directories
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

# Mount static files for serving results
app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")

# Initialize image processor
processor = ImageProcessor(
    model_path=str(BASE_DIR / "model" / "final_vgg16_plant_health100.h5"),
    media_root=str(MEDIA_DIR)
)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "ok",
        "message": "Potato Health Classification API is running",
        "version": "1.0.0"
    }


@app.post("/api/analyze")
async def analyze_images(
    original: UploadFile = File(..., description="Original image (RGB/visible)"),
    nir: UploadFile = File(..., description="NIR band image"),
    red: UploadFile = File(..., description="Red band image"),
    red_edge: UploadFile = File(..., description="Red Edge band image"),
):
    """
    Analyze spectral images for potato plant health classification.
    
    Accepts:
    - original: The visible/RGB image
    - nir: Near-Infrared band
    - red: Red band
    - red_edge: Red Edge band
    
    Returns:
    - Classification results with overlay images and statistics
    """
    
    # Generate unique session ID
    session_id = str(uuid.uuid4())[:8]
    session_dir = UPLOAD_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        # Save uploaded files
        file_paths = {}
        for name, file in [("original", original), ("nir", nir), ("red", red), ("red_edge", red_edge)]:
            file_path = session_dir / f"{name}_{file.filename}"
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            file_paths[name] = str(file_path)
        
        # Process images
        results = processor.process_images(
            original_path=file_paths["original"],
            nir_path=file_paths["nir"],
            red_path=file_paths["red"],
            red_edge_path=file_paths["red_edge"],
            session_id=session_id
        )
        
        # Build response with media URLs
        base_url = "/media"
        response = {
            "success": True,
            "session_id": session_id,
            "timestamp": datetime.now().isoformat(),
            "images": {
                "original_preview": f"{base_url}/{results.get('original_preview', '')}",
                "overlay_result": f"{base_url}/{results.get('overlay_result', '')}",
                "overlay_before_labels": f"{base_url}/{results.get('overlay_before_labels', '')}",
                "final_overlay": f"{base_url}/{results.get('final_overlay', '')}",
            },
            "metadata": results.get("coordinates", {}),
            "classification_summary": results.get("classification_summary", []),
        }
        
        return JSONResponse(content=response)
        
    except Exception as e:
        # Clean up on error
        if session_dir.exists():
            shutil.rmtree(session_dir)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/results/{session_id}")
async def get_results(session_id: str):
    """Get results for a previous analysis session"""
    results_file = RESULTS_DIR / session_id / "results.json"
    
    if not results_file.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    
    import json
    with open(results_file) as f:
        return JSONResponse(content=json.load(f))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=22555, reload=True)
