// ==UserScript==
// @name         汉化脚本
// @description  自动翻译网页中的英文内容为中文
// @icon         https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/translate-icon.png?v=1
// @version      1.5
// @author       tianxing
// @match        https://aistudio.google.com/*
// @match        https://yupp.ai/*
// @match        https://arena.ai/*
// @match        https://plugins.jetbrains.com/*
// @match        https://openrouter.ai/*
// @match        https://stackoverflow.com/*
// @match        https://huggingface.co/*
// @match        https://github.com/*
// @resource     translations https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/translations.json?v=3
// @grant        GM_getResourceText
// @run-at       document-start
// @license      Apache-2.0
// @namespace    https://greasyfork.org/users/1203191
// @homepageURL  https://github.com/tianxing-ovo/Tampermonkey
// @supportURL   https://github.com/tianxing-ovo/Tampermonkey/issues
// @updateURL    https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/汉化脚本.js
// @downloadURL  https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/汉化脚本.js
// ==/UserScript==


(function () {
    'use strict';

    // 翻译映射表(英文->中文)从外部资源加载
    // noinspection JSUnresolvedReference
    const translations = JSON.parse(GM_getResourceText('translations'));

    const statKeys = new Set(['follower', 'following', 'stars', 'watching', 'forks']);
    const isGitHub = location.hostname.includes('github.com');
    const whitespaceRegex = /\s+/g;
    const zeroWidthRegex = /[\u200B-\u200D\uFEFF]/g;

    /**
     * 规范化用于查词典的文本(统一空白/大小写/零宽字符)
     *
     * @param text 原始文本
     */
    function normalizeLookupText(text) {
        return text.replace(zeroWidthRegex, '').replace(whitespaceRegex, ' ').trim().toLowerCase();
    }

    // 小写翻译映射表(英文->中文)
    const lowerCaseTranslations = new Map();
    for (const key in translations) {
        lowerCaseTranslations.set(normalizeLookupText(key), translations[key]);
    }

    // 预编译选择器字符串和常量集合(避免每次函数调用重建)
    const codeSelectors = ['pre', 'code', '.blob-code', '.blob-code-inner', '.blob-wrapper', '.react-blob-print-hide', '.react-code-text', '.react-file-line', '.react-code-file-contents', '.highlight', '.CodeMirror', '.monaco-editor', '.markdown-body pre', '.markdown-body code', '[data-testid="read-only-cursor-text-area"]', '[data-testid="code-cell"]', '[data-testid="code-lines-container"]'];
    // 非GitHub平台额外添加notranslate类选择器(避免误伤导航按钮等普通文案)
    if (!isGitHub) {
        codeSelectors.push('.notranslate');
    }
    const codeSelectorsStr = codeSelectors.join(', ');
    const textSkipTags = new Set(['textarea', 'script', 'style', 'noscript']);
    const walkerSkipTags = new Set(['script', 'style', 'noscript']);
    const standardAttributes = ['aria-label', 'placeholder', 'mattooltip', 'title'];
    const inputAttributes = ['aria-label', 'placeholder', 'mattooltip', 'title', 'value'];
    const obsAttributes = ['placeholder', 'aria-label', 'title', 'mattooltip'];

    /**
     * 检查元素是否应该跳过翻译
     * @param element 要检查的元素
     */
    function shouldSkipElement(element) {
        if (!element) {
            return false;
        }
        // 确保element具有closest方法(有些特殊的Node类型可能没有)
        if (!element.closest) {
            return false;
        }
        // 跳过代码区域(textarea / pre / code / GitHub特有的代码视图类 / 其他常用编辑器)
        if (element.closest(codeSelectorsStr)) {
            return true;
        }
        // GitHub特殊处理
        if (isGitHub) {
            // 跳过搜索框构建器输入内容和代码文件/文件夹名称
            if (element.closest('.QueryBuilder-StyledInputContent, .react-directory-filename-cell')) {
                return true;
            }
            // 跳过搜索框构建器结果列表中的建议文本(保留描述文本翻译)
            if (element.closest('.QueryBuilder-ListItem') && element.closest('.ActionListItem-label')) {
                return true;
            }
            // 检查元素自身或祖先是否有 pl-* 类(GitHub语法高亮类)
            // 先使用原生的closest做快速的属性选择器阻断(命中后再做昂贵的正则回溯)
            if (element.closest('[class*="pl-"]')) {
                let current = element;
                // 遍历所有祖先元素(包括当前元素)
                while (current && current !== document.body) {
                    if (typeof current.className === 'string') {
                        // 检查是否有以 pl- 开头的语法高亮类名(避开 pl-1, pl-2 等布局类)
                        if (plClassRegex.test(current.className)) {
                            return true;
                        }
                    }
                    current = current.parentElement;
                }
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
    const plClassRegex = /(?:^|\s)pl-[a-z]/;

    /**
     * 翻译相对时间字符串(例如: "2 months ago")
     * @param text 要翻译的文本
     */
    function translateRelativeTime(text) {
        const normalized = text.replace(zeroWidthRegex, '').replace(whitespaceRegex, ' ').trim();
        const match = normalized.match(timeRegex);
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
        const normalized = text.replace(zeroWidthRegex, '');
        // 模式: 可选空白 + 可选(+) + 可选数字 + 可选空白 + 单词(必须在翻译表中) + 可选空白
        const match = normalized.match(statRegex);
        if (match) {
            const prefixSpace = match[1];
            const plusPart = match[2] || '';
            const number = match[3] || '';
            const middleSpace = match[4];
            const word = match[5];
            const suffixSpace = match[6];
            // 尝试查找单词的翻译
            const lowerWord = word.toLowerCase();
            if (lowerCaseTranslations.has(lowerWord)) {
                const translatedWord = lowerCaseTranslations.get(lowerWord);
                return `${prefixSpace}${plusPart}${number}${middleSpace}${translatedWord}${suffixSpace}`;
            }
        }
        return null;
    }

    /**
     * 翻译单个节点的文本或属性
     * @param node 要翻译的节点
     * @param isSafe 标记该节点已经过验证(无需再调用shouldSkipElement)
     */
    function translateNode(node, isSafe = false) {
        // 翻译元素节点的属性
        if (node.nodeType === Node.ELEMENT_NODE) {
            // 检查元素是否应该跳过翻译
            if (!isSafe && shouldSkipElement(node)) {
                return;
            }
            let attributes = standardAttributes;
            // value属性仅翻译按钮类input(避免修改表单提交数据)
            if (node.tagName === 'INPUT' && (node.type === 'button' || node.type === 'submit' || node.type === 'reset')) {
                attributes = inputAttributes;
            }
            for (const attr of attributes) {
                const value = node.getAttribute(attr);
                if (value) {
                    const lowerValue = normalizeLookupText(value);
                    // 检查是否直接在翻译表中
                    let newValue = null;
                    if (lowerCaseTranslations.has(lowerValue)) {
                        newValue = lowerCaseTranslations.get(lowerValue);
                    } else {
                        // 尝试翻译相对时间
                        const translatedTime = translateRelativeTime(value);
                        if (translatedTime) {
                            newValue = translatedTime;
                        } else {
                            // 尝试翻译统计信息
                            const translatedStat = translateStat(value);
                            if (translatedStat) {
                                newValue = translatedStat;
                            }
                        }
                    }
                    if (newValue && newValue !== value) {
                        node.setAttribute(attr, newValue);
                    }
                }
            }
        }
        // 翻译文本节点
        if (node.nodeType === Node.TEXT_NODE) {
            // 检查父元素是否应该被跳过(包含script/style/textarea等)
            if (node.parentElement && textSkipTags.has(node.parentElement.tagName.toLowerCase())) {
                return;
            }
            // 检查父元素是否应该跳过翻译
            if (!isSafe && shouldSkipElement(node.parentElement)) {
                return;
            }
            const text = node.nodeValue;
            const trimmedText = text.trim();
            if (trimmedText) {
                const lowerTrimmed = normalizeLookupText(trimmedText);
                let newValue = null;
                // 检查是否直接在翻译表中
                if (lowerCaseTranslations.has(lowerTrimmed)) {
                    // 检查是否为统计单词
                    if (statKeys.has(lowerTrimmed)) {
                        // 尝试翻译统计信息
                        const translatedStat = translateStat(text);
                        if (translatedStat) {
                            newValue = translatedStat;
                        }
                    } else {
                        // 保留原始文本的前后空白
                        let leadingSpace = text.slice(0, text.indexOf(trimmedText));
                        let trailingSpace = text.slice(text.indexOf(trimmedText) + trimmedText.length);
                        const translated = lowerCaseTranslations.get(lowerTrimmed);
                        // 如果翻译为中文(去除多余的普通空格并保留换行符)
                        if (/[\u4e00-\u9fa5]/.test(translated)) {
                            leadingSpace = leadingSpace.replace(/[ \t]+/g, '');
                            trailingSpace = trailingSpace.replace(/[ \t]+/g, '');
                        }
                        newValue = leadingSpace + translated + trailingSpace;
                    }
                } else {
                    // 尝试翻译相对时间
                    const translatedTime = translateRelativeTime(text);
                    if (translatedTime) {
                        newValue = translatedTime;
                    } else {
                        // 尝试翻译统计信息
                        const translatedStat = translateStat(text);
                        if (translatedStat) {
                            newValue = translatedStat;
                        }
                    }
                }
                if (newValue && newValue !== text) {
                    node.nodeValue = newValue;
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
        // 如果rootNode自身就该被跳过(直接放弃)
        if (rootNode.nodeType === Node.ELEMENT_NODE && shouldSkipElement(rootNode)) {
            return;
        } else if (rootNode.nodeType === Node.TEXT_NODE && rootNode.parentElement && shouldSkipElement(rootNode.parentElement)) {
            return;
        }
        // 创建TreeWalker时使用的过滤函数
        const filter = function (node) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                if (walkerSkipTags.has(node.tagName.toLowerCase())) {
                    return NodeFilter.FILTER_REJECT;
                }
                if (node.matches && node.matches(codeSelectorsStr)) {
                    return NodeFilter.FILTER_REJECT;
                }
                if (isGitHub) {
                    if (node.matches && node.matches('.QueryBuilder-StyledInputContent, .react-directory-filename-cell')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    if (node.matches && node.matches('.ActionListItem-label') && node.closest('.QueryBuilder-ListItem')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    if (typeof node.className === 'string' && plClassRegex.test(node.className)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                } else {
                    if (node.getAttribute('aria-hidden') === 'true') {
                        return NodeFilter.FILTER_REJECT;
                    }
                }
            }
            return NodeFilter.FILTER_ACCEPT;
        };
        // 使用TreeWalker高效遍历(遇到被reject的元素将直接跳过其整个子树)
        const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, filter);
        // 如果rootNode是可接受的(需要翻译它自己)
        translateNode(rootNode, true);
        let node;
        while (node = walker.nextNode()) {
            translateNode(node, true);
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
            attributeFilter: obsAttributes
        });
        walkAndTranslate(root);
    }

    let pendingMutations = [];
    let rafScheduled = false;
    let fullPassTimer = 0;
    let initialized = false;

    /**
     * 计划在指定延迟后执行完整遍历翻译(兜底异步渲染漏网节点)
     *
     * @param delay 延迟毫秒
     */
    function scheduleFullPass(delay = 140) {
        if (fullPassTimer) {
            clearTimeout(fullPassTimer);
        }
        fullPassTimer = setTimeout(() => {
            fullPassTimer = 0;
            const root = document.body || document.documentElement;
            walkAndTranslate(root);
        }, delay);
    }

    /**
     * 处理待处理的DOM变化
     */
    function processPendingMutations() {
        const mutations = pendingMutations;
        pendingMutations = [];
        rafScheduled = false;
        const processedNodes = new Set();
        for (const mutation of mutations) {
            // 处理属性变化
            if (mutation.type === 'attributes') {
                if (!processedNodes.has(mutation.target)) {
                    processedNodes.add(mutation.target);
                    translateNode(mutation.target);
                    if (mutation.target.shadowRoot) {
                        handleShadowRoot(mutation.target.shadowRoot);
                    }
                }
            }
            // 处理文本内容变化
            else if (mutation.type === 'characterData') {
                if (!processedNodes.has(mutation.target)) {
                    processedNodes.add(mutation.target);
                    translateNode(mutation.target);
                }
            }
            // 处理新增节点
            else if (mutation.type === 'childList') {
                if (mutation.addedNodes.length > 0) {
                    scheduleFullPass();
                }
                for (const node of mutation.addedNodes) {
                    if (!processedNodes.has(node)) {
                        processedNodes.add(node);
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
        if (initialized) {
            return;
        }
        initialized = true;
        const root = document.body || document.documentElement;
        // 立即开始监听DOM变化
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: obsAttributes
        });

        // 第一次翻译
        walkAndTranslate(root);

        // 延迟翻译(处理SPA框架动态渲染的内容)
        setTimeout(() => {
            walkAndTranslate(document.body || document.documentElement);
        }, 300);

        // 再次延迟翻译(处理更慢加载的内容)
        setTimeout(() => walkAndTranslate(document.body || document.documentElement), 1000);
        setTimeout(() => walkAndTranslate(document.body || document.documentElement), 2000);

        // 监听页面生命周期和GitHub Turbo/PJAX(避免刷新或局部导航后漏翻)
        const retrigger = () => scheduleFullPass(80);
        window.addEventListener('pageshow', retrigger, true);
        window.addEventListener('load', retrigger, true);
        document.addEventListener('readystatechange', () => {
            if (document.readyState !== 'loading') {
                retrigger();
            }
        }, true);
        if (isGitHub) {
            document.addEventListener('turbo:load', retrigger, true);
            document.addEventListener('turbo:render', retrigger, true);
            document.addEventListener('pjax:end', retrigger, true);
            document.addEventListener('pjax:success', retrigger, true);
        }
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