// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const filePreview = document.getElementById('filePreview');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const removeFile = document.getElementById('removeFile');
const imagePreviewContainer = document.getElementById('imagePreviewContainer');
const imagePreview = document.getElementById('imagePreview');
const promptInput = document.getElementById('promptInput');
const maxTokens = document.getElementById('maxTokens');
const temperature = document.getElementById('temperature');
const submitBtn = document.getElementById('submitBtn');
const submitText = document.getElementById('submitText');
const submitSpinner = document.getElementById('submitSpinner');
const resultSection = document.getElementById('resultSection');
const resultContent = document.getElementById('resultContent');
const processingStatus = document.getElementById('processingStatus');
const statusText = document.getElementById('statusText');
const pageInfo = document.getElementById('pageInfo');
const copyBtn = document.getElementById('copyBtn');
const fileInfo = document.getElementById('fileInfo');
const processedFilename = document.getElementById('processedFilename');
const previewIcon = document.getElementById('previewIcon');

let selectedFile = null;

// PDF-specific state management
let pdfDocument = null;
let selectedPages = new Set(); // Track selected page numbers
let totalPdfPages = 0;

// Additional DOM elements for PDF modal
const pdfModal = document.getElementById('pdfModal');
const pdfThumbnails = document.getElementById('pdfThumbnails');
const pdfLoading = document.getElementById('pdfLoading');
const viewPdfPages = document.getElementById('viewPdfPages');
const pdfPageSelectionContainer = document.getElementById('pdfPageSelectionContainer');
const selectedPagesDisplay = document.getElementById('selectedPagesDisplay');
const selectedPagesList = document.getElementById('selectedPagesList');
const selectedCount = document.getElementById('selectedCount');
const closeModal = document.getElementById('closeModal');
const cancelSelection = document.getElementById('cancelSelection');
const confirmSelection = document.getElementById('confirmSelection');
const selectAll = document.getElementById('selectAll');
const deselectAll = document.getElementById('deselectAll');

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Show toast notification
function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    toastMessage.textContent = message;
    toast.classList.remove('translate-y-full', 'opacity-0');
    setTimeout(() => {
        toast.classList.add('translate-y-full', 'opacity-0');
    }, 3000);
}

// Load and render PDF thumbnails
async function loadPdfThumbnails(file) {
    try {
        pdfLoading.classList.remove('hidden');
        pdfThumbnails.innerHTML = '';

        const arrayBuffer = await file.arrayBuffer();
        pdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        totalPdfPages = pdfDocument.numPages;

        // Render all pages as thumbnails
        for (let pageNum = 1; pageNum <= totalPdfPages; pageNum++) {
            const page = await pdfDocument.getPage(pageNum);
            const viewport = page.getViewport({ scale: 0.5 });

            // Create canvas for thumbnail
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            // Create thumbnail container
            const thumbnailDiv = document.createElement('div');
            thumbnailDiv.className = 'relative group cursor-pointer';
            thumbnailDiv.innerHTML = `
                <div class="page-thumbnail border-3 rounded-xl overflow-hidden transition-all shadow-md hover:shadow-2xl ${
                    selectedPages.has(pageNum) ? 'border-primary ring-4 ring-primary ring-opacity-30 shadow-xl' : 'border-gray-300 hover:border-primary'
                }">
                    <div class="relative">
                        <img src="${canvas.toDataURL()}" alt="Page ${pageNum}" class="w-full">
                        <div class="absolute top-3 left-3">
                            <input type="checkbox"
                                   class="page-checkbox w-6 h-6 rounded-lg cursor-pointer accent-primary"
                                   data-page="${pageNum}"
                                   ${selectedPages.has(pageNum) ? 'checked' : ''}>
                        </div>
                        <div class="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent bg-opacity-0 group-hover:bg-opacity-30 transition-all pointer-events-none"></div>
                    </div>
                    <div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 text-center border-t border-gray-200">
                        <span class="text-sm font-semibold text-gray-800">페이지 ${pageNum}</span>
                    </div>
                </div>
            `;

            // Add click handler
            thumbnailDiv.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox') {
                    const checkbox = thumbnailDiv.querySelector('.page-checkbox');
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            });

            // Checkbox change handler
            const checkbox = thumbnailDiv.querySelector('.page-checkbox');
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                const pageNum = parseInt(checkbox.dataset.page);
                const thumbnailContainer = checkbox.closest('.page-thumbnail');

                if (checkbox.checked) {
                    selectedPages.add(pageNum);
                    thumbnailContainer.classList.remove('border-gray-300');
                    thumbnailContainer.classList.add('border-primary', 'ring-4', 'ring-primary', 'ring-opacity-30', 'shadow-xl');
                } else {
                    selectedPages.delete(pageNum);
                    thumbnailContainer.classList.remove('border-primary', 'ring-4', 'ring-primary', 'ring-opacity-30', 'shadow-xl');
                    thumbnailContainer.classList.add('border-gray-300');
                }

                updateSelectedCount();
            });

            pdfThumbnails.appendChild(thumbnailDiv);
        }

        pdfLoading.classList.add('hidden');
    } catch (error) {
        console.error('PDF loading error:', error);
        showToast('PDF 로딩 중 오류가 발생했습니다.');
        pdfLoading.classList.add('hidden');
    }
}

