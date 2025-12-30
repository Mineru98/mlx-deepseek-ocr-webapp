import hashlib
import io
import os
import tempfile
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Optional

import fitz
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from mlx_vlm import generate, load, stream_generate
from mlx_vlm.prompt_utils import apply_chat_template
from mlx_vlm.utils import load_config
from PIL import Image

model: Any = None
processor: Any = None
config: Any = None

MODEL_PATH = "mlx-community/DeepSeek-OCR-8bit"


def generate_unique_filename(original_filename: str) -> str:
    """Generate unique filename using date and hash."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    hash_input = f"{original_filename}{timestamp}"
    file_hash = hashlib.md5(hash_input.encode()).hexdigest()[:8]
    name, ext = os.path.splitext(original_filename)
    return f"{timestamp}_{file_hash}{ext}"


def pdf_to_images(pdf_bytes: bytes, dpi: int = 150, selected_pages: Optional[list[int]] = None) -> list[Image.Image]:
    """Convert PDF bytes to list of PIL Images.

    Args:
        pdf_bytes: PDF file content
        dpi: Resolution for rendering (default: 150)
        selected_pages: List of 1-based page numbers to convert (None = all pages)

    Returns:
        List of PIL Images corresponding to selected pages

    Raises:
        ValueError: If page numbers are invalid
    """
    images = []
    pdf_document = fitz.open(stream=pdf_bytes, filetype="pdf")
    total_pages = len(pdf_document)

    if selected_pages is not None:
        invalid_pages = [p for p in selected_pages if p < 1 or p > total_pages]
        if invalid_pages:
            pdf_document.close()
            raise ValueError(
                f"Invalid page numbers: {invalid_pages}. " f"PDF has {total_pages} pages (valid range: 1-{total_pages})"
            )
        page_indices = [p - 1 for p in selected_pages]
    else:
        page_indices = range(total_pages)

    for page_idx in page_indices:
        page = pdf_document.load_page(page_idx)
        mat = fitz.Matrix(dpi / 72, dpi / 72)
        pix = page.get_pixmap(matrix=mat)
        img_data = pix.tobytes("png")
        image = Image.open(io.BytesIO(img_data))
        if image.mode != "RGB":
            image = image.convert("RGB")
        images.append(image)

    pdf_document.close()
    return images


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model, processor, config
    print(f"Loading model: {MODEL_PATH}")
    model, processor = load(MODEL_PATH, trust_remote_code=True)
    config = load_config(MODEL_PATH)
    print("Model loaded successfully")
    yield
    print("Shutting down...")


app = FastAPI(title="OCR API", description="OCR API using DeepSeek-OCR with MLX", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"]  # type: ignore
)

static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.post("/api/ocr")
async def ocr(
    file: UploadFile = File(...),
    prompt: str = Form(default="Read all the text in this image."),
    max_tokens: int = Form(default=128),
    temperature: float = Form(default=0.0),
    pages: Optional[str] = Query(default=None, description="Comma-separated page numbers (e.g., '1,3,5')"),
):
    """OCR endpoint for images and PDFs."""
    content = await file.read()
    content_type = file.content_type or ""

    is_pdf = content_type == "application/pdf" or (file.filename and file.filename.lower().endswith(".pdf"))

    if is_pdf:
        selected_page_numbers = None
        if pages:
            try:
                selected_page_numbers = [int(p.strip()) for p in pages.split(",") if p.strip()]
                if not selected_page_numbers:
                    selected_page_numbers = None
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid page numbers format: '{pages}'. Expected comma-separated integers (e.g., '1,3,5')",
                )

        try:
            images = pdf_to_images(content, selected_pages=selected_page_numbers)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    elif content_type.startswith("image/"):
        image = Image.open(io.BytesIO(content))
        if image.mode != "RGB":
            image = image.convert("RGB")
        images = [image]
    else:
        raise HTTPException(status_code=400, detail="File must be an image or PDF")

    if model is None or processor is None or config is None:
        raise HTTPException(status_code=503, detail="Model is not loaded yet. Please wait for initialization.")

    results = []
    for page_idx, image in enumerate(images):
        formatted_prompt = apply_chat_template(processor, config, prompt, num_images=1)
        prompt_str = str(formatted_prompt) if not isinstance(formatted_prompt, str) else formatted_prompt

        output = generate(
            model,
            processor,
            prompt_str,
            image=[image],
            max_tokens=max_tokens,
            temperature=temperature,
            verbose=False,
        )

        if hasattr(output, "text"):
            result = output.text
        elif hasattr(output, "__str__"):
            result = str(output)
        else:
            result = output

        results.append({"page": page_idx + 1, "text": result})

    if len(results) == 1:
        return JSONResponse(content={"result": results[0]["text"]})
    else:
        return JSONResponse(content={"results": results, "total_pages": len(results)})


@app.post("/api/ocr/stream")
async def ocr_stream(
    file: UploadFile = File(...),
    prompt: str = Form(default="Read all the text in this image."),
    max_tokens: int = Form(default=128),
    temperature: float = Form(default=0.0),
    pages: Optional[str] = Query(default=None, description="Comma-separated page numbers (e.g., '1,3,5')"),
):
    """Streaming OCR endpoint for images and PDFs with real token-by-token streaming."""
    import json

    content = await file.read()
    content_type = file.content_type or ""
    unique_filename = generate_unique_filename(file.filename or "file")

    is_pdf = content_type == "application/pdf" or (file.filename and file.filename.lower().endswith(".pdf"))

    if is_pdf:
        selected_page_numbers = None
        if pages:
            try:
                selected_page_numbers = [int(p.strip()) for p in pages.split(",") if p.strip()]
                if not selected_page_numbers:
                    selected_page_numbers = None
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid page numbers format: '{pages}'. Expected comma-separated integers (e.g., '1,3,5')",
                )

        try:
            images = pdf_to_images(content, selected_pages=selected_page_numbers)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    elif content_type.startswith("image/"):
        image = Image.open(io.BytesIO(content))
        if image.mode != "RGB":
            image = image.convert("RGB")
        images = [image]
    else:
        raise HTTPException(status_code=400, detail="File must be an image or PDF")

    if model is None or processor is None or config is None:
        raise HTTPException(status_code=503, detail="Model is not loaded yet. Please wait for initialization.")

    def generate_stream():
        for page_idx, image in enumerate(images):
            yield f"data: {json.dumps({'type': 'page_start', 'page': page_idx + 1, 'total': len(images)})}\n\n"

            formatted_prompt = apply_chat_template(processor, config, prompt, num_images=1)
            prompt_str = str(formatted_prompt) if not isinstance(formatted_prompt, str) else formatted_prompt

            token_generator = stream_generate(
                model, processor, prompt_str, image=[image], max_tokens=max_tokens, temperature=temperature
            )

            for result in token_generator:
                text = result.text if hasattr(result, "text") else str(result)
                if text:
                    yield f"data: {json.dumps({'type': 'content', 'text': text, 'page': page_idx + 1})}\n\n"
            yield f"data: {json.dumps({'type': 'page_end', 'page': page_idx + 1})}\n\n"

        yield f"data: {json.dumps({'type': 'done', 'filename': unique_filename, 'total_pages': len(images)})}\n\n"

    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@app.get("/api/health")
async def health():
    return {"status": "ok", "model": MODEL_PATH}


@app.get("/")
async def root():
    """Serve the frontend."""
    return FileResponse(os.path.join(static_dir, "index.html"))
