// ==UserScript==
// @name         汉化脚本
// @description  自动翻译网页中的英文内容为中文
// @icon         https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/translate-icon.png?v=1
// @version      1.3
// @author       tianxing
// @match        https://aistudio.google.com/*
// @match        https://yupp.ai/*
// @match        https://arena.ai/*
// @match        https://plugins.jetbrains.com/*
// @match        https://openrouter.ai/*
// @match        https://stackoverflow.com/*
// @match        https://huggingface.co/*
// @match        https://github.com/*
// @grant        none
// @run-at       document-start
// @license      Apache-2.0
// @namespace    https://greasyfork.org/users/1203191
// @homepageURL  https://github.com/tianxing-ovo/Tampermonkey
// @supportURL   https://github.com/tianxing-ovo/Tampermonkey/issues
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
        "About": "关于",
        "About Us": "关于我们",
        "Access": "访问",
        "Accessibility": "无障碍",
        "Account": "账户",
        "Actions": "操作",
        "Activity": "活动",
        "Add a comment": "添加评论",
        "Add custom instructions for your project to control style, models used, add specific knowledge, and more.": "添加自定义指令来控制项目风格、使用的模型、添加特定知识等",
        "Add existing issue": "添加现有议题",
        "Add file": "添加文件",
        "Add stop sequence": "添加停止序列",
        "Add stop...": "添加停止序列...",
        "Advanced": "高级",
        "Advanced search": "高级搜索",
        "Advanced Security": "高级安全",
        "Advanced settings": "高级设置",
        "AI Assist": "AI 助手",
        "All": "全部",
        "All actions": "所有操作",
        "All Activity": "所有动态",
        "Always show regardless of probability of being harmful": "无论有害概率如何始终显示",
        "Announcements": "公告",
        "Answer took too long": "回答时间太长",
        "Answering": "回答",
        "Answers": "回答",
        "API Keys": "API 密钥",
        "Appearance": "外观",
        "Applications": "应用程序",
        "Apps": "应用",
        "Archived": "已归档",
        "Archives": "归档",
        "Arena Overview": "竞技场概览",
        "Articles": "文章",
        "Ask 800+ AIs anything": "询问800+人工智能任何问题",
        "Ask followup…": "进行后续询问...",
        "Ask Question": "提问",
        "Asking": "提问",
        "Assets": "资源",
        "Assignees": "负责人",
        "Assistive": "辅助",
        "Attach binaries by dropping them here or selecting them.": "通过拖放或选择文件来附加二进制文件",
        "Attach files": "附加文件",
        "Audio": "音频",
        "Author": "作者",
        "Autobiographer": "自传作者",
        "Back to start": "返回开始",
        "Badge progress": "徽章进度",
        "Badges": "徽章",
        "Based on your viewing history and watched tags.": "基于您的浏览历史和关注的标签",
        "Best match": "最佳匹配",
        "Billing and licensing": "账单和许可",
        "Bio": "个人简介",
        "Block none": "不拦截",
        "Blocked users": "已屏蔽用户",
        "Bounties": "悬赏",
        "Branch": "分支",
        "Branch from here": "从此处分支",
        "Branches": "分支",
        "Broadcast": "广播",
        "Browse the url context": "浏览网址上下文",
        "Build": "构建",
        "Build Plugins": "构建插件",
        "Build your ideas with Gemini": "使用 Gemini 构建您的创意",
        "BUSINESS": "商业",
        "Business": "商业",
        "By API Key": "按 API 密钥",
        "By Model": "按模型",
        "Camera": "相机",
        "Can be sponsored": "可接受赞助",
        "Cancel": "取消",
        "Cancel changes": "取消更改",
        "Careers": "招聘",
        "Cash Out": "提现",
        "Categories": "分类",
        "Challenges": "挑战",
        "Changelog": "更新日志",
        "Chat": "聊天",
        "Chat messages": "聊天消息",
        "Chat Prompt": "聊天提示",
        "Chat with Copilot": "与 Copilot 聊天",
        "Checkpoint": "检查点",
        "Choose an existing tag, or create a new tag when you publish this release.": "选择现有标签，或在发布此版本时创建新标签",
        "Choose models": "选择模型",
        "Clear chat": "清空聊天",
        "Clear filter": "清除筛选",
        "Close as completed": "完成并关闭",
        "Close as duplicate": "作为重复项关闭",
        "Close as not planned": "不予处理并关闭",
        "Close issue": "关闭议题",
        "Close run settings panel": "关闭运行设置面板",
        "Closed": "已关闭",
        "Code": "代码",
        "Code and automation": "代码和自动化",
        "Code completions": "代码补全",
        "Code execution": "代码执行",
        "Code review limits": "代码审查限制",
        "Code security": "代码安全",
        "Code with agent mode": "使用代理模式编码",
        "Codespaces": "代码空间",
        "Collaborators": "协作者",
        "Collapse to hide model thoughts": "折叠以隐藏模型想法",
        "Comment": "评论",
        "Commit changes...": "提交更改",
        "Commits": "提交",
        "Community": "社区",
        "Compact View": "紧凑视图",
        "Companies": "公司",
        "Company": "公司",
        "Compare": "比较",
        "Compare LLMs based on their ability to generate images that match text descriptions": "比较大语言模型生成符合文本描述的图像的能力",
        "Compare mode": "比较模式",
        "Compare models based on their ability to generate and edit images": "比较模型生成和编辑图片的能力",
        "Compatibility Range": "兼容范围",
        "Compatibility:": "兼容性:",
        "Complete \"About Me\" section of user profile.": "完成用户资料中的“关于我”部分",
        "Confirm": "确认",
        "Contact": "联系",
        "Contact Us": "联系我们",
        "Context length": "上下文长度",
        "Contribution activity": "贡献活动",
        "Convert to discussion": "转换为讨论",
        "Cookie Policy": "Cookie 政策",
        "Cookie Settings": "Cookie 设置",
        "Copilot": "副驾驶",
        "Copilot settings": "Copilot 设置",
        "Copy": "复制",
        "Copy as markdown": "复制为 Markdown",
        "Copy as text": "复制为文本",
        "Copy code": "复制代码",
        "Create": "创建",
        "Create a discussion for this release": "为此版本创建讨论",
        "Create a new release": "创建新版本",
        "Create list": "创建列表",
        "Create new file": "创建新文件",
        "Create new tag": "创建新标签",
        "Create new...": "新建",
        "Create new…": "新建",
        "Create sub-issue": "创建子议题",
        "Creativity allowed in the responses": "响应中允许的创造性",
        "Credits": "额度",
        "Culture & recreation": "文化与娱乐",
        "Custom": "自定义",
        "Customize": "自定义",
        "Customize your content by watching tags.": "通过关注标签来定制您的内容",
        "Customize your feed": "自定义您的订阅内容",
        "Customize your pins": "自定义固定项目",
        "Dangerous Content": "危险内容",
        "Dark": "深色",
        "Dashboard": "信息中心",
        "Data": "数据",
        "Datasets": "数据集",
        "Date created": "创建日期",
        "Date pushed": "推送日期",
        "Day": "天",
        "Default": "默认",
        "Default branch": "默认分支",
        "Delete": "删除",
        "Delete issue": "删除议题",
        "Deploy": "部署",
        "Deploy keys": "部署密钥",
        "Deployments": "部署",
        "Describe this release": "描述此版本",
        "Describe your idea": "描述您的想法",
        "Description": "描述",
        "Developer settings": "开发者设置",
        "Development": "开发",
        "Disabled": "已禁用",
        "Disallow assets and tags from being modified once a release is published.": "禁止在发布版本后修改资源和标签",
        "Discard": "放弃",
        "Disclaimer": "免责声明",
        "Discussions": "讨论",
        "Distillable": "可蒸馏",
        "Do not run safety filters": "不要运行安全筛选器",
        "Do not share my personal information": "不要分享我的个人信息",
        "Docs": "文档",
        "Documentation": "文档",
        "Done, closed, fixed, resolved": "完成、关闭、修复、解决",
        "Download for": "下载",
        "Download template": "下载模板",
        "Download ZIP": "下载 ZIP",
        "Draft a new release": "草拟新版本",
        "Draft with Copilot": "使用 Copilot 起草",
        "Drive": "云端硬盘",
        "Duplicate issue": "复制议题",
        "Duplicate of another issue": "另一个议题的重复项",
        "Earn reputation by": "通过以下方式获得声望：",
        "Edit": "编辑",
        "Edit list": "编辑列表",
        "Edit model card": "编辑模型卡片",
        "Edit profile": "编辑个人资料",
        "Edit repository details": "编辑仓库详情",
        "Edited": "已编辑",
        "Editing": "编辑",
        "Edu Courses": "教育课程",
        "Email notifications": "邮件通知",
        "Emails": "电子邮件",
        "Embeddings": "嵌入",
        "Enable release immutability": "启用版本不可变性",
        "Enabled": "已启用",
        "Enter a valid URL": "输入有效的网址",
        "Enterprise": "企业",
        "Enterprises": "企业",
        "Environments": "环境",
        "Exclude archived": "排除归档",
        "Expand or collapse navigation menu": "展开/折叠导航菜单",
        "Expand to view model thoughts": "展开以查看模型想法",
        "Explain the probability of rolling two dice and getting 7": "解释掷两个骰子得到 7 的概率",
        "Explore": "探索",
        "Export": "导出",
        "FAQ": "常见问题",
        "Feature preview": "功能预览",
        "Featured": "精选",
        "Featured Models": "精选模型",
        "Features": "功能",
        "Feed": "动态",
        "Fetch information from web links": "从网页链接中获取信息",
        "Fewest downloads": "最少下载",
        "Fewest forks": "最少复刻",
        "Fewest stars": "最少星标",
        "File": "文件",
        "Files": "文件",
        "Files and versions": "文件和版本",
        "Filter branches…": "筛选分支",
        "Filter by": "筛选条件",
        "Filter by name": "按名称筛选",
        "Filter models": "过滤模型",
        "Filter recent commits…": "筛选最近提交",
        "Filters": "筛选",
        "Find a release": "查找版本",
        "Find a repository…": "查找仓库...",
        "Find answers to your technical questions and help others answer theirs.": "查找您的技术问题答案并帮助其他用户回答他们的问题",
        "First Place": "第一名",
        "follower": "关注者",
        "Following": "关注",
        "Fork": "复刻",
        "forks": "复刻",
        "Framework": "框架",
        "Free": "免费",
        "Free requests": "免费请求",
        "Full Changelog": "完整更新日志",
        "Function calling": "函数调用",
        "Future ideas": "未来的想法",
        "Gallery": "画廊",
        "General": "常规",
        "Generate Media": "生成媒体",
        "Generate media": "生成媒体",
        "Generate release notes": "生成发布说明",
        "Generate structured output": "生成结构化输出",
        "Get": "获取",
        "Get API key": "获取 API 密钥",
        "Get code": "获取代码",
        "Get SDK code to chat with Gemini": "获取与 Gemini 聊天的 SDK 代码",
        "Gists": "代码片段",
        "GitHub Apps": "GitHub 应用",
        "Give feedback": "反馈",
        "Go to file": "转到文件",
        "Go to your personal profile": "前往个人资料",
        "Google AI models may make mistakes, so double-check outputs.": "Google AI 模型可能会出错，请仔细核对输出结果",
        "Grounding with Google Search": "基于 Google 搜索",
        "Harassment": "骚扰",
        "Harmful or offensive": "有害或冒犯",
        "Hate": "仇恨",
        "Help": "帮助",
        "Help Center": "帮助中心",
        "Higher resolutions may provide better understanding but use more tokens.": "更高的分辨率可以提供更好的理解，但会消耗更多令牌",
        "History": "历史记录",
        "Home": "首页",
        "Hour": "小时",
        "How it Works": "工作原理",
        "Ideas": "创意",
        "Ignore": "忽略",
        "Ignored tags": "忽略的标签",
        "Image": "图片",
        "Image Edit": "图片编辑",
        "Image Edit Arena": "图片编辑竞技场",
        "Image-to-Video": "图生视频",
        "Image-to-Video Arena": "图生视频竞技场",
        "Images": "图片",
        "Images should be at least 640×320px (1280×640px for best display).": "图片尺寸应至少为 640×320px（1280×640px 显示效果最佳）",
        "Import repository": "导入仓库",
        "Include in the home page": "包含在主页中",
        "Input Modalities": "输入模态",
        "Insert assets such as images, videos, files, or audio": "插入图片、视频、文件或音频等资源",
        "Insert assets such as images, videos, folders, files, or audio": "插入图片、视频、文件夹、文件或音频等资源",
        "Insert images, videos, audio, or files": "插入图片、视频、音频或文件",
        "Insights": "洞察",
        "Inspiration": "灵感",
        "Integrations": "集成",
        "Integrations (BYOK)": "集成 (BYOK)",
        "Interaction limits": "交互限制",
        "Interesting posts for you": "为你推荐的有趣帖子",
        "Interface For LLMs": "大语言模型接口",
        "Issues": "议题",
        "Join discussion": "加入讨论",
        "Join Discord": "加入 Discord",
        "Join the Team": "加入团队",
        "Jump to": "跳转到",
        "Keys": "密钥",
        "Labels": "标签",
        "Labs": "实验室",
        "Language": "语言",
        "Languages": "语言",
        "last month": "上个月",
        "Last Updated": "最后更新",
        "last week": "上周",
        "last year": "去年",
        "Latest": "最新",
        "Leaderboard": "排行榜",
        "Leaderboard Overview": "排行榜概览",
        "Learn more": "了解详情",
        "Least recently updated": "最久未更新",
        "Legal": "法律",
        "Let the model decide how many thinking tokens to use or choose your own value": "让模型决定使用多少思考令牌，或选择您自己的值",
        "Lets Gemini use code to solve complex tasks": "让 Gemini 使用代码解决复杂任务",
        "Lets you define functions that Gemini can call": "让您可以定义 Gemini 能够调用的函数",
        "Libraries": "库",
        "License": "许可证",
        "Licenses": "许可证",
        "Life & arts": "生活与艺术",
        "Light": "浅色",
        "Lists": "列表",
        "Live": "实时",
        "Live audio-to-audio dialog": "实时音频对话",
        "Location": "位置",
        "Lock conversation": "锁定对话",
        "Log out": "退出登录",
        "Main": "主页",
        "Make a copy": "创建副本",
        "Make changes, add new features, ask for anything": "做出更改、添加新功能、提出任何要求",
        "Manage cookies": "管理 Cookie",
        "Markdown is supported": "支持 Markdown",
        "Marketplace": "市场",
        "Maximum number of tokens in response": "响应中的最大令牌数",
        "MCP registry": "MCP 注册表",
        "Media Resolution": "媒体分辨率",
        "Media resolution": "媒体分辨率",
        "Messages": "消息",
        "Microphone source": "麦克风来源",
        "Milestone": "里程碑",
        "Milestones": "里程碑",
        "Mirrors": "镜像",
        "Model": "模型",
        "Model Authors": "模型作者",
        "Model card": "模型卡片",
        "Models": "模型",
        "Moderation": "监管",
        "Moderation options": "监管选项",
        "Month": "个月",
        "More": "更多",
        "More options": "更多选项",
        "Most downloads": "最多下载",
        "Most forks": "最多复刻",
        "Most stars": "最多星标",
        "My history": "我的历史记录",
        "My stack": "我的技术栈",
        "Name": "名称",
        "Native image generation": "原生图片生成",
        "Native speech generation": "原生语音生成",
        "Never be notified.": "从不接收通知",
        "New": "新",
        "New Chat": "新聊天",
        "New codespace": "新建代码空间",
        "New conversation in": "新对话始于",
        "New gist": "新建代码片段",
        "New issue": "新建议题",
        "New organization": "新建组织",
        "New project": "新建项目",
        "New release": "发布新版",
        "New repository": "新建仓库",
        "Newest": "最新",
        "No API Key": "无 API 密钥",
        "No changes to save": "没有要保存的更改",
        "No labels": "无标签",
        "No milestone": "无里程碑",
        "No packages published": "未发布包",
        "No projects": "无项目",
        "No releases published": "未发布版本",
        "No results": "无结果",
        "None yet": "暂无",
        "Not factually correct": "不符合事实",
        "Not following instructions": "未遵循指令",
        "Not helpful": "没有帮助",
        "Nothing to preview": "没有要预览的内容",
        "Notifications": "通知",
        "Notified of all notifications on this repository.": "接收此仓库的所有通知",
        "now": "现在",
        "Number of followers": "关注者数量",
        "Number of forks": "复刻数量",
        "Number of stars": "星标数量",
        "Off": "关闭",
        "OK, got it": "好的，知道了",
        "Older": "更早",
        "Oldest": "最旧",
        "Only receive notifications from this repository when participating or @mentioned.": "仅在参与或被@mentioned时接收来自此仓库的通知",
        "Open": "开启",
        "Open Copilot…": "打开 Copilot",
        "Open in Drive": "在 Google Drive 中打开",
        "Open navigation menu": "打开导航菜单",
        "Open settings menu": "打开设置菜单",
        "Open with GitHub Desktop": "使用 GitHub Desktop 打开",
        "Open with Visual Studio": "使用 Visual Studio 打开",
        "Optional tone and style instructions for the model": "模型的可选语气和风格指令",
        "Organization": "组织",
        "Organization Members": "组织成员",
        "Organizations": "组织",
        "Other": "其他",
        "Our most intelligent model with SOTA reasoning and multimodal understanding, and powerful agentic and vibe coding capabilities": "我们最智能的模型，具有最先进的推理和多模态理解能力，以及强大的智能体和氛围编码能力",
        "Output length": "输出长度",
        "Output Modalities": "输出模态",
        "Overview": "概览",
        "Owner": "所有者",
        "Packages": "包",
        "Pages": "页面",
        "Parameters": "参数",
        "Participants": "参与者",
        "Participating and @mentions": "参与和@mentions",
        "Partners": "合作伙伴",
        "Password and authentication": "密码和身份验证",
        "Paste, drop, or click to add files": "粘贴、拖放或点击以添加文件",
        "People will be able to leave comments and reactions on this release using Discussions.": "用户将可以通过讨论区对此版本发表评论和反应",
        "Performance": "性能",
        "Pick a branch or recent commit": "选择分支或最近提交",
        "Pin": "固定",
        "Pin issue": "固定议题",
        "Playground": "演练场",
        "Please tell us more about the reason for your feedback (optional)": "请告诉我们更多关于您反馈的原因（可选）",
        "Plugin Ideas": "插件创意",
        "Plugin Versions": "插件版本",
        "Polls": "投票",
        "Popular repositories": "热门仓库",
        "Powered by Code Arena": "由代码竞技场驱动",
        "Preserve this repository": "保留此仓库",
        "Presets": "预设",
        "Press": "新闻",
        "Preview": "预览",
        "Pricing": "定价",
        "Privacy": "隐私",
        "Privacy Policy": "隐私政策",
        "Private": "私有",
        "Probability threshold for top-p sampling": "Top-P 采样的概率阈值",
        "Products": "产品",
        "Professional": "专业",
        "Profile": "个人资料",
        "Profile picture": "个人头像",
        "Projects": "项目",
        "Prompt gallery": "提示库",
        "Prompt pricing": "提示词定价",
        "Pronouns": "代词",
        "Propose changes": "建议更改",
        "Provider / Model": "提供商 / 模型",
        "Providers": "提供商",
        "Provisioning Keys": "配置密钥",
        "Public": "公共",
        "Public email": "公共邮箱",
        "Public profile": "公共个人资料",
        "Publish": "发布",
        "Publish release": "发布版本",
        "Publish your first package": "发布你的第一个包",
        "Pull requests": "拉取请求",
        "Q&A": "问答",
        "Questions": "问答",
        "Quickstart": "快速入门",
        "Rank": "排名",
        "Rank Spread": "排名分布",
        "Rankings": "排名",
        "Ratings & Reviews": "评分与评论",
        "Raw Mode": "原始模式",
        "Reasoning": "推理",
        "Recent Commits": "最近提交",
        "Recently active": "最近活跃",
        "Recently starred": "最近星标",
        "Recently updated": "最近更新",
        "Record Audio": "录制音频",
        "Relationships": "关系",
        "Release notes": "发布说明",
        "Release title": "发布标题",
        "Releases": "版本",
        "Remix": "再创作",
        "Rename": "重命名",
        "Reopen issue": "重新打开议题",
        "Reply": "回复",
        "repo:": "仓库:",
        "Report Feedback": "报告反馈",
        "Report Issue": "报告问题",
        "Repositories": "仓库",
        "Repository name": "仓库名称",
        "Reputation": "声望",
        "Require contributors to sign off on web-based commits": "要求贡献者对基于Web的提交进行签名",
        "Rerun this turn": "重新运行此轮",
        "Reset default settings": "重置默认设置",
        "Reset defaults": "重置默认",
        "Reset Filters": "重置筛选条件",
        "Response": "响应",
        "Responses": "回复",
        "Restore": "恢复",
        "result": "结果",
        "results": "结果",
        "Reviews": "评论",
        "Rules": "规则",
        "Run": "运行",
        "Run prompt": "运行提示",
        "Run safety settings": "运行安全设置",
        "Run settings": "运行设置",
        "Safety settings": "安全设置",
        "Sample Media": "示例媒体",
        "Save": "保存",
        "Save changes": "保存更改",
        "Save draft": "保存草稿",
        "Save prompt": "保存提示",
        "Saved replies": "已保存回复",
        "Saved to Drive": "已保存到云端硬盘",
        "Saves": "收藏",
        "Scheduled reminders": "计划提醒",
        "Science": "科学",
        "Score": "分数",
        "Scroll to the right to see full stats of each model": "向右滚动查看每个模型的完整统计信息",
        "Search": "搜索",
        "Search all of GitHub": "搜索整个 GitHub",
        "Search Arena": "搜索竞技场",
        "Search by model name...": "按模型名称搜索...",
        "Search in this organization": "在此组织中搜索",
        "Search in this owner": "在此所有者中搜索",
        "Search in this repository": "在此仓库中搜索",
        "Search models, datasets, users...": "搜索模型、数据集、用户...",
        "Search or create a new tag": "搜索或创建新标签",
        "Search stars": "搜索星标",
        "Search syntax tips": "搜索语法提示",
        "Search…": "搜索",
        "Second Place": "第二名",
        "Secrets and variables": "机密和变量",
        "Security": "安全",
        "Security alerts": "安全警报",
        "Security log": "安全日志",
        "Select a model": "选择一个模型",
        "Select model for the code assistant": "选择代码助手模型",
        "Select events you want to be notified of in addition to participating and @mentions.": "除参与和@mentions外，选择您希望接收通知的事件",
        "Select or upload a file on Google Drive to include in your prompt": "在 Google Drive 上选择或上传文件以包含在您的提示中",
        "Select tag": "选择标签",
        "Send message": "发送消息",
        "Series": "系列",
        "Sessions": "会话",
        "Set as a pre-release": "设置为预发布版本",
        "Set as the latest release": "设置为最新版本",
        "Set thinking budget": "设置思考预算",
        "Set up discussions": "设置讨论",
        "Set up sponsor button": "设置赞助按钮",
        "Set up templates": "设置模板",
        "Setting": "设置",
        "Settings": "设置",
        "Sexually Explicit": "性暴露",
        "Share": "分享",
        "Share prompt": "分享提示",
        "Share Screen": "共享屏幕",
        "Show and tell": "展示与交流",
        "Show More": "显示更多",
        "Show more": "显示更多",
        "Show more responses": "显示更多回复",
        "Show run settings": "显示运行设置",
        "side-by-side with you": "与你并肩",
        "Sign out": "退出登录",
        "Size": "大小",
        "Skip to main content": "跳转到主要内容",
        "Social accounts": "社交账号",
        "Social preview": "社交预览",
        "Sort": "排序",
        "Sort by:": "排序方式:",
        "Source code": "源代码",
        "Source:": "来源：",
        "Sources": "来源",
        "Spaces": "空间",
        "Sponsor": "赞助",
        "Sponsors": "赞助",
        "Sponsorship log": "赞助日志",
        "Sponsorships": "赞助",
        "Sponsorships help your community know how to financially support this repository.": "赞助可帮助您的社区了解如何在财务上支持此仓库",
        "SSH and GPG keys": "SSH 和 GPG 密钥",
        "Stack Ads": "Stack 广告",
        "Stack Data Licensing": "Stack 数据许可",
        "Stack Exchange Network": "Stack 交换网络",
        "Stack Internal": "Stack 内部",
        "Standard View": "标准视图",
        "Star": "星标",
        "Starred": "已星标",
        "Stars": "星标",
        "Start": "开始",
        "Start a message...": "开始一条消息...",
        "Start a new Copilot thread": "开始新的 Copilot 会话",
        "Start typing a prompt": "开始输入提示词",
        "Start Voting": "开始投票",
        "Status": "状态",
        "Stop": "停止",
        "Stop editing": "停止编辑",
        "Stream": "实时对话",
        "Structured output": "结构化输出",
        "Structured outputs": "结构化输出",
        "Studio": "工作室",
        "Style Control": "风格控制",
        "Submit feedback": "提交反馈",
        "Summary": "概要",
        "Supercharge your apps with AI": "用 AI 为您的应用注入超能力",
        "Support": "支持",
        "Supported Parameters": "支持的参数",
        "Switch to a paid API key to unlock higher quota and more features.": "切换到付费 API 密钥以解锁更高配额和更多功能",
        "Symbol": "符号",
        "System": "系统",
        "System instructions": "系统指令",
        "Tags": "标签",
        "Talk": "对话",
        "Tasks": "任务",
        "Technology": "技术",
        "Temperature": "温度",
        "Template repository": "模板仓库",
        "Templates": "模板",
        "Terms": "条款",
        "Terms of Service": "服务条款",
        "Terms of Use": "使用条款",
        "Text": "文本",
        "Text Arena": "文本竞技场",
        "Text-to-Image": "文生图",
        "Text-to-Image Arena": "文生图竞技场",
        "Text-to-Video": "文生视频",
        "Text-to-Video Arena": "文生视频竞技场",
        "The Unified": "统一",
        "Theme": "主题",
        "Themes": "主题",
        "There were no pull requests associated with the commits included in this release.": "此版本包含的提交没有关联的拉取请求",
        "Thinking": "思考中",
        "Thinking level": "思考级别",
        "Thinking mode": "思考模式",
        "Third Place": "第三名",
        "This release will be labeled as non-production ready": "此版本将被标记为非生产就绪",
        "This release will be labeled as the latest for this repository.": "此版本将被标记为此仓库的最新版本",
        "Thoughts": "思考",
        "Title": "标题",
        "to search": " 搜索",
        "Today": "今天",
        "Toggle navigation menu": "切换导航菜单",
        "Toggle thinking budget between auto and manual": "在自动和手动之间切换思考预算",
        "Toggle thinking mode": "切换思考模式",
        "Token count": "令牌计数",
        "Tools": "工具",
        "Top K": "Top-K",
        "Top P": "Top-P",
        "Top repositories": "热门仓库",
        "Topic": "话题",
        "Topics": "话题",
        "Total Models": "模型总数",
        "Total Votes": "投票总数",
        "Training, Logging, & Privacy": "训练、日志与隐私",
        "Transfer issue": "转移议题",
        "Truncate response including and after string": "在包含指定字符串后截断响应",
        "Try adjusting your search filters.": "尝试调整搜索筛选条件",
        "Try Enterprise": "试用企业版",
        "Try Gemini's natural, real-time dialog with audio and video inputs": "体验 Gemini 带有音频和视频输入的自然、实时对话",
        "Type": "输入 ",
        "Type something or tab to choose an example prompt": "输入内容，或按 Tab 键选择示例提示",
        "Unable to disable thinking mode for this model.": "无法禁用此模型的思考模式。",
        "Unstar": "取消星标",
        "Unsubscribe": "取消订阅",
        "Unwatch": "取消关注",
        "Update Date": "更新日期",
        "Updated": "更新",
        "Upgrade": "升级",
        "Upload a file": "上传文件",
        "Upload a file to Google Drive to include in your prompt": "上传文件到 Google Drive 以包含在您的提示中",
        "Upload an image to customize your repository’s social media preview.": "上传图片以自定义仓库的社交媒体预览",
        "Upload File": "上传文件",
        "Upload files": "上传文件",
        "Upload Image": "上传图片",
        "Uptime": "运行时间",
        "URL context": "网址上下文",
        "URL context tool": "网址上下文工具",
        "Usage": "用量",
        "Usage & Billing": "用量和结算",
        "Use Google Search": "使用 Google 搜索",
        "Use this model": "使用此模型",
        "Use your GitHub Pages website": "使用 GitHub Pages 网站",
        "User": "用户",
        "user:": "用户:",
        "Users": "用户",
        "Version": "版本",
        "Versions": "版本",
        "Video": "视频",
        "View": "查看",
        "View all": "查看全部",
        "View all history": "查看所有历史记录",
        "View changes": "查看更改",
        "View more actions": "查看更多操作",
        "View rankings across multimodal, generative AI models capable of understanding and processing visual inputs": "查看能够理解和处理视觉输入的多模态生成式人工智能模型的排名",
        "View rankings across various LLMs on their versatility, linguistic precision, and cultural context across text": "查看各种大语言模型在多功能性、语言精确度和文化语境方面的排名",
        "View search docs": "查看搜索文档",
        "View status": "查看状态",
        "View Trending": "查看趋势",
        "Visibility": "可见性",
        "Vision": "视觉",
        "Vision Arena": "视觉竞技场",
        "Visit Arena": "访问竞技场",
        "Visit our Blog": "访问我们的博客",
        "Votes": "投票数",
        "Watch": "关注",
        "Watched tags": "关注的标签",
        "watching": "关注",
        "Webcam": "网络摄像头",
        "WebDev": "网页开发",
        "WebDev Leaderboard": "网页开发排行榜",
        "Webhooks": "网络钩子",
        "Website": "网站",
        "Welcome back": "欢迎回来",
        "Welcome to AI Studio": "欢迎使用 AI Studio",
        "What's new": "新增功能",
        "What's wrong? How can the response be improved?": "有什么问题？如何改进回复？",
        "Wiki": "维基",
        "Wikis": "维基",
        "Won't fix, can't repro, stale": "不修复、无法复现、过时",
        "Work Here": "在此工作",
        "Working from home": "居家办公",
        "World's smartest AIs,": "世界最聪明的人工智能,",
        "Wrapped": "年度回顾",
        "Write": "编写",
        "Write Review": "写评论",
        "Year": "年",
        "yesterday": "昨天",
        "You have no unread notifications": "您没有未读通知",
        "You need to create and run a prompt in order to share it": "您需要创建并运行一个提示才能分享它",
        "You reacted": "你的回应",
        "You're receiving notifications because you're subscribed to this thread.": "您接收通知是因为您已订阅此主题",
        "You're currently using free tier requests.": "您当前正在使用免费层级请求",
        "Your": "你的",
        "Your apps": "您的应用",
        "Your issues": "您的问题",
        "Your pull requests": "您的拉取请求",
        "Your repository details have been saved.": "您的仓库详细信息已保存",
        "YouTube Video": "YouTube 视频",
        "(Upper-Lower)": "(上限-下限)",
        "(experimental)": "(实验的)",
        "(separate with spaces)": "(用空格分隔)",
        "✨ Inspiration": "✨ 灵感",
        "🇺🇸 Language": "语言",
        "💬 Default": "默认"
    };

    const statKeys = ['follower', 'following', 'stars', 'watching', 'forks'];

    // 小写翻译映射表(英文->中文)
    const lowerCaseTranslations = {};
    for (const key in translations) {
        lowerCaseTranslations[key.toLowerCase()] = translations[key];
    }

    // 预编译选择器字符串(避免每次函数调用重建)
    const codeSelectorsStr = ['pre', 'code', '.blob-code', '.blob-code-inner', '.blob-wrapper', '.react-blob-print-hide', '.react-code-text', '.react-file-line', '.react-code-file-contents', '.highlight', '.CodeMirror', '.monaco-editor', '.notranslate', '.markdown-body pre', '.markdown-body code', '[data-testid="read-only-cursor-text-area"]', '[data-testid="code-cell"]', '[data-testid="code-lines-container"]'].join(', ');

    /**
     * 检查元素是否应该跳过翻译
     * @param element 要检查的元素
     */
    function shouldSkipElement(element) {
        if (!element) {
            return false;
        }
        // 跳过代码区域(textarea / pre / code / GitHub特有的代码视图类 / 其他常用编辑器)
        if (element.closest(codeSelectorsStr)) {
            return true;
        }
        // GitHub特殊处理
        if (location.hostname.includes('github.com')) {
            // 跳过搜索框构建器输入内容和代码文件/文件夹名称
            if (element.closest('.QueryBuilder-StyledInputContent, .react-directory-filename-cell')) {
                return true;
            }
            // 跳过搜索框构建器结果列表中的建议文本(保留描述文本翻译)
            if (element.closest('.QueryBuilder-ListItem') && element.closest('.ActionListItem-label')) {
                return true;
            }
            // 检查元素自身或祖先是否有 pl-* 类(GitHub语法高亮类)
            let current = element;
            while (current && current !== document.body) {
                if (typeof current.className === 'string') {
                    // 检查是否有以 pl- 开头的语法高亮类名(避开 pl-1, pl-2 等布局类)
                    if (/(?:^|\s)pl-[a-z]/.test(current.className)) {
                        return true;
                    }
                }
                current = current.parentElement;
            }
            // GitHub不跳过aria-hidden=true的元素
            return false;
        }
        // 跳过aria-hidden=true的元素
        return element.getAttribute('aria-hidden') === 'true';
    }

    // 预编译正则表达式和映射表(避免每次函数调用重建)
    const timeRegex = /^(\d+)\s+(year|month|week|day|hour|minute|second)s?\s+ago$/i;
    const unitMap = {
        'year': '年', 'month': '个月', 'week': '周', 'day': '天', 'hour': '小时', 'minute': '分钟', 'second': '秒'
    };
    const statRegex = /^(\s*)(\+\s*)?(\d+(?:\.\d+)?[km]?\+?)?(\s*)([a-zA-Z]+)(\s*)$/i;

    /**
     * 翻译相对时间字符串(例如: "2 months ago")
     * @param text 要翻译的文本
     */
    function translateRelativeTime(text) {
        const match = text.match(timeRegex);
        if (match) {
            // 提取数字部分
            const num = match[1];
            // 提取单位部分并转换为小写
            const unit = match[2].toLowerCase();
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
            // value属性仅翻译按钮类input(避免修改表单提交数据)
            const tagName = node.tagName;
            if (tagName === 'INPUT' && (node.type === 'button' || node.type === 'submit' || node.type === 'reset')) {
                attributes.push('value');
            }
            for (const attr of attributes) {
                const value = node.getAttribute(attr);
                if (value) {
                    const lowerValue = value.toLowerCase();
                    // 检查是否直接在翻译表中
                    if (lowerCaseTranslations[lowerValue]) {
                        node.setAttribute(attr, lowerCaseTranslations[lowerValue]);
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
            // 检查父元素是否是textarea
            if (node.parentElement && node.parentElement.tagName.toLowerCase() === 'textarea') {
                return;
            }
            // 检查父元素是否应该跳过翻译
            if (shouldSkipElement(node.parentElement)) {
                return;
            }
            const text = node.nodeValue;
            const trimmedText = text.trim();
            if (trimmedText) {
                const lowerTrimmed = trimmedText.toLowerCase();
                // 检查是否直接在翻译表中
                if (lowerCaseTranslations[lowerTrimmed]) {
                    // 检查是否为统计单词
                    if (statKeys.includes(lowerTrimmed)) {
                        // 尝试翻译统计信息
                        const translatedStat = translateStat(text);
                        if (translatedStat) {
                            node.nodeValue = translatedStat;
                        }
                    } else {
                        // 保留原始文本的前后空白
                        const leadingSpace = text.slice(0, text.indexOf(trimmedText));
                        const trailingSpace = text.slice(text.indexOf(trimmedText) + trimmedText.length);
                        node.nodeValue = leadingSpace + lowerCaseTranslations[lowerTrimmed] + trailingSpace;
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

    let pendingMutations = [];
    let rafScheduled = false;

    /**
     * 处理待处理的DOM变化
     */
    function processPendingMutations() {
        const mutations = pendingMutations;
        pendingMutations = [];
        rafScheduled = false;
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
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // 元素节点直接交给walkAndTranslate处理(避免重复翻译根节点)
                    walkAndTranslate(node);
                    // 处理Shadow Root
                    if (node.shadowRoot) {
                        handleShadowRoot(node.shadowRoot);
                    }
                } else if (node.nodeType === Node.TEXT_NODE) {
                    translateNode(node);
                }
            }
        }
    }

    // 初始化MutationObserver(用于监听DOM变化)
    const observer = new MutationObserver((mutations) => {
        pendingMutations.push(...mutations);
        if (!rafScheduled) {
            rafScheduled = true;
            requestAnimationFrame(processPendingMutations);
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