// Update selected page count display
function updateSelectedCount() {
    selectedCount.textContent = selectedPages.size;
}

// Update selected pages display in main UI
function updateSelectedPagesDisplay() {
    if (selectedPages.size > 0) {
        const pagesArray = Array.from(selectedPages).sort((a, b) => a - b);
        selectedPagesList.textContent = pagesArray.join(', ');
        selectedPagesDisplay.classList.remove('hidden');
    } else {
        selectedPagesDisplay.classList.add('hidden');
    }
}

// Open PDF modal
function openPdfModal() {
    pdfModal.classList.remove('hidden');
    pdfModal.classList.add('flex');
}

// Close PDF modal
function closePdfModal() {
    pdfModal.classList.add('hidden');
    pdfModal.classList.remove('flex');
}

// Modal event listeners
viewPdfPages.addEventListener('click', async () => {
    if (!selectedFile) return;
    await loadPdfThumbnails(selectedFile);
    openPdfModal();
});

closeModal.addEventListener('click', closePdfModal);
cancelSelection.addEventListener('click', closePdfModal);

confirmSelection.addEventListener('click', () => {
    updateSelectedPagesDisplay();
    closePdfModal();
});

selectAll.addEventListener('click', () => {
    selectedPages.clear();
    for (let i = 1; i <= totalPdfPages; i++) {
        selectedPages.add(i);
    }
    // Update all checkboxes and visuals
    document.querySelectorAll('.page-checkbox').forEach(checkbox => {
        checkbox.checked = true;
        checkbox.closest('.page-thumbnail').classList.remove('border-gray-300');
        checkbox.closest('.page-thumbnail').classList.add('border-primary', 'ring-4', 'ring-primary', 'ring-opacity-30', 'shadow-xl');
    });
    updateSelectedCount();
});

deselectAll.addEventListener('click', () => {
    selectedPages.clear();
    document.querySelectorAll('.page-checkbox').forEach(checkbox => {
        checkbox.checked = false;
        checkbox.closest('.page-thumbnail').classList.remove('border-primary', 'ring-4', 'ring-primary', 'ring-opacity-30', 'shadow-xl');
        checkbox.closest('.page-thumbnail').classList.add('border-gray-300');
    });
    updateSelectedCount();
});

// Close modal on backdrop click
pdfModal.addEventListener('click', (e) => {
    if (e.target === pdfModal) {
        closePdfModal();
    }
});

// Handle file selection
function handleFileSelect(file) {
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    if (!isImage && !isPdf) {
        showToast('이미지 또는 PDF 파일만 업로드 가능합니다.');
        return;
    }

    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    filePreview.classList.remove('hidden');
    submitBtn.disabled = false;

    // Update icon based on file type
    if (isPdf) {
        previewIcon.innerHTML = `
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
        `;
        previewIcon.classList.remove('bg-gradient-to-r', 'from-green-500', 'to-emerald-500');
        previewIcon.className = 'w-12 h-12 flex items-center justify-center gradient-bg rounded-xl text-white shadow-lg icon-glow';
        imagePreviewContainer.classList.add('hidden');
        // Show PDF page selection button for PDFs
        pdfPageSelectionContainer.classList.remove('hidden');
        selectedPages.clear(); // Reset selections
        selectedPagesDisplay.classList.add('hidden');
    } else {
        previewIcon.innerHTML = `
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
            </svg>
        `;
        previewIcon.className = 'w-12 h-12 flex items-center justify-center bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl text-white shadow-lg icon-glow';

        // Show image preview
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreview.src = e.target.result;
            imagePreviewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
        // Hide PDF controls for images
        pdfPageSelectionContainer.classList.add('hidden');
        selectedPagesDisplay.classList.add('hidden');
    }
}

