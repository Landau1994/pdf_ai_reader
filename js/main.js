let pdfDoc = null;
let pageNum = 1;
let pageRendering = false;
let pageNumPending = null;
const scale = 1.5;
const canvas = document.getElementById('pdf-render');
const ctx = canvas.getContext('2d');
const textLayer = document.getElementById('text-layer');
const pdfContainer = document.querySelector('.pdf-container');
const userInput = document.getElementById('user-input');

// 初始化PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// 渲染PDF页面
async function renderPage(num) {
    pageRendering = true;
    
    try {
        const page = await pdfDoc.getPage(num);
        const viewport = page.getViewport({ scale });

        // 设置canvas尺寸
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // 渲染PDF页面到Canvas
        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };

        await page.render(renderContext).promise;

        // 渲染文本层
        textLayer.innerHTML = '';
        textLayer.style.width = `${viewport.width}px`;
        textLayer.style.height = `${viewport.height}px`;

        const textContent = await page.getTextContent();
        pdfjsLib.renderTextLayer({
            textContent: textContent,
            container: textLayer,
            viewport: viewport,
            textDivs: []
        });

        pageRendering = false;
        if (pageNumPending !== null) {
            renderPage(pageNumPending);
            pageNumPending = null;
        }
    } catch (error) {
        console.error('渲染页面错误:', error);
        pageRendering = false;
    }

    document.getElementById('page-num').textContent = num;
}

// 切换页面
function queueRenderPage(num) {
    if (pageRendering) {
        pageNumPending = num;
    } else {
        renderPage(num);
    }
}

// 上一页
function showPrevPage() {
    if (pageNum <= 1) return;
    pageNum--;
    queueRenderPage(pageNum);
}

// 下一页
function showNextPage() {
    if (pageNum >= pdfDoc.numPages) return;
    pageNum++;
    queueRenderPage(pageNum);
}

// 鼠标滚轮事件处理
pdfContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    if (delta > 0) {
        showNextPage();
    } else {
        showPrevPage();
    }
}, { passive: false });

// 按钮点击事件
document.getElementById('prev-page').addEventListener('click', showPrevPage);
document.getElementById('next-page').addEventListener('click', showNextPage);

// 键盘事件处理
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        showPrevPage();
    } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        showNextPage();
    }
});

// 提取PDF文本内容
async function extractPDFText(pdf) {
    const numPages = pdf.numPages;
    let fullText = '';
    
    for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += `【第${i}页】\n${pageText}\n\n`;
    }
    
    return fullText;
}

// 处理文件输入
document.getElementById('file-input').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (file.type !== 'application/pdf') {
        alert('请选择PDF文件！');
        return;
    }

    const fileReader = new FileReader();
    fileReader.onload = async function() {
        const typedarray = new Uint8Array(this.result);
        
        try {
            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            pdfDoc = pdf;
            document.getElementById('page-count').textContent = pdf.numPages;
            
            // 重置页码并渲染第一页
            pageNum = 1;
            renderPage(pageNum);
            
            // 提取文本
            const text = await extractPDFText(pdf);
            window.pdfText = text;
            console.log('PDF文本提取完成，总长度:', text.length);
        } catch (error) {
            console.error('PDF处理错误:', error);
            alert('PDF文件处理失败，请重试');
        }
    };
    fileReader.readAsArrayBuffer(file);
});

// 添加文本压缩函数（去除多余空格和换行）
function compressText(text) {
    return text
        .replace(/\n+/g, '\n')      // 多个换行合并为一个
        .replace(/[ \t]+/g, ' ')    // 多个空格合并为一个
        .replace(/(\S)\n(\S)/g, '$1 $2')  // 处理换行符
        .trim();
}

// 优化文本提取方法（分块处理）
function processLongText(text, maxLength = 3000) {
    const chunks = [];
    while (text.length > 0) {
        chunks.push(text.substring(0, maxLength));
        text = text.substring(maxLength);
    }
    return chunks;
}

// 在存储时处理
window.pdfTextChunks = processLongText(fullText);

// 添加文本选择处理函数
function handleTextSelection() {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    if (selectedText) {
        // 创建一个浮动按钮
        let floatButton = document.getElementById('float-copy-button');
        if (!floatButton) {
            floatButton = document.createElement('button');
            floatButton.id = 'float-copy-button';
            floatButton.className = 'float-button';
            document.body.appendChild(floatButton);
        }

        floatButton.textContent = '发送到对话框';
        
        // 定位浮动按钮
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        floatButton.style.top = `${window.scrollY + rect.bottom + 10}px`;
        floatButton.style.left = `${window.scrollX + rect.left}px`;
        floatButton.style.display = 'block';
        
        // 点击事件处理
        floatButton.onclick = () => {
            userInput.value = selectedText;
            floatButton.style.display = 'none';
            userInput.focus();
        };
    } else {
        // 隐藏浮动按钮
        const floatButton = document.getElementById('float-copy-button');
        if (floatButton) {
            floatButton.style.display = 'none';
        }
    }
}

// 添加选择事件监听
textLayer.addEventListener('mouseup', handleTextSelection);
document.addEventListener('mousedown', (e) => {
    // 点击其他地方时隐藏浮动按钮
    if (e.target.id !== 'float-copy-button') {
        const floatButton = document.getElementById('float-copy-button');
        if (floatButton) {
            floatButton.style.display = 'none';
        }
    }
});

document.addEventListener('DOMContentLoaded', (event) => {
    document.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
    });
}); 
