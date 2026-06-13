from pathlib import Path
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile
import shutil
import logging

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from graph_generator import list_graph_titles, render_graph

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "app" / "uploads"
GENERATED_DIR = UPLOAD_DIR / "generated"
ALLOWED_EXTENSIONS = {".xlsx", ".xls"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

# Create directories with proper permissions
try:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(f"Upload directory: {UPLOAD_DIR}")
    logger.info(f"Generated directory: {GENERATED_DIR}")
except Exception as e:
    logger.error(f"Failed to create directories: {e}")
    raise

app = FastAPI(title="Finance Graph Generator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    file_id: str
    title: str
    sheet: str | None = None


class GenerateAllRequest(BaseModel):
    file_id: str


def get_file_record(file_id):
    matches = list(UPLOAD_DIR.glob(f"{file_id}.*"))
    matches = [path for path in matches if path.is_file() and path.parent == UPLOAD_DIR]

    if not matches:
        raise HTTPException(status_code=404, detail="Uploaded file was not found.")

    return matches[0]


def generated_file_response(file_id, filename):
    file_path = (GENERATED_DIR / file_id / filename).resolve()
    generated_root = (GENERATED_DIR / file_id).resolve()

    if generated_root not in file_path.parents or not file_path.exists():
        raise HTTPException(status_code=404, detail="Generated file was not found.")

    return FileResponse(file_path, filename=filename)


def public_artifact(file_id, path):
    filename = Path(path).name
    return f"/api/files/{file_id}/generated/{filename}"


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "upload_dir_exists": UPLOAD_DIR.exists(),
        "generated_dir_exists": GENERATED_DIR.exists(),
    }


@app.get("/api/status")
def api_status():
    """API status and debugging information"""
    return {
        "status": "ready",
        "upload_dir": str(UPLOAD_DIR),
        "generated_dir": str(GENERATED_DIR),
        "max_file_size_mb": MAX_FILE_SIZE / 1024 / 1024,
        "allowed_extensions": list(ALLOWED_EXTENSIONS),
    }


@app.post("/api/upload")
async def upload_excel(file: UploadFile = File(...)):
    """Upload an Excel file and extract graph titles"""
    try:
        # Validate filename
        if not file.filename:
            raise HTTPException(status_code=400, detail="File must have a name.")
        
        # Validate file extension
        extension = Path(file.filename).suffix.lower()
        if extension not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400, 
                detail=f"Please upload an Excel .xlsx or .xls file. Got: {extension}"
            )
        
        # Read file into memory first to validate size and content
        file_content = await file.read()
        file_size = len(file_content)
        
        if file_size == 0:
            raise HTTPException(status_code=400, detail="File is empty.")
        
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413, 
                detail=f"File size exceeds {MAX_FILE_SIZE / 1024 / 1024}MB limit."
            )
        
        # Generate unique file ID
        file_id = uuid4().hex
        stored_path = UPLOAD_DIR / f"{file_id}{extension}"
        
        # Ensure upload directory exists
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        
        # Write file to disk
        try:
            with stored_path.open("wb") as buffer:
                buffer.write(file_content)
            
            logger.info(f"File uploaded: {file_id}{extension} ({file_size} bytes)")
        except IOError as e:
            logger.error(f"Failed to write file: {e}")
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to save file: {str(e)}"
            )
        
        # Extract graph titles
        try:
            titles = list_graph_titles(stored_path)
        except Exception as e:
            logger.error(f"Failed to extract titles from {stored_path}: {e}")
            stored_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=400,
                detail=f"Failed to read Excel file. {str(e)}"
            )
        
        if not titles:
            stored_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=400,
                detail='No graph titles found. Expected titles like "Outstanding as of ...".',
            )
        
        logger.info(f"Found {len(titles)} graph titles in {file_id}")
        
        return {
            "fileId": file_id,
            "filename": file.filename,
            "size": file_size,
            "titles": titles,
        }
    
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Upload error: {exc}")
        raise HTTPException(status_code=400, detail=f"Upload failed: {str(exc)}") from exc
    finally:
        await file.close()


@app.post("/api/generate")
def generate_graph(request: GenerateRequest):
    """Generate a single graph from uploaded Excel file"""
    try:
        file_path = get_file_record(request.file_id)
        output_dir = GENERATED_DIR / request.file_id
        output_dir.mkdir(parents=True, exist_ok=True)

        result = render_graph(file_path, request.title, output_dir, request.sheet)
        logger.info(f"Generated graph: {request.title} for {request.file_id}")
        
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Graph generation failed: {exc}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "title": result["title"],
        "rows": result["rows"],
        "groups": result["groups"],
        "sheet": result["sheet"],
        "pngUrl": public_artifact(request.file_id, result["png"]),
        "pdfUrl": public_artifact(request.file_id, result["pdf"]),
    }


@app.post("/api/generate-all")
def generate_all_graphs(request: GenerateAllRequest):
    """Generate all graphs from uploaded Excel file"""
    try:
        file_path = get_file_record(request.file_id)
        output_dir = GENERATED_DIR / request.file_id
        output_dir.mkdir(parents=True, exist_ok=True)

        title_items = list_graph_titles(file_path)
        if not title_items:
            raise ValueError("No graph titles were found in this Excel file.")

        generated = [
            render_graph(file_path, item["title"], output_dir, item["sheet"])
            for item in title_items
        ]
        zip_path = output_dir / "all_finance_graphs.zip"

        with ZipFile(zip_path, "w", ZIP_DEFLATED) as archive:
            for item in generated:
                archive.write(item["png"], Path(item["png"]).name)
                archive.write(item["pdf"], Path(item["pdf"]).name)
        
        logger.info(f"Generated {len(generated)} graphs in zip for {request.file_id}")
        
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Batch generation failed: {exc}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "count": len(generated),
        "zipUrl": public_artifact(request.file_id, zip_path),
    }


@app.get("/api/files/{file_id}/generated/{filename}")
def download_generated_file(file_id: str, filename: str):
    return generated_file_response(file_id, filename)


@app.get("/")
def root():
    return {"message": "Finance Graph Generator API"}
