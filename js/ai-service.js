class AIService {
    constructor() {
        this.messageContainer = document.querySelector('.messages-container');
        this.userInput = document.getElementById('user-input');
        this.sendButton = document.getElementById('send-button');
        this.clearButton = document.getElementById('clear-chat');
        this.prevButton = document.getElementById('prev-messages');
        this.nextButton = document.getElementById('next-messages');
        this.pageDisplay = document.getElementById('message-page');
        
        this.messages = [];
        this.messagesPerPage = 6;  // 修改为每页显示6条消息
        this.currentPage = 1;
        
        // 拖动相关的属性初始化
        this.chatInput = document.querySelector('.chat-input');
        this.dragHandle = document.querySelector('.drag-handle');
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.currentLeft = 0;
        this.currentTop = 0;

        // 添加resize相关的属性
        this.isResizing = false;

        this.includeContextSwitch = document.getElementById('include-context');

        this.renderCodeSwitch = document.getElementById('render-code');
        this.renderCodeSwitch.addEventListener('change', () => {
            this.messages.forEach(msg => {
                if (msg.type === 'ai') {
                    msg.content = msg.rawContent || msg.content;
                }
            });
            this.renderMessages();
        });

        // 配置 marked 选项
        marked.setOptions({
            renderer: new marked.Renderer(),
            highlight: (code, lang) => {
                try {
                    // 确保语言存在且被支持
                    if (lang && hljs.getLanguage(lang)) {
                        return hljs.highlight(code, {
                            language: lang,
                            ignoreIllegals: true
                        }).value;
                    }
                    // 如果没有指定语言，尝试自动检测
                    return hljs.highlightAuto(code).value;
                } catch (err) {
                    console.error('代码高亮错误:', err);
                    return code;
                }
            },
            breaks: true,
            gfm: true,
            sanitize: false
        });

        // 初始化 highlight.js
        hljs.configure({
            ignoreUnescapedHTML: true,
            throwUnescapedHTML: false
        });

        this.initEventListeners();
        this.initDragEvents();
        this.initResizeEvents();
    }

    initEventListeners() {
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.clearButton.addEventListener('click', () => this.clearMessages());
        this.prevButton.addEventListener('click', () => this.showPrevPage());
        this.nextButton.addEventListener('click', () => this.showNextPage());
        
        this.userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }

    initDragEvents() {
        this.dragHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.startDragging(e);
        });

        document.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                e.preventDefault();
                this.drag(e);
            }
        });

        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.stopDragging();
            }
        });
    }

    initResizeEvents() {
        // 监听resize开始
        this.chatInput.addEventListener('mousedown', (e) => {
            // 检查是否点击在resize控件上
            const rect = this.chatInput.getBoundingClientRect();
            const isResizeArea = (
                e.clientX > rect.right - 20 && 
                e.clientY > rect.bottom - 20
            );
            
            if (isResizeArea) {
                this.isResizing = true;
                this.chatInput.classList.add('resizing');
            }
        });

        // 监听resize结束
        document.addEventListener('mouseup', () => {
            if (this.isResizing) {
                this.isResizing = false;
                this.chatInput.classList.remove('resizing');
            }
        });

        // 防止拖动和resize冲突
        this.chatInput.addEventListener('mousemove', (e) => {
            const rect = this.chatInput.getBoundingClientRect();
            const isResizeArea = (
                e.clientX > rect.right - 20 && 
                e.clientY > rect.bottom - 20
            );
            
            this.chatInput.style.cursor = isResizeArea ? 'se-resize' : 'auto';
            if (isResizeArea) {
                this.dragHandle.style.pointerEvents = 'none';
            } else {
                this.dragHandle.style.pointerEvents = 'auto';
            }
        });
    }

    startDragging(e) {
        // 如果正在调整大小，不启动拖动
        if (this.isResizing) return;

        this.isDragging = true;
        this.chatInput.classList.add('dragging');
        
        const rect = this.chatInput.getBoundingClientRect();
        this.currentLeft = rect.left;
        this.currentTop = rect.top;
        
        this.startX = e.clientX - this.currentLeft;
        this.startY = e.clientY - this.currentTop;
    }

    drag(e) {
        if (!this.isDragging) return;

        // 计算新位置
        let newLeft = e.clientX - this.startX;
        let newTop = e.clientY - this.startY;

        // 获取窗口和输入框的尺寸
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const boxWidth = this.chatInput.offsetWidth;
        const boxHeight = this.chatInput.offsetHeight;

        // 限制拖动范围
        newLeft = Math.max(0, Math.min(newLeft, windowWidth - boxWidth));
        newTop = Math.max(0, Math.min(newTop, windowHeight - boxHeight));

        // 更新位置
        this.chatInput.style.left = `${newLeft}px`;
        this.chatInput.style.top = `${newTop}px`;
        this.chatInput.style.right = 'auto';
        this.chatInput.style.bottom = 'auto';
    }

    stopDragging() {
        this.isDragging = false;
        this.chatInput.classList.remove('dragging');
    }

    async sendMessage() {
        const message = this.userInput.value.trim();
        if (!message) return;

        // 添加用户消息
        this.addMessage('user', message);
        
        // 清除输入框但保持焦点
        this.userInput.value = '';
        this.userInput.focus();

        // 添加加载指示器
        const loadingId = this.addMessage('loading', '正在分析文档内容...');

        try {
            const response = await this.callAI(message);
            this.removeMessage(loadingId);
            this.addMessage('ai', response);
        } catch (error) {
            this.removeMessage(loadingId);
            console.error('AI API调用失败:', error);
            this.addMessage('error', `错误信息: ${error.message}`);
        }
    }

    async addMessage(type, content) {
        const messageId = Date.now();
        const message = { 
            id: messageId, 
            type, 
            content,
            rawContent: content,
            timestamp: new Date() 
        };
        this.messages.push(message);
        
        const totalPages = Math.ceil(this.messages.length / this.messagesPerPage);
        this.currentPage = totalPages;
        this.renderMessages();
        
        // 确保代码高亮被正确应用
        requestAnimationFrame(() => {
            this.messageContainer.querySelectorAll('pre code').forEach(block => {
                try {
                    // 移除旧的高亮
                    block.className = block.className.replace(/hljs|language-\w+/g, '').trim();
                    const lang = block.className.match(/language-(\w+)/)?.[1] || '';
                    
                    // 根据开关状态应用高亮
                    if (this.renderCodeSwitch.checked) {
                        block.classList.add('hljs', `language-${lang || 'text'}`);
                        if (lang && hljs.getLanguage(lang)) {
                            hljs.highlightElement(block);
                        } else {
                            hljs.highlightAuto(block);
                        }
                        // 添加高亮状态类
                        block.closest('.code-block')?.classList.add('highlight-enabled');
                    } else {
                        // 移除高亮状态
                        block.closest('.code-block')?.classList.remove('highlight-enabled');
                        block.textContent = block.textContent; // 重置内容，移除高亮标记
                    }
                } catch (err) {
                    console.error('代码高亮应用错误:', err);
                }
            });
        });
        
        return messageId;
    }

    removeMessage(messageId) {
        const prevLength = this.messages.length;
        this.messages = this.messages.filter(msg => msg.id !== messageId);
        
        // 如果删除后消息数量变少，可能需要调整当前页
        if (this.messages.length < prevLength) {
            const totalPages = Math.max(1, Math.ceil(this.messages.length / this.messagesPerPage));
            this.currentPage = Math.min(this.currentPage, totalPages);
        }
        
        this.renderMessages();
    }

    clearMessages() {
        if (confirm('确定要清空所有对话记录吗？')) {
            this.messages = [];
            this.currentPage = 1;
            this.renderMessages();
        }
    }

    showPrevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.renderMessages();
        }
    }

    showNextPage() {
        const totalPages = Math.ceil(this.messages.length / this.messagesPerPage);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.renderMessages();
        }
    }

    renderMessages() {
        // 清空容器
        this.messageContainer.innerHTML = '';
        
        // 计算总页数和当前页消息
        const totalMessages = this.messages.length;
        const totalPages = Math.max(1, Math.ceil(totalMessages / this.messagesPerPage));
        
        // 确保当前页在有效范围内
        this.currentPage = Math.min(Math.max(1, this.currentPage), totalPages);
        
        const startIdx = (this.currentPage - 1) * this.messagesPerPage;
        const endIdx = Math.min(startIdx + this.messagesPerPage, totalMessages);
        const currentPageMessages = this.messages.slice(startIdx, endIdx);
        
        // 渲染当前页的消息
        currentPageMessages.forEach(message => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${message.type}-message`;
            
            // 添加时间戳
            const timestamp = message.timestamp.toLocaleTimeString();
            const timeDiv = document.createElement('div');
            timeDiv.className = 'message-time';
            timeDiv.textContent = timestamp;
            
            // 添加内容
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            
            // 添加渲染内容和原始内容
            const renderedDiv = document.createElement('div');
            renderedDiv.className = 'rendered-content';
            renderedDiv.innerHTML = this.renderMarkdown(message.content);
            
            // 渲染数学公式
            if (window.MathJax && message.type === 'ai') {
                window.MathJax.typesetClear();
                window.MathJax.typesetPromise([renderedDiv]).catch((err) => {
                    console.error('MathJax 渲染错误:', err);
                });
            }
            
            const rawPre = document.createElement('pre');
            rawPre.className = 'raw-content hidden';
            rawPre.textContent = message.content;
            
            contentDiv.appendChild(renderedDiv);
            contentDiv.appendChild(rawPre);
            
            messageDiv.appendChild(timeDiv);
            messageDiv.appendChild(contentDiv);
            this.messageContainer.appendChild(messageDiv);
        });
        
        // 更新页码显示
        this.pageDisplay.textContent = `${this.currentPage}/${totalPages}`;
        
        // 更新按钮状态
        this.prevButton.disabled = this.currentPage <= 1;
        this.nextButton.disabled = this.currentPage >= totalPages;
        
        // 滚动到顶部
        this.messageContainer.scrollTop = 0;

        // 添加复制按钮事件监听
        this.messageContainer.querySelectorAll('.code-copy').forEach(button => {
            button.addEventListener('click', (e) => {
                const codeBlock = e.target.closest('.code-block');
                const code = codeBlock.querySelector('code').textContent;
                
                navigator.clipboard.writeText(code).then(() => {
                    const button = e.target.closest('.code-copy');
                    button.classList.add('copied');
                    
                    setTimeout(() => {
                        button.classList.remove('copied');
                    }, 2000);
                }).catch(err => {
                    console.error('复制失败:', err);
                });
            });
        });
    }

    renderMarkdown(text) {
        try {
            // 添加空值检查
            if (typeof text !== 'string') {
                console.warn('尝试渲染非字符串内容:', text);
                return '';
            }

            // 预处理代码块保留原始内容
            text = text.replace(/```([\w-]+)?\n([\s\S]*?)```/g, (match, lang, code) => {
                return `\`\`\`${lang || 'text'}\n${code}\n\`\`\``;
            });

            let html = marked(text);

            // 后处理代码块
            html = html.replace(/<pre><code class="language-([\w-]+)">([\s\S]*?)<\/code><\/pre>/g, 
                (match, lang, code) => {
                    // 保留原始代码内容
                    const rawCode = code.replace(/<\/?[^>]+(>|$)/g, ""); // 移除可能存在的HTML标签
                    
                    // 根据开关状态决定是否高亮
                    let processedCode = rawCode;
                    if (this.renderCodeSwitch.checked) {
                        try {
                            processedCode = hljs.highlight(rawCode, {
                                language: lang || 'plaintext',
                                ignoreIllegals: true
                            }).value;
                        } catch (err) {
                            processedCode = hljs.highlightAuto(rawCode).value;
                        }
                    }

                    return `
                    <div class="code-block ${this.renderCodeSwitch.checked ? 'hljs' : ''}">
                        <div class="code-header">
                            <span class="code-lang">${lang || 'text'}</span>
                            <button class="code-copy">复制</button>
                        </div>
                        <pre><code class="language-${lang || 'text'}">${processedCode}</code></pre>
                    </div>`;
                }
            );

            return html;
        } catch (error) {
            console.error('Markdown渲染错误:', error);
            return text;
        }
    }
    
    async callAI(message) {
        const includeContext = this.includeContextSwitch.checked;
        
        let messages = [
            {
                role: "system",
                content: "你是一个专业的助手。" + 
                         (includeContext ? "请基于提供的PDF文档内容回答问题。" : "请回答用户的问题。")
            }
        ];

        if (includeContext) {
            if (!window.pdfText) {
                throw new Error('请先上传PDF文件');
            }
            messages.push({
                role: "user",
                content: `基于以下文档内容回答问题：\n\n${window.pdfText}\n\n问题：${message}`
            });
        } else {
            messages.push({
                role: "user",
                content: message
            });
        }

        const requestBody = {
            model: "deepseek-chat",
            messages: messages,
            temperature: 0.3,
            max_tokens: 2000
        };

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer inputyourapi'
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API错误 (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            return data.choices[0].message.content;

        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('请求超时，请重试');
            }
            throw error;
        }
    }
}

// 初始化AI服务
const aiService = new AIService(); 
