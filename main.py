import hashlib
import io
import os
import tempfile
from contextlib import asynccontextmanager
from datetime import datetime

import fitz  # PyMuPDF
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from mlx_vlm import generate, load, stream_generate
from mlx_vlm.prompt_utils import apply_chat_template
from mlx_vlm.utils import load_config
from PIL import Image

model = None
processor = None
config = None

MODEL_PATH = "mlx-community/DeepSeek-OCR-8bit"


def generate_unique_filename(original_filename: str) -> str:
    """Generate unique filename using date and hash."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    hash_input = f"{original_filename}{timestamp}"
    file_hash = hashlib.md5(hash_input.encode()).hexdigest()[:8]
    name, ext = os.path.splitext(original_filename)
    return f"{timestamp}_{file_hash}{ext}"


def pdf_to_images(pdf_bytes: bytes, dpi: int = 150) -> list[Image.Image]:
    """Convert PDF bytes to list of PIL Images."""
    images = []
    pdf_document = fitz.open(stream=pdf_bytes, filetype="pdf")

    for page_num in range(len(pdf_document)):
        page = pdf_document.load_page(page_num)
        mat = fitz.Matrix(dpi / 72, dpi / 72)
        pix = page.get_pixmap(matrix=mat)
        img_data = pix.tobytes("png")
        image = Image.open(io.BytesIO(img_data))
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


app = FastAPI(
    title="OCR API",
    description="OCR API using DeepSeek-OCR with MLX",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for frontend
static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.post("/api/ocr")
async def ocr(
    file: UploadFile = File(...),
    prompt: str = Form(default="Read all the text in this image."),
    max_tokens: int = Form(default=4096),
    temperature: float = Form(default=0.0),
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        image = Image.open(tmp_path)
        formatted_prompt = apply_chat_template(processor, config, prompt, num_images=1)

        output = generate(
            model,
            processor,
            formatted_prompt,
            image=[image],
            max_tokens=max_tokens,
            temperature=temperature,
            verbose=False,
        )

        # Handle GenerationResult object
        if hasattr(output, "text"):
            result = output.text
        elif hasattr(output, "__str__"):
            result = str(output)
        else:
            result = output

        return JSONResponse(content={"result": result})
    finally:
        os.unlink(tmp_path)


@app.post("/api/ocr/stream")
async def ocr_stream(
    file: UploadFile = File(...),
    prompt: str = Form(default="Read all the text in this image."),
    max_tokens: int = Form(default=4096),
    temperature: float = Form(default=0.0),
):
    """Streaming OCR endpoint for images and PDFs with real token-by-token streaming."""
    import json

    content = await file.read()
    content_type = file.content_type or ""
    unique_filename = generate_unique_filename(file.filename or "file")

    # Determine if PDF or image
    is_pdf = content_type == "application/pdf" or (
        file.filename and file.filename.lower().endswith(".pdf")
    )

    if is_pdf:
        images = pdf_to_images(content)
    elif content_type.startswith("image/"):
        images = [Image.open(io.BytesIO(content))]
    else:
        raise HTTPException(status_code=400, detail="File must be an image or PDF")

    def generate_stream():
        for page_idx, image in enumerate(images):
            # Send page start marker
            yield f"data: {json.dumps({'type': 'page_start', 'page': page_idx + 1, 'total': len(images)})}\n\n"

            formatted_prompt = apply_chat_template(
                processor, config, prompt, num_images=1
            )

            # Use stream_generate for real token-by-token streaming
            token_generator = stream_generate(
                model,
                processor,
                formatted_prompt,
                image=[image],
                max_tokens=max_tokens,
                temperature=temperature,
            )

            # Stream tokens as they are generated
            for result in token_generator:
                # result is a GenerationResult object, extract the text
                text = result.text if hasattr(result, "text") else str(result)
                if text:
                    yield f"data: {json.dumps({'type': 'content', 'text': text, 'page': page_idx + 1})}\n\n"

            # Send page end marker
            yield f"data: {json.dumps({'type': 'page_end', 'page': page_idx + 1})}\n\n"

        # Send completion marker
        yield f"data: {json.dumps({'type': 'done', 'filename': unique_filename, 'total_pages': len(images)})}\n\n"

    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/health")
async def health():
    return {"status": "ok", "model": MODEL_PATH}


@app.get("/")
async def root():
    """Serve the frontend."""
    return FileResponse(os.path.join(static_dir, "index.html"))
