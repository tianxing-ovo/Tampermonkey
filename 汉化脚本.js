// ==UserScript==
// @name         汉化脚本
// @description  汉化脚本
// @icon         https://images.icon-icons.com/3915/PNG/512/tampermonkey_logo_icon_249448.png
// @version      1.0
// @match        https://aistudio.google.com/*
// @match        https://yupp.ai/*
// @match        https://lmarena.ai/*
// @match        https://plugins.jetbrains.com/*
// @match        https://openrouter.ai/*
// @grant        none
// @run-at       document-idle
// @license      Apache-2.0
// ==/UserScript==

(function () {
    'use strict';

    // 翻译映射表(英文->中文)
    const translations = {
        "Account": "账户",
        "Activity": "活动",
        "Add stop sequence": "添加停止序列",
        "Add stop...": "添加停止序列...",
        "Advanced settings": "高级设置",
        "API Keys": "API 密钥",
        "Ask 800+ AIs anything": "询问800+人工智能任何问题",
        "Attach files": "附加文件",
        "Build": "构建",
        "Build Plugins": "构建插件",
        "Cash Out": "提现",
        "Changelog": "更新日志",
        "Chat": "聊天",
        "Chat Prompt": "聊天提示",
        "Choose models": "选择模型",
        "Clear chat": "清空聊天",
        "Close run settings panel": "关闭运行设置面板",
        "Code execution": "代码执行",
        "Collapse to hide model thoughts": "折叠以隐藏模型想法",
        "Compare": "比较",
        "Compare mode": "比较模式",
        "Compatibility Range": "兼容范围",
        "Credits": "额度",
        "Creativity allowed in the responses": "响应中允许的创造性",
        "Dark": "深色",
        "Dashboard": "信息中心",
        "Default": "默认",
        "Direct Chat": "直接聊天",
        "Disclaimer": "免责声明",
        "Docs": "文档",
        "Documentation": "文档",
        "Enterprise": "企业",
        "Edu Courses": "教育课程",
        "Edit": "编辑",
        "Expand or collapse navigation menu": "展开/折叠导航菜单",
        "Expand to view model thoughts": "展开以查看模型想法",
        "Explain the probability of rolling two dice and getting 7": "解释掷两个骰子得到 7 的概率",
        "Featured Models": "精选模型",
        "Fetch information from web links": "从网页链接中获取信息",
        "Filter models": "过滤模型",
        "Function calling": "函数调用",
        "Generate media": "生成媒体",
        "Generate Media": "生成媒体",
        "Generate structured output": "生成结构化输出",
        "Get": "获取",
        "Get API key": "获取 API 密钥",
        "Get code": "获取代码",
        "Get SDK code to chat with Gemini": "获取与 Gemini 聊天的 SDK 代码",
        "Grounding with Google Search": "基于 Google 搜索",
        "Help": "帮助",
        "Higher resolutions may provide better understanding but use more tokens.": "更高的分辨率可以提供更好的理解，但会消耗更多令牌。",
        "History": "历史记录",
        "Interface For LLMs": "大语言模型接口",
        "Insert assets such as images, videos, files, or audio": "插入图片、视频、文件或音频等资源",
        "Insert assets such as images, videos, folders, files, or audio": "插入图片、视频、文件夹、文件或音频等资源",
        "Interleaved text-and-image generation with the new Gemini 2.0 Flash": "使用新的 Gemini Flash 进行文图交错生成",
        "Keys": "密钥",
        "Leaderboard": "排行榜",
        "Learn more": "了解详情",
        "Let the model decide how many thinking tokens to use or choose your own value": "让模型决定使用多少思考令牌，或选择您自己的值",
        "Lets Gemini use code to solve complex tasks": "让 Gemini 使用代码解决复杂任务",
        "Lets you define functions that Gemini can call": "让您可以定义 Gemini 能够调用的函数",
        "Light": "浅色",
        "Live audio-to-audio dialog": "实时音频对话",
        "Maximum number of tokens in response": "响应中的最大令牌数",
        "Media Resolution": "媒体分辨率",
        "Media resolution": "媒体分辨率",
        "Model": "模型",
        "Models": "模型",
        "Native image generation": "原生图片生成",
        "Native speech generation": "原生语音生成",
        "New Chat": "新聊天",
        "No changes to save": "没有要保存的更改",
        "OK, got it": "好的，知道了",
        "Open navigation menu": "打开导航菜单",
        "Open settings menu": "打开设置菜单",
        "Output length": "输出长度",
        "Overview": "概述",
        "Plugin Ideas": "插件创意",
        "Plugin Versions": "插件版本",
        "Probability threshold for top-p sampling": "Top-P 采样的概率阈值",
        "Profile": "个人资料",
        "Prompt gallery": "提示库",
        "Providers": "提供商",
        "Rankings": "排名",
        "Ratings & Reviews": "评分与评论",
        "Reasoning": "推理",
        "Reply": "回复",
        "Reset Filters": "重置筛选条件",
        "Report Issue": "报告问题",
        "Reset default settings": "重置默认设置",
        "Reviews": "评论",
        "Run": "运行",
        "Run prompt": "运行提示",
        "Run settings": "运行设置",
        "Safety settings": "安全设置",
        "Save prompt": "保存提示",
        "Search": "搜索",
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
        "side-by-side with you": "与你并肩",
        "Sign out": "退出登录",
        "Sort": "排序",
        "Skip to main content": "跳转到主要内容",
        "Start a message...": "开始一条消息...",
        "Start typing a prompt": "开始输入提示词",
        "Stream": "实时对话",
        "Structured output": "结构化输出",
        "Studio": "工作室",
        "System": "系统",
        "System instructions": "系统指令",
        "Temperature": "温度",
        "Theme": "主题",
        "Themes": "主题",
        "The Unified": "统一",
        "Thinking": "思考中",
        "Thinking mode": "思考模式",
        "Thoughts": "思考",
        "Toggle thinking budget between auto and manual": "在自动和手动之间切换思考预算",
        "Toggle thinking mode": "切换思考模式",
        "Token count": "令牌计数",
        "Tools": "工具",
        "Top K": "Top-K",
        "Top P": "Top-P",
        "Truncate response including and after string": "在包含指定字符串后截断响应",
        "Try Gemini's natural, real-time dialog with audio and video inputs": "体验 Gemini 带有音频和视频输入的自然、实时对话",
        "Type something or tab to choose an example prompt": "输入内容，或按 Tab 键选择示例提示",
        "Unable to disable thinking mode for this model.": "无法禁用此模型的思考模式。",
        "Update Date": "更新日期",
        "Upload a file to Google Drive to include in your prompt": "上传文件到 Google Drive 以包含在您的提示中",
        "Upload File": "上传文件",
        "URL context": "网址上下文",
        "URL context tool": "网址上下文工具",
        "Usage & Billing": "用量和结算",
        "Use Google Search": "使用 Google 搜索",
        "User": "用户",
        "Version": "版本",
        "Versions": "版本",
        "View all": "查看全部",
        "View Trending": "查看趋势",
        "View more actions": "查看更多操作",
        "Welcome to AI Studio": "欢迎使用 AI Studio",
        "What's new": "新增功能",
        "World's smartest AIs,": "世界最聪明的人工智能,",
        "Write Review": "写评论",
        "You need to create and run a prompt in order to share it": "您需要创建并运行一个提示才能分享它",
        "(experimental)": "(实验的)"
    };

    /**
     * 翻译单个节点的文本或属性
     * @param node 要翻译的节点
     */
    function translateNode(node) {
        // 翻译元素节点的属性
        if (node.nodeType === Node.ELEMENT_NODE) {
            const attributes = ['aria-label', 'placeholder', 'mattooltip', 'title'];
            for (const attr of attributes) {
                const value = node.getAttribute(attr);
                if (value && translations[value]) {
                    node.setAttribute(attr, translations[value]);
                }
            }
        }
        // 翻译文本节点
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.nodeValue.trim();
            if (text && translations[text]) {
                // 使用replace保留原始文本周围的空白字符
                node.nodeValue = node.nodeValue.replace(text, translations[text]);
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
        }
    }

    // 使用MutationObserver来处理动态加载的内容
    const observer = new MutationObserver(async (mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                // 当新节点被添加到DOM时对其进行翻译
                walkAndTranslate(node);
            }
        }
    });

    // 首次加载时完整翻译一次body
    walkAndTranslate(document.body);

    // 开始监听body内的DOM变化
    observer.observe(document.body, {
        childList: true, subtree: true, characterData: true
    });
})();