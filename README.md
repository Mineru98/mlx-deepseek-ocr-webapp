# OCR Service

<p align="center">
  <img src="./static/thumb.png" alt="OCR Service Preview" width="800">
</p>

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
uvicorn main:app --reload --host 0.0.0.0 --port 8787
```

브라우저에서 http://localhost:8787 접속

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
curl -X POST http://localhost:8787/api/ocr/stream \
    -F "file=@document.pdf" \
    -F "prompt=Read all the text in this image." \
    -F "max_tokens=128" \
    -F "temperature=0.0"
```

### POST /api/ocr

일반 OCR 엔드포인트 (이미지 + PDF 지원)

```bash
curl -X POST http://localhost:8787/api/ocr \
    -F "file=@image.png" \
    -F "prompt=Read all the text in this image."
```

### GET /api/health

서버 상태 확인

```bash
curl http://localhost:8787/api/health
```

## n8n 워크플로우 사용

이 OCR 서비스를 n8n 워크플로우에서 사용할 수 있습니다. 제공된 워크플로우 파일을 사용하면 간편하게 OCR 기능을 통합할 수 있습니다.

### 워크플로우 가져오기

1. n8n 대시보드에서 **Workflows** 메뉴로 이동
2. **Import from File** 또는 **Import from URL** 선택
3. `static/딥시크 OCR.json` 파일을 선택하여 가져오기

### 워크플로우 구성

워크플로우는 다음 3개의 노드로 구성되어 있습니다:

1. **Form Trigger**: 웹 폼을 통해 파일과 프롬프트를 입력받습니다
   - 파일 필드: PNG, PDF 파일 업로드
   - 프롬프트 필드: OCR에 사용할 프롬프트 입력

2. **HTTP Request**: OCR 서비스의 `/api/ocr` 엔드포인트를 호출합니다
   - URL: `http://host.docker.internal:8787/api/ocr` (Docker 환경)
   - 로컬 환경의 경우 `http://localhost:8787/api/ocr`로 변경 필요

3. **Form**: OCR 결과를 사용자에게 표시합니다

### 설정 방법

1. 워크플로우를 가져온 후, **HTTP Request** 노드를 열어 URL을 확인합니다
2. Docker 환경이 아닌 경우, URL을 `http://localhost:8787/api/ocr`로 변경합니다
3. 워크플로우를 활성화하면 Form Trigger의 웹훅 URL이 생성됩니다
4. 해당 URL을 통해 폼에 접근하여 OCR을 사용할 수 있습니다

## 파라미터

| 파라미터 | 기본값 | 설명 |
|---------|--------|------|
| file | (필수) | 이미지 또는 PDF 파일 |
| prompt | "Read all the text in this image." | OCR 프롬프트 |
| max_tokens | 128 | 최대 토큰 수 |
| temperature | 0.0 | 생성 온도 (0.0 = 결정적) |
