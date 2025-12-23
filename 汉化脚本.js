// ==UserScript==
// @name         汉化脚本
// @description  自动翻译网页中的英文内容为中文
// @icon         https://images.icon-icons.com/3915/PNG/512/tampermonkey_logo_icon_249448.png
// @version      1.1
// @author       tianxing
// @match        https://aistudio.google.com/*
// @match        https://yupp.ai/*
// @match        https://lmarena.ai/*
// @match        https://plugins.jetbrains.com/*
// @match        https://openrouter.ai/*
// @match        https://stackoverflow.com/*
// @match        https://huggingface.co/*
// @match        https://github.com/*
// @grant        none
// @run-at       document-start
// @license      Apache-2.0
// @namespace    https://greasyfork.org/users/1203191
// ==/UserScript==
// noinspection JSNonASCIINames

(function () {
    'use strict';

    // 添加CSS隐藏页面内容防止闪烁
    const style = document.createElement('style');
    style.textContent = `
        html.translating {
            visibility: hidden !important;
        }
    `;
    document.documentElement.appendChild(style);

    // 立即添加class隐藏页面
    document.documentElement.classList.add('translating');

    // 翻译映射表(英文->中文)
    const translations = {
        "AI Assist": "AI 助手",
        "Accessibility": "无障碍",
        "Account": "账户",
        "Actions": "操作",
        "Activity": "活动",
        "Audio": "音频",
        "Add file": "添加文件",
        "Add stop sequence": "添加停止序列",
        "Add stop...": "添加停止序列...",
        "Advanced settings": "高级设置",
        "All actions": "所有操作",
        "Announcements": "公告",
        "Answering": "回答",
        "Answers": "回答",
        "API Keys": "API 密钥",
        "Appearance": "外观",
        "Articles": "文章",
        "Ask 800+ AIs anything": "询问800+人工智能任何问题",
        "Assets": "资源",
        "Ask followup…": "进行后续询问...",
        "Ask Question": "提问",
        "Asking": "提问",
        "Attach files": "附加文件",
        "About": "关于",
        "Autobiographer": "自传作者",
        "Badge progress": "徽章进度",
        "Based on your viewing history and watched tags.": "基于您的浏览历史和关注的标签",
        "Badges": "徽章",
        "Bounties": "悬赏",
        "Branch": "分支",
        "Broadcast": "广播",
        "Build": "构建",
        "Build Plugins": "构建插件",
        "Business": "商业",
        "BUSINESS": "商业",
        "Cash Out": "提现",
        "Careers": "招聘",
        "Categories": "分类",
        "Challenges": "挑战",
        "Changelog": "更新日志",
        "Chat": "聊天",
        "Chat with Copilot": "与 Copilot 聊天",
        "Chat Prompt": "聊天提示",
        "Choose models": "选择模型",
        "Clear chat": "清空聊天",
        "Close run settings panel": "关闭运行设置面板",
        "Code": "代码",
        "Code execution": "代码执行",
        "Commits": "提交",
        "Community": "社区",
        "Companies": "公司",
        "Company": "公司",
        "Compare": "比较",
        "Compare LLMs based on their ability to generate images that match text descriptions": "比较大语言模型生成符合文本描述的图像的能力",
        "Contact": "联系",
        "Contact Us": "联系我们",
        "Cookie Policy": "Cookie 政策",
        "Cookie Settings": "Cookie 设置",
        "Culture & recreation": "文化与娱乐",
        "Compare mode": "比较模式",
        "Compatibility Range": "兼容范围",
        "Compatibility:": "兼容性:",
        "Complete \"About Me\" section of user profile.": "完成用户资料中的“关于我”部分",
        "Context length": "上下文长度",
        "Copilot": "副驾驶",
        "Copilot settings": "Copilot 设置",
        "Copy code": "复制代码",
        "Collapse to hide model thoughts": "折叠以隐藏模型想法",
        "Create a new release": "创建新版本",
        "Create new file": "创建新文件",
        "Credits": "额度",
        "Creativity allowed in the responses": "响应中允许的创造性",
        "Customize your content by watching tags.": "通过关注标签来定制您的内容",
        "Customize your feed": "自定义您的订阅内容",
        "Customize your pins": "自定义固定项目",
        "Dark": "深色",
        "Dashboard": "信息中心",
        "Data": "数据",
        "Datasets": "数据集",
        "Default": "默认",
        "Deploy": "部署",
        "Deployments": "部署",
        "Disclaimer": "免责声明",
        "Discussions": "讨论",
        "Distillable": "可蒸馏",
        "Do not share my personal information": "不要分享我的个人信息",
        "Docs": "文档",
        "Documentation": "文档",
        "Draft a new release": "草拟新版本",
        "Earn reputation by": "通过以下方式获得声望：",
        "Edit": "编辑",
        "Editing": "编辑",
        "Edit profile": "编辑个人资料",
        "Edit model card": "编辑模型卡片",
        "Edu Courses": "教育课程",
        "Embeddings": "嵌入",
        "Enterprise": "企业",
        "Enterprises": "企业",
        "Expand or collapse navigation menu": "展开/折叠导航菜单",
        "Expand to view model thoughts": "展开以查看模型想法",
        "Explain the probability of rolling two dice and getting 7": "解释掷两个骰子得到 7 的概率",
        "Feature preview": "功能预览",
        "Featured Models": "精选模型",
        "Fetch information from web links": "从网页链接中获取信息",
        "File": "文件",
        "Files and versions": "文件和版本",
        "Filter models": "过滤模型",
        "Filter by name": "按名称筛选",
        "Find a release": "查找版本",
        "Find answers to your technical questions and help others answer theirs.": "查找您的技术问题答案并帮助其他用户回答他们的问题",
        "Find a repository…": "查找仓库...",
        "Following": "关注",
        "Fork": "复刻",
        "forks": "复刻",
        "Function calling": "函数调用",
        "Full Changelog": "完整更新日志",
        "Ignored tags": "忽略的标签",
        "Generate media": "生成媒体",
        "Generate Media": "生成媒体",
        "Generate structured output": "生成结构化输出",
        "Get": "获取",
        "Google AI models may make mistakes, so double-check outputs.": "Google AI 模型可能会出错，请仔细核对输出结果",
        "Get API key": "获取 API 密钥",
        "Get code": "获取代码",
        "Get SDK code to chat with Gemini": "获取与 Gemini 聊天的 SDK 代码",
        "Gists": "代码片段",
        "Give feedback": "反馈",
        "Go to file": "转到文件",
        "Grounding with Google Search": "基于 Google 搜索",
        "Help": "帮助",
        "Higher resolutions may provide better understanding but use more tokens.": "更高的分辨率可以提供更好的理解，但会消耗更多令牌",
        "History": "历史记录",
        "Home": "首页",
        "Image": "图片",
        "Image Edit": "图片编辑",
        "Image Edit Arena": "图片编辑竞技场",
        "Compare models based on their ability to generate and edit images": "比较模型生成和编辑图片的能力",
        "Image-to-Video": "图生视频",
        "Image-to-Video Arena": "图生视频竞技场",
        "Input Modalities": "输入模态",
        "Insert assets such as images, videos, files, or audio": "插入图片、视频、文件或音频等资源",
        "Insert assets such as images, videos, folders, files, or audio": "插入图片、视频、文件夹、文件或音频等资源",
        "Insights": "洞察",
        "Integrations (BYOK)": "集成 (BYOK)",
        "Interesting posts for you": "为你推荐的有趣帖子",
        "Interface For LLMs": "大语言模型接口",
        "Interleaved text-and-image generation with the new Gemini 2.0 Flash": "使用新的 Gemini Flash 进行文图交错生成",
        "Issues": "议题",
        "Join discussion": "加入讨论",
        "Jump to": "跳转到",
        "Keys": "密钥",
        "Labs": "实验室",
        "Language": "语言",
        "Languages": "语言",
        "Latest": "最新",
        "Last Updated": "最后更新",
        "Leaderboard": "排行榜",
        "Leaderboard Overview": "排行榜概览",
        "Learn more": "了解详情",
        "Let the model decide how many thinking tokens to use or choose your own value": "让模型决定使用多少思考令牌，或选择您自己的值",
        "Lets Gemini use code to solve complex tasks": "让 Gemini 使用代码解决复杂任务",
        "Lets you define functions that Gemini can call": "让您可以定义 Gemini 能够调用的函数",
        "Legal": "法律",
        "License": "许可证",
        "Libraries": "库",
        "Licenses": "许可证",
        "Life & arts": "生活与艺术",
        "Light": "浅色",
        "Live audio-to-audio dialog": "实时音频对话",
        "Log out": "退出登录",
        "Main": "主页",
        "Manage cookies": "管理 Cookie",
        "Maximum number of tokens in response": "响应中的最大令牌数",
        "Media Resolution": "媒体分辨率",
        "Media resolution": "媒体分辨率",
        "Model": "模型",
        "Model Authors": "模型作者",
        "Model card": "模型卡片",
        "Models": "模型",
        "Native image generation": "原生图片生成",
        "Native speech generation": "原生语音生成",
        "New": "新",
        "New Chat": "新聊天",
        "No releases published": "未发布版本",
        "No packages published": "未发布包",
        "No changes to save": "没有要保存的更改",
        "No API Key": "无 API 密钥",
        "OK, got it": "好的，知道了",
        "Older": "更早",
        "Optional tone and style instructions for the model": "模型的可选语气和风格指令",
        "Open navigation menu": "打开导航菜单",
        "Open settings menu": "打开设置菜单",
        "Organization": "组织",
        "Output length": "输出长度",
        "Output Modalities": "输出模态",
        "Organization Members": "组织成员",
        "Our most intelligent model with SOTA reasoning and multimodal understanding, and powerful agentic and vibe coding capabilities": "我们最智能的模型，具有最先进的推理和多模态理解能力，以及强大的智能体和氛围编码能力",
        "Organizations": "组织",
        "Overview": "概览",
        "Other": "其他",
        "Packages": "包",
        "Partners": "合作伙伴",
        "Pin": "固定",
        "Plugin Ideas": "插件创意",
        "Plugin Versions": "插件版本",
        "Playground": "演练场",
        "Popular repositories": "热门仓库",
        "Powered by Code Arena": "由代码竞技场驱动",
        "Presets": "预设",
        "Press": "新闻",
        "Pricing": "定价",
        "Privacy": "隐私",
        "Privacy Policy": "隐私政策",
        "Provisioning Keys": "配置密钥",
        "Probability threshold for top-p sampling": "Top-P 采样的概率阈值",
        "Products": "产品",
        "Professional": "专业",
        "Profile": "个人资料",
        "Public": "公共",
        "Publish your first package": "发布你的第一个包",
        "Projects": "项目",
        "Prompt gallery": "提示库",
        "Prompt pricing": "提示词定价",
        "Providers": "提供商",
        "Pull requests": "拉取请求",
        "Questions": "问答",
        "Rank": "排名",
        "Rank Spread": "排名分布",
        "(Upper-Lower)": "(上限-下限)",
        "Rankings": "排名",
        "Ratings & Reviews": "评分与评论",
        "Reasoning": "推理",
        "Reply": "回复",
        "Releases": "版本",
        "Report Issue": "报告问题",
        "Repositories": "仓库",
        "repo:": "仓库:",
        "Reputation": "声望",
        "Responses": "回复",
        "Reset default settings": "重置默认设置",
        "Reset Filters": "重置筛选条件",
        "Reviews": "评论",
        "Run": "运行",
        "Run prompt": "运行提示",
        "Run settings": "运行设置",
        "Safety settings": "安全设置",
        "Save prompt": "保存提示",
        "Saves": "收藏",
        "Science": "科学",
        "Score": "分数",
        "Search": "搜索",
        "Search…": "搜索",
        "Search Arena": "搜索竞技场",
        "Search in this owner": "在此所有者中搜索",
        "Search in this repository": "在此仓库中搜索",
        "Search by model name...": "按模型名称搜索...",
        "Search models, datasets, users...": "搜索模型、数据集、用户...",
        "Search syntax tips": "搜索语法提示",
        "Security": "安全",
        "Select a model": "选择一个模型",
        "Select or upload a file on Google Drive to include in your prompt": "在 Google Drive 上选择或上传文件以包含在您的提示中",
        "Send message": "发送消息",
        "Set thinking budget": "设置思考预算",
        "Settings": "设置",
        "Share": "分享",
        "Share prompt": "分享提示",
        "Show More": "显示更多",
        "Show more": "显示更多",
        "Show more responses": "显示更多回复",
        "Show run settings": "显示运行设置",
        "Source code": "源代码",
        "side-by-side with you": "与你并肩",
        "Sign out": "退出登录",
        "Skip to main content": "跳转到主要内容",
        "Sort": "排序",
        "Spaces": "空间",
        "Sponsors": "赞助",
        "Start a message...": "开始一条消息...",
        "Start a new Copilot thread": "开始新的 Copilot 会话",
        "Start typing a prompt": "开始输入提示词",
        "Start Voting": "开始投票",
        "Stack Ads": "Stack 广告",
        "Stack Data Licensing": "Stack 数据许可",
        "Stack Exchange Network": "Stack 交换网络",
        "Stack Internal": "Stack 内部",
        "Star": "星标",
        "Starred": "已星标",
        "Stars": "星标",
        "Series": "系列",
        "Stream": "实时对话",
        "Style Control": "风格控制",
        "Structured output": "结构化输出",
        "Structured outputs": "结构化输出",
        "Status": "状态",
        "Studio": "工作室",
        "Summary": "概要",
        "Support": "支持",
        "Switch to a paid API key to unlock higher quota and more features.": "切换到付费 API 密钥以解锁更高配额和更多功能",
        "Source:": "来源：",
        "Supported Parameters": "支持的参数",
        "System": "系统",
        "System instructions": "系统指令",
        "Tags": "标签",
        "Tasks": "任务",
        "Technology": "技术",
        "Temperature": "温度",
        "Terms": "条款",
        "Terms of Use": "使用条款",
        "Terms of Service": "服务条款",
        "Text": "文本",
        "Text Arena": "文本竞技场",
        "Text-to-Image": "文生图",
        "Text-to-Image Arena": "文生图竞技场",
        "Text-to-Video": "文生视频",
        "Text-to-Video Arena": "文生视频竞技场",
        "The Unified": "统一",
        "Theme": "主题",
        "Themes": "主题",
        "Thinking": "思考中",
        "Thinking mode": "思考模式",
        "Thinking level": "思考级别",
        "Thoughts": "思考",
        "to search": " 搜索",
        "Today": "今天",
        "Training, Logging, & Privacy": "训练、日志与隐私",
        "Toggle thinking budget between auto and manual": "在自动和手动之间切换思考预算",
        "Toggle thinking mode": "切换思考模式",
        "Token count": "令牌计数",
        "Tools": "工具",
        "Total Models": "模型总数",
        "Total Votes": "投票总数",
        "Top K": "Top-K",
        "Top P": "Top-P",
        "Truncate response including and after string": "在包含指定字符串后截断响应",
        "Try Enterprise": "试用企业版",
        "Try Gemini's natural, real-time dialog with audio and video inputs": "体验 Gemini 带有音频和视频输入的自然、实时对话",
        "Type": "输入 ",
        "Type something or tab to choose an example prompt": "输入内容，或按 Tab 键选择示例提示",
        "Unable to disable thinking mode for this model.": "无法禁用此模型的思考模式。",
        "Update Date": "更新日期",
        "Upload a file to Google Drive to include in your prompt": "上传文件到 Google Drive 以包含在您的提示中",
        "Upload File": "上传文件",
        "Upload files": "上传文件",
        "Upload Image": "上传图片",
        "Video": "视频",
        "View rankings across various LLMs on their versatility, linguistic precision, and cultural context across text": "查看各种大语言模型在多功能性、语言精确度和文化语境方面的排名",
        "URL context": "网址上下文",
        "URL context tool": "网址上下文工具",
        "Usage & Billing": "用量和结算",
        "Use Google Search": "使用 Google 搜索",
        "Use this model": "使用此模型",
        "User": "用户",
        "user:": "用户:",
        "Users": "用户",
        "Version": "版本",
        "Versions": "版本",
        "View": "查看",
        "View all": "查看全部",
        "View rankings across multimodal, generative AI models capable of understanding and processing visual inputs": "查看能够理解和处理视觉输入的多模态生成式人工智能模型的排名",
        "View more actions": "查看更多操作",
        "View status": "查看状态",
        "View Trending": "查看趋势",
        "Vision": "视觉",
        "Vision Arena": "视觉竞技场",
        "Visit Arena": "访问竞技场",
        "Votes": "投票数",
        "Watch": "关注",
        "watching": "关注",
        "Watched tags": "关注的标签",
        "WebDev": "网页开发",
        "You reacted": "你的回应",
        "WebDev Leaderboard": "网页开发排行榜",
        "Welcome back": "欢迎回来",
        "Welcome to AI Studio": "欢迎使用 AI Studio",
        "Work Here": "在此工作",
        "Working from home": "居家办公",
        "What's new": "新增功能",
        "Wiki": "维基",
        "World's smartest AIs,": "世界最聪明的人工智能,",
        "Write Review": "写评论",
        "Your": "你的",
        "You need to create and run a prompt in order to share it": "您需要创建并运行一个提示才能分享它",
        "(experimental)": "(实验的)"
    };

    // 小写翻译映射表(英文->中文)
    const lowerCaseTranslations = {};
    for (const key in translations) {
        lowerCaseTranslations[key.toLowerCase()] = translations[key];
    }

    /**
     * 检查元素是否应该跳过翻译
     * @param element 要检查的元素
     */
    function shouldSkipElement(element) {
        if (!element) {
            return false;
        }
        // GitHub不跳过aria-hidden=true的元素
        if (location.hostname.includes('github.com')) {
            return false;
        }
        // 跳过aria-hidden=true的元素
        return element.getAttribute('aria-hidden') === 'true';
    }

    /**
     * 翻译相对时间字符串(例如: "2 months ago")
     * @param text 要翻译的文本
     */
    function translateRelativeTime(text) {
        const timeRegex = /^(\d+)\s+(year|month|week|day|hour|minute|second)s?\s+ago$/i;
        const match = text.match(timeRegex);
        if (match) {
            // 提取数字部分
            const num = match[1];
            // 提取单位部分并转换为小写
            const unit = match[2].toLowerCase();
            const unitMap = {
                'year': '年',
                'month': '个月',
                'week': '周',
                'day': '天',
                'hour': '小时',
                'minute': '分钟',
                'second': '秒'
            };
            return `${num} ${unitMap[unit]}前`;
        }
        return null;
    }

    /**
     * 翻译统计信息(例如: "5 stars")
     * 支持包含数字和空格的模式
     * @param text 要翻译的文本
     */
    function translateStat(text) {
        // 模式: 可选空白 + 可选(+) + 可选数字 + 可选空白 + 单词(必须在翻译表中) + 可选空白
        const statRegex = /^(\s*)(\+\s*)?(\d+(?:\.\d+)?[km]?\+?)?(\s*)([a-zA-Z]+)(\s*)$/i;
        const match = text.match(statRegex);
        if (match) {
            const prefixSpace = match[1];
            const plusPart = match[2] || '';
            const number = match[3] || '';
            const middleSpace = match[4];
            const word = match[5];
            const suffixSpace = match[6];
            // 尝试查找单词的翻译
            const lowerWord = word.toLowerCase();
            if (lowerCaseTranslations[lowerWord]) {
                const translatedWord = lowerCaseTranslations[lowerWord];
                return `${prefixSpace}${plusPart}${number}${middleSpace}${translatedWord}${suffixSpace}`;
            }
        }
        return null;
    }

    /**
     * 翻译单个节点的文本或属性
     * @param node 要翻译的节点
     */
    function translateNode(node) {
        // 翻译元素节点的属性
        if (node.nodeType === Node.ELEMENT_NODE) {
            // 检查元素是否应该跳过翻译
            if (shouldSkipElement(node)) {
                return;
            }
            const attributes = ['aria-label', 'placeholder', 'mattooltip', 'title'];
            for (const attr of attributes) {
                const value = node.getAttribute(attr);
                if (value) {
                    // 检查是否直接在翻译表中
                    if (lowerCaseTranslations[value.toLowerCase()]) {
                        node.setAttribute(attr, lowerCaseTranslations[value.toLowerCase()]);
                    } else {
                        // 尝试翻译相对时间
                        const translatedTime = translateRelativeTime(value);
                        if (translatedTime) {
                            node.setAttribute(attr, translatedTime);
                        } else {
                            // 尝试翻译统计信息
                            const translatedStat = translateStat(value);
                            if (translatedStat) {
                                node.setAttribute(attr, translatedStat);
                            }
                        }
                    }
                }
            }
        }
        // 翻译文本节点
        if (node.nodeType === Node.TEXT_NODE) {
            // 检查父元素是否应该跳过翻译
            if (shouldSkipElement(node.parentElement)) {
                return;
            }
            const text = node.nodeValue;
            const trimmedText = text.trim();
            if (trimmedText) {
                // 检查是否直接在翻译表中
                if (lowerCaseTranslations[trimmedText.toLowerCase()]) {
                    if (trimmedText.includes(' ')) {
                        node.nodeValue = lowerCaseTranslations[trimmedText.toLowerCase()];
                    } else {
                        // 尝试翻译统计信息
                        const translatedStat = translateStat(text);
                        if (translatedStat) {
                            node.nodeValue = translatedStat;
                        }
                    }
                } else {
                    // 尝试翻译相对时间
                    const translatedTime = translateRelativeTime(text);
                    if (translatedTime) {
                        node.nodeValue = translatedTime;
                    } else {
                        // 尝试翻译统计信息
                        const translatedStat = translateStat(text);
                        if (translatedStat) {
                            node.nodeValue = translatedStat;
                        }
                    }
                }
            }
        }
    }


    /**
     * 遍历指定根节点下的所有节点并应用翻译
     * @param rootNode 开始遍历的根节点
     */
    function walkAndTranslate(rootNode) {
        if (!rootNode) {
            return;
        }
        // 使用TreeWalker高效遍历所有可见元素和文本节点
        const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
        let node;
        while (node = walker.nextNode()) {
            translateNode(node);
            // 检查Shadow Root
            if (node.nodeType === Node.ELEMENT_NODE && node.shadowRoot) {
                handleShadowRoot(node.shadowRoot);
            }
        }
    }

    // 记录已观察的Shadow Root(防止重复监听)
    const observedRoots = new WeakSet();

    /**
     * 处理Shadow Root
     * @param root Shadow Root节点
     */
    function handleShadowRoot(root) {
        if (!root || observedRoots.has(root)) {
            return;
        }
        observedRoots.add(root);
        observer.observe(root, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['placeholder', 'aria-label', 'title', 'mattooltip']
        });
        walkAndTranslate(root);
    }

    // 使用MutationObserver来处理动态加载的内容
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            // 处理属性变化
            if (mutation.type === 'attributes') {
                translateNode(mutation.target);
                if (mutation.target.shadowRoot) {
                    handleShadowRoot(mutation.target.shadowRoot);
                }
            }
            // 处理文本内容变化
            if (mutation.type === 'characterData') {
                translateNode(mutation.target);
            }
            // 处理新增节点
            for (const node of mutation.addedNodes) {
                // 只翻译新添加的节点(不递归遍历)
                if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
                    translateNode(node);
                    // 如果是元素节点(遍历其子节点)
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        walkAndTranslate(node);
                        // 处理Shadow Root
                        if (node.shadowRoot) {
                            handleShadowRoot(node.shadowRoot);
                        }
                    }
                }
            }
        }
    });

    /**
     * 初始化翻译功能
     */
    function initTranslation() {
        // 立即开始监听DOM变化
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['placeholder', 'aria-label', 'title', 'mattooltip']
        });

        // 第一次翻译
        walkAndTranslate(document.body);

        // 延迟翻译(处理SPA框架动态渲染的内容)
        setTimeout(() => {
            walkAndTranslate(document.body);
            // 翻译完成后显示页面
            document.documentElement.classList.remove('translating');
        }, 300);

        // 再次延迟翻译(处理更慢加载的内容)
        setTimeout(() => walkAndTranslate(document.body), 1000);
    }

    // 尽早执行翻译(不等待DOMContentLoaded)
    if (document.body) {
        // body已存在(立即执行)
        initTranslation();
    } else {
        // body还未创建(等待其创建)
        const bodyObserver = new MutationObserver(() => {
            if (document.body) {
                bodyObserver.disconnect();
                initTranslation();
            }
        });
        bodyObserver.observe(document.documentElement, {childList: true});
    }
})();