// Click to upload
dropZone.addEventListener('click', () => fileInput.click());

// File input change
fileInput.addEventListener('change', (e) => {
    handleFileSelect(e.target.files[0]);
});

// Drag and drop
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFileSelect(e.dataTransfer.files[0]);
});

// Remove file
removeFile.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedFile = null;
    fileInput.value = '';
    filePreview.classList.add('hidden');
    imagePreviewContainer.classList.add('hidden');
    submitBtn.disabled = true;
    // Reset PDF state
    selectedPages.clear();
    pdfPageSelectionContainer.classList.add('hidden');
    selectedPagesDisplay.classList.add('hidden');
    pdfDocument = null;
    totalPdfPages = 0;
});

// Copy result
copyBtn.addEventListener('click', () => {
    const text = resultContent.innerText;
    navigator.clipboard.writeText(text).then(() => {
        showToast('결과가 클립보드에 복사되었습니다.');
    });
});

// Submit OCR request
submitBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    // UI state: processing
    submitBtn.disabled = true;
    submitText.textContent = '처리 중...';
    submitSpinner.classList.remove('hidden');
    resultSection.classList.remove('hidden');
    resultContent.innerHTML = '<span class="cursor-blink"></span>';
    processingStatus.classList.remove('hidden');
    statusText.textContent = '파일 업로드 및 분석 중...';
    pageInfo.classList.add('hidden');
    fileInfo.classList.add('hidden');

    // Prepare form data
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('prompt', promptInput.value || 'Read all the text in this image.');
    formData.append('max_tokens', maxTokens.value);
    formData.append('temperature', temperature.value);

    try {
        // Build URL with page selection
        let url = '/api/ocr/stream';
        if (selectedPages.size > 0) {
            const pagesParam = Array.from(selectedPages).sort((a, b) => a - b).join(',');
            url += `?pages=${encodeURIComponent(pagesParam)}`;
        }

        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let currentPage = 1;
        let totalPages = 1;
        let fullText = '';
        let isStreaming = true;

        // Helper function to update content with cursor
        const updateContent = (text, showCursor = true) => {
            const escapedText = text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>');
            resultContent.innerHTML = escapedText + (showCursor ? '<span class="cursor-blink"></span>' : '');
            resultContent.scrollTop = resultContent.scrollHeight;
        };

        statusText.textContent = '텍스트 생성 중...';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value);
            const lines = text.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));

                        if (data.type === 'page_start') {
                            statusText.textContent = `페이지 ${data.page}/${data.total} 처리 중...`;
                            totalPages = data.total;
                            currentPage = data.page;
                            if (data.page > 1) {
                                fullText += '\n\n--- 페이지 ' + data.page + ' ---\n\n';
                                updateContent(fullText);
                            }
                        } else if (data.type === 'content') {
                            fullText += data.text;
                            updateContent(fullText);
                        } else if (data.type === 'page_end') {
                            // Page completed
                        } else if (data.type === 'done') {
                            isStreaming = false;
                            statusText.textContent = '완료!';
                            processedFilename.textContent = `처리된 파일: ${data.filename}`;
                            fileInfo.classList.remove('hidden');
                            if (data.total_pages > 1) {
                                pageInfo.textContent = `총 ${data.total_pages} 페이지`;
                                pageInfo.classList.remove('hidden');
                            }
                            // Remove cursor when done
                            updateContent(fullText, false);
                        }
                    } catch (e) {
                        console.warn('JSON parse error:', e, line);
                    }
                }
            }
        }

        processingStatus.classList.add('hidden');
        // Ensure cursor is removed
        if (isStreaming) {
            updateContent(fullText, false);
        }
    } catch (error) {
        console.error('Error:', error);
        resultContent.textContent = '오류가 발생했습니다: ' + error.message;
        processingStatus.classList.add('hidden');
        showToast('처리 중 오류가 발생했습니다.');
    } finally {
        submitBtn.disabled = false;
        submitText.textContent = '텍스트 추출 시작';
        submitSpinner.classList.add('hidden');
    }
});
