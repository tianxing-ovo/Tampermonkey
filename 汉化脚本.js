// ==UserScript==
// @name         汉化脚本
// @description  自动翻译网页中的英文内容为中文
// @icon         https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/translate-icon.png?v=1
// @version      1.9
// @author       tianxing
// @match        *://*/*
// @resource     translations https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/translations.json
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

    // GitHub专用屏蔽选择器(README、搜索构建器、路径导航面包屑、分支名、提交记录等)
    const githubSkipSelectors = ['article.markdown-body', '.QueryBuilder-StyledInputContent', '.react-directory-filename-cell', '[data-testid="breadcrumbs"]', '[data-testid="breadcrumbs-filename"]', '.js-path-segment', '.css-truncate-target', '.react-directory-commit-message'];
    const githubSkipSelectorsStr = githubSkipSelectors.join(', ');
    // 文本节点翻译时屏蔽的父标签(保护内部代码/样式/文本编辑框不被错误翻译和破坏)
    const textSkipTags = new Set(['textarea', 'script', 'style', 'noscript']);
    // TreeWalker遍历时直接跳过且不再深入的元素节点(提高DOM树遍历性能)
    const walkerSkipTags = new Set(['script', 'style', 'noscript']);
    // 需要常规翻译的DOM元素属性白名单
    const standardAttributes = ['aria-label', 'placeholder', 'mattooltip', 'title'];
    // 仅针对按钮类input元素扩充的需要翻译的属性白名单(包含value)
    const inputAttributes = [...standardAttributes, 'value'];
    // 需要翻译value属性的input按钮类型
    const buttonInputTypes = new Set(['button', 'submit', 'reset']);
    // MutationObserver通用监听配置(关注的属性与常规翻译属性一致)
    const observerOptions = {
        childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: standardAttributes
    };
    // 需要根据DOM上下文覆盖的高歧义短词翻译
    const contextTranslations = [{
        text: 'save',
        selector: 'button, input[type="button"], input[type="submit"], [role="button"], .btn, .button',
        translation: '保存'
    }, {
        text: 'save',
        selector: '.price, .discount, .savings',
        translation: '节省'
    }, {
        text: 'type',
        selector: '[aria-label^="Search or jump to"] [class*="placeholder"], [aria-label^="Search or jump to"] [class*="Placeholder"]',
        translation: '输入 '
    }, {
        text: 'type',
        attr: 'placeholder',
        selector: 'input, textarea, [contenteditable="true"], [role="textbox"]',
        translation: '输入'
    }, {
        text: 'type',
        selector: 'th, [role="columnheader"], [role="rowheader"], label, dt',
        translation: '类型'
    }, {
        text: 'type',
        translation: '类型'
    }];

    // 预编译正则表达式和映射表(避免每次函数调用重建)
    // 匹配相对时间(例如: "2 months ago")
    const timeRegex = /^(\d+)\s+(year|month|week|day|hour|minute|second)s?\s+ago$/i;
    // 时间单位映射
    const unitMap = {
        'year': '年', 'month': '个月', 'week': '周', 'day': '天', 'hour': '小时', 'minute': '分钟', 'second': '秒'
    };
    // GitHub语法高亮类名(避开 pl-1, pl-2 等布局类)
    const plClassRegex = /(?:^|\s)pl-[a-z]/;
    // 匹配文本首尾的非字母部分(数字/符号/空白等)
    const symbolStripRegex = /^([^a-zA-Z]*)(.*[a-zA-Z])([^a-zA-Z]*)$/;
    // 匹配图标类名
    const iconClassRegex = /(?:^|\s)(?:icon|dropdown-icon|material-icons(?:-[a-z]+)?|material-symbols(?:-[a-z]+)?)(?:$|\s)/i;
    // 匹配中文字符(用于判断翻译结果是否为中文)
    const chineseRegex = /[\u4e00-\u9fa5]/;

    /**
     * 检查元素是否应该跳过翻译
     *
     * @param element 要检查的元素
     */
    function shouldSkipElement(element) {
        // 检查元素是否存在且有closest方法(避免空指针异常)
        if (!element || !element.closest) {
            return false;
        }
        // 跳过代码区域(textarea / pre / code / GitHub特有的代码视图类 / 其他常用编辑器)
        if (element.closest(codeSelectorsStr)) {
            return true;
        }
        // GitHub特殊处理
        if (isGitHub) {
            // 跳过不需要翻译的内容
            if (element.closest(githubSkipSelectorsStr)) {
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
                    if (typeof current.className === 'string' && plClassRegex.test(current.className)) {
                        return true;
                    }
                    current = current.parentElement;
                }
            }
            // GitHub不跳过aria-hidden=true的元素
            return false;
        }
        // 跳过包含icon类名的元素(例如material-icons等ligature图标)
        if (element.className && typeof element.className === 'string' && iconClassRegex.test(element.className)) {
            return true;
        }
        // 跳过aria-hidden=true的元素
        return element.getAttribute('aria-hidden') === 'true';
    }

    /**
     * 翻译相对时间字符串(例如: "2 months ago")
     *
     * @param text 要翻译的文本
     */
    function translateRelativeTime(text) {
        const match = text.replace(zeroWidthRegex, '').replace(whitespaceRegex, ' ').trim().match(timeRegex);
        return match ? `${match[1]} ${unitMap[match[2].toLowerCase()]}前` : null;
    }

    /**
     * 剥离文本首尾的非字母部分(数字/符号/空白)后查字典
     *
     * @param text 要翻译的文本
     */
    function translateStripped(text) {
        const normalized = text.replace(zeroWidthRegex, '');
        const match = normalized.match(symbolStripRegex);
        if (match) {
            const lowerCore = match[2].trim().toLowerCase();
            const translated = lowerCaseTranslations.get(lowerCore);
            if (translated !== undefined) {
                return match[1] + translated + match[3];
            }
        }
        return null;
    }

    /**
     * 根据元素上下文覆盖高歧义短词翻译
     *
     * @param normalizedText 已规范化的文本
     * @param element 文本或属性所在元素
     * @param attr 属性名(文本节点为空)
     */
    function lookupContextTranslation(normalizedText, element, attr) {
        if (!element || !element.closest) {
            return null;
        }
        for (const rule of contextTranslations) {
            if (rule.text !== normalizedText || (rule.attr && rule.attr !== attr)) {
                continue;
            }
            if (!rule.selector || element.closest(rule.selector)) {
                return rule.translation;
            }
        }
        return null;
    }

    /**
     * 通用翻译逻辑: 查字典 → 翻译时间 → 剥离符号后查字典
     *
     * @param {string} normalizedText 已规范化的文本
     * @param {string} originalText 原始文本
     * @param {{element?: Element, attr?: string}} context 翻译上下文
     * @returns {string | null} 翻译结果或null
     */
    function lookupText(normalizedText, originalText, context = {}) {
        const contextTranslated = lookupContextTranslation(normalizedText, context.element, context.attr);
        if (contextTranslated !== null) {
            return contextTranslated;
        }
        const translated = lowerCaseTranslations.get(normalizedText);
        if (translated !== undefined) {
            return translated;
        }
        return translateRelativeTime(originalText) || translateStripped(originalText);
    }

    /**
     * 翻译单个节点的文本或属性
     *
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
            let attributes = node.tagName === 'INPUT' && buttonInputTypes.has(node.type) ? inputAttributes : standardAttributes;
            for (const attr of attributes) {
                const value = node.getAttribute(attr);
                if (value) {
                    const newValue = lookupText(normalizeLookupText(value), value, {element: node, attr});
                    if (newValue && newValue !== value) {
                        node.setAttribute(attr, newValue);
                    }
                }
            }
        }
        // 翻译文本节点
        else if (node.nodeType === Node.TEXT_NODE) {
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
            if (!trimmedText) {
                return;
            }
            const translated = lookupText(normalizeLookupText(trimmedText), trimmedText, {element: node.parentElement});
            if (translated && translated !== text) {
                // 保留原始文本的前后空白
                const trimStart = text.indexOf(trimmedText);
                let leadingSpace = text.slice(0, trimStart);
                let trailingSpace = text.slice(trimStart + trimmedText.length);
                // 如果翻译为中文(去除多余的普通空格并保留换行符)
                if (chineseRegex.test(translated)) {
                    leadingSpace = leadingSpace.replace(/[ \t]+/g, '');
                    trailingSpace = trailingSpace.replace(/[ \t]+/g, '');
                }
                node.nodeValue = leadingSpace + translated + trailingSpace;
            }
        }
    }

    /* TreeWalker过滤函数(避免每次walkAndTranslate调用时重建闭包) */
    const treeWalkerFilter = function (node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            if (walkerSkipTags.has(node.tagName.toLowerCase())) {
                return NodeFilter.FILTER_REJECT;
            }
            if (node.matches && node.matches(codeSelectorsStr)) {
                return NodeFilter.FILTER_REJECT;
            }
            if (isGitHub) {
                if (node.matches && node.matches(githubSkipSelectorsStr)) {
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
            if (node.className && typeof node.className === 'string' && iconClassRegex.test(node.className)) {
                return NodeFilter.FILTER_REJECT;
            }
        }
        return NodeFilter.FILTER_ACCEPT;
    };

    /**
     * 遍历指定根节点下的所有节点并应用翻译
     *
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
        // 使用TreeWalker高效遍历(遇到被reject的元素将直接跳过其整个子树)
        const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, treeWalkerFilter);
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
        observer.observe(root, observerOptions);
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
            walkAndTranslate(document.body || document.documentElement);
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

    /* 初始化翻译功能 */
    function initTranslation() {
        if (initialized) {
            return;
        }
        initialized = true;
        // 注入防换行样式(避免翻译后按钮因文字折行而变形)
        const style = document.createElement('style');
        style.textContent = 'button,[type="submit"],[type="button"],[type="reset"],[role="button"]{white-space:nowrap!important}';
        (document.head || document.documentElement).appendChild(style);
        // 立即开始监听DOM变化
        observer.observe(document.documentElement, observerOptions);
        // 初始化翻译根节点(body或html)
        const root = document.body || document.documentElement;
        // 第一次翻译
        walkAndTranslate(root);
        // 延迟翻译(处理SPA框架动态渲染的内容)
        [300, 1000, 2000].forEach(delay => {
            setTimeout(() => walkAndTranslate(document.body || document.documentElement), delay);
        });
        // 监听页面生命周期和GitHub Turbo/PJAX(避免刷新或局部导航后漏翻)
        const retrigger = () => scheduleFullPass(80);
        ['pageshow', 'load'].forEach(event => window.addEventListener(event, retrigger, true));
        document.addEventListener('readystatechange', () => {
            if (document.readyState !== 'loading') {
                retrigger();
            }
        }, true);
        if (isGitHub) {
            ['turbo:load', 'turbo:render', 'pjax:end', 'pjax:success'].forEach(event => {
                document.addEventListener(event, retrigger, true);
            });
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
