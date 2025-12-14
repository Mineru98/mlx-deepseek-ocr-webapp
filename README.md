# OCR Service

DeepSeek-OCR 모델을 사용한 이미지/PDF 텍스트 추출 서비스입니다.

## 기능

- 이미지에서 텍스트 추출 (PNG, JPG, WEBP 등)
- PDF 문서에서 텍스트 추출 (페이지별 처리)
- 실시간 스트리밍 결과 출력
- 웹 UI 제공

## 설치

```bash
# 가상환경 생성 (권장)
python -m venv .venv
source .venv/bin/activate  # macOS/Linux
# .venv\Scripts\activate  # Windows

# 의존성 설치
uv pip install -r requirements.txt
```

## 실행

### 웹 서버 실행

```bash
uvicorn main:app --reload
```

브라우저에서 http://localhost:8000 접속

### CLI 사용

```bash
python -m mlx_vlm.generate \
    --model mlx-community/DeepSeek-OCR-8bit \
    --max-tokens 100 \
    --temperature 0.0 \
    --prompt "여기서 계좌번호는 뭐야?" \
    --image image1.png
```

## API

### POST /api/ocr/stream

스트리밍 OCR 엔드포인트 (이미지 + PDF 지원)

```bash
curl -X POST http://localhost:8000/api/ocr/stream \
    -F "file=@document.pdf" \
    -F "prompt=Read all the text in this image." \
    -F "max_tokens=128" \
    -F "temperature=0.0"
```

### POST /api/ocr

일반 OCR 엔드포인트 (이미지만 지원)

```bash
curl -X POST http://localhost:8000/api/ocr \
    -F "file=@image.png" \
    -F "prompt=Read all the text in this image."
```

### GET /api/health

서버 상태 확인

```bash
curl http://localhost:8000/api/health
```

## 파라미터

| 파라미터 | 기본값 | 설명 |
|---------|--------|------|
| file | (필수) | 이미지 또는 PDF 파일 |
| prompt | "Read all the text in this image." | OCR 프롬프트 |
| max_tokens | 128 | 최대 토큰 수 |
| temperature | 0.0 | 생성 온도 (0.0 = 결정적) |
