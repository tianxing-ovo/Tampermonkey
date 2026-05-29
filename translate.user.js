// ==UserScript==
// @name         网页自动汉化助手
// @description  自动翻译网页中的英文内容为中文
// @icon         https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/translate-icon.png
// @version      1.9.5
// @author       tianxing
// @match        *://*/*
// @resource     translations https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/translations.json
// @grant        GM_getResourceText
// @run-at       document-start
// @license      Apache-2.0
// @namespace    https://greasyfork.org/users/1203191
// @homepageURL  https://github.com/tianxing-ovo/Tampermonkey
// @supportURL   https://github.com/tianxing-ovo/Tampermonkey/issues
// @updateURL    https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/translate.user.js
// @downloadURL  https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/translate.user.js
// ==/UserScript==


(function () {
    'use strict';

    // 从外部资源加载翻译映射表和上下文翻译规则
    // noinspection JSUnresolvedReference
    const rawTranslations = JSON.parse(GM_getResourceText('translations'));
    const translations = rawTranslations.mappings || rawTranslations;
    // 判断是否为GitHub平台
    const isGitHub = location.hostname === 'github.com' || location.hostname.endsWith('.github.com');
    // 匹配空白字符
    const whitespaceRegex = /\s+/g;
    // 匹配零宽字符
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
    const lowerCaseTranslations = new Map(
        Object.entries(translations).map(([key, val]) => [key.trim().toLowerCase(), val])
    );

    // 上下文翻译规则
    /** @type {(*&{text: *|string})[]} */
    const contextTranslations = (rawTranslations.contextRules || []).map(rule => ({
        ...rule,
        text: rule.text ? normalizeLookupText(rule.text) : ''
    }));

    // 代码区域选择器
    const codeSelectors = [
        'pre', 'code',
        '[class*="blob-code"]', '[class*="blob-line"]',
        '[class*="react-code"]', '[class*="react-file"]', '[class*="react-blob"]',
        '.highlight', '.CodeMirror', '.monaco-editor',
        '[data-testid="read-only-cursor-text-area"]', '[data-testid*="code-"]'
    ];
    // GitHub专用屏蔽选择器
    const githubSkipSelectors = [
        'article.markdown-body',
        '.QueryBuilder-StyledInputContent',
        '.react-directory-filename-cell',
        '.react-directory-commit-message',
        '.js-path-segment',
        '.css-truncate-target',
        '[data-testid*="breadcrumbs"]',
        '.QueryBuilder-ListItem .ActionListItem-label',
        '[class*="pl-"]:not([class*="pl-sm"]):not([class*="pl-md"]):not([class*="pl-lg"]):not([class*="pl-xl"]):not([class*="pl-2xl"])'
    ];
    // 动态合并最终需要屏蔽翻译的选择器列表
    const skipSelectorsStr = [...codeSelectors, ...(isGitHub ? githubSkipSelectors : ['.notranslate'])].join(', ');
    // 遍历和翻译时跳过且不再深入的标签类型(保护内部代码/样式/编辑框等)
    const skipTags = new Set(['textarea', 'script', 'style', 'noscript']);
    // 需要常规翻译的DOM元素属性白名单
    const standardAttributes = ['aria-label', 'placeholder', 'mattooltip', 'title', 'data-placeholder', 'data-default-action-text', 'data-comment-text'];
    // 仅针对按钮类input元素扩充的需要翻译的属性白名单(包含value)
    const inputAttributes = standardAttributes.concat('value');
    // 需要翻译value属性的input按钮类型
    const buttonInputTypes = new Set(['button', 'submit', 'reset']);
    // MutationObserver通用监听配置(关注的属性与常规翻译属性一致)
    const observerOptions = {
        childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: standardAttributes
    };
    // 匹配相对时间(例如: "2 months ago")
    const timeRegex = /^(\d+)\s+(year|month|week|day|hour|minute|second)s?\s+ago$/;
    // 时间单位映射
    const unitMap = {
        'year': '年', 'month': '个月', 'week': '周', 'day': '天', 'hour': '小时', 'minute': '分钟', 'second': '秒'
    };
    // 匹配文本首尾的非字母部分(数字/符号/空白等)
    const symbolStripRegex = /^([^a-zA-Z]*)(.*[a-zA-Z])([^a-zA-Z]*)$/;
    // 匹配图标类名
    const iconClassRegex = /(?:^|\s)(?:[a-z0-9_-]*(?<!no-|without-)icon|material-icons(?:-[a-z]+)?|material-symbols(?:-[a-z]+)?)(?:$|\s)/i;
    // 匹配中文字符(用于判断翻译结果是否为中文)
    const chineseRegex = /[\u4e00-\u9fa5]/;

    /**
     * 检查元素是否应该跳过翻译
     *
     * @param element 要检查的元素
     */
    function shouldSkipElement(element) {
        if (!element || !element.closest) {
            return false;
        }
        const className = element.getAttribute('class');
        return !!(element.closest(skipSelectorsStr) ||
            (!isGitHub && element.getAttribute('aria-hidden') === 'true') ||
            (className && iconClassRegex.test(className)));
    }

    /**
     * 检查元素是否为输入框或可编辑区域(且非占位符)
     *
     * @param element 要检查的元素
     */
    function isEditableTextbox(element) {
        return (element.isContentEditable || element.closest('[role="textbox"]')) && !element.closest('[class*="placeholder" i]');
    }

    /**
     * 翻译相对时间字符串(例如: "2 months ago")
     *
     * @param normalizedText 已规范化的文本
     */
    function translateRelativeTime(normalizedText) {
        const match = normalizedText.match(timeRegex);
        return match ? `${match[1]} ${unitMap[match[2]]}前` : null;
    }

    /**
     * 剥离文本首尾的非字母部分(数字/符号/空白)后查字典
     *
     * @param text 要翻译的文本
     */
    function translateStripped(text) {
        const match = text.replace(zeroWidthRegex, '').match(symbolStripRegex);
        if (match) {
            const translated = lowerCaseTranslations.get(match[2].toLowerCase());
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
     * @returns {string | null} 翻译结果或null
     */
    function lookupContextTranslation(normalizedText, element, attr) {
        if (!element || !element.closest) {
            return null;
        }
        const rule = contextTranslations.find(r =>
            r.text === normalizedText &&
            (!r.attr || r.attr === attr) &&
            (!r.selector || element.closest(r.selector))
        );
        return rule ? rule.translation : null;
    }

    /**
     * 通用翻译逻辑: 根据上下文翻译高歧义短词 → 根据词典翻译通用短词 → 翻译相对时间 → 剥离符号后查词典
     *
     * @param {string} normalizedText 已规范化的文本
     * @param {string} originalText 原始文本
     * @param {{element?: Element, attr?: string}} context 翻译上下文
     * @returns {string | null} 翻译结果或null
     */
    function lookupText(normalizedText, originalText, context = {}) {
        return lookupContextTranslation(normalizedText, context.element, context.attr) ??
            lowerCaseTranslations.get(normalizedText) ??
            translateRelativeTime(normalizedText) ??
            translateStripped(originalText);
    }

    /**
     * 翻译单个节点的文本或属性
     *
     * @param node 要翻译的节点
     * @param isSafe 标记该节点已经过验证(无需再调用shouldSkipElement)
     */
    function translateNode(node, isSafe = false) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            if (!isSafe && shouldSkipElement(node)) {
                return;
            }
            const attributes = node.localName === 'input' && buttonInputTypes.has(node.type) ? inputAttributes : standardAttributes;
            for (const attr of attributes) {
                const value = node.getAttribute(attr);
                if (value) {
                    const newValue = lookupText(normalizeLookupText(value), value, { element: node, attr });
                    if (newValue && newValue !== value) {
                        node.setAttribute(attr, newValue);
                    }
                }
            }
        }
        else if (node.nodeType === Node.TEXT_NODE) {
            const parent = node.parentElement;
            if (!isSafe && parent) {
                if (isEditableTextbox(parent) || skipTags.has(parent.localName) || shouldSkipElement(parent)) {
                    return;
                }
            }
            const text = node.nodeValue;
            const trimmedText = text.trim();
            if (!trimmedText) {
                return;
            }
            const translated = lookupText(normalizeLookupText(trimmedText), trimmedText, { element: parent });
            if (translated && translated !== trimmedText) {
                const trimStart = text.indexOf(trimmedText);
                let leadingSpace = text.slice(0, trimStart);
                let trailingSpace = text.slice(trimStart + trimmedText.length);
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
            const className = node.getAttribute('class');
            if (skipTags.has(node.localName) ||
                node.matches(skipSelectorsStr) ||
                (!isGitHub && node.getAttribute('aria-hidden') === 'true') ||
                (className && iconClassRegex.test(className))) {
                return NodeFilter.FILTER_REJECT;
            }
        } else if (node.nodeType === Node.TEXT_NODE) {
            const parent = node.parentElement;
            if (parent && isEditableTextbox(parent)) {
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
        // 过滤需要跳过的根节点
        if (rootNode.nodeType === Node.ELEMENT_NODE && shouldSkipElement(rootNode)) {
            return;
        }
        // 使用TreeWalker高效遍历子树
        const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, treeWalkerFilter);
        // 翻译根节点自己
        translateNode(rootNode, true);
        let node;
        while (node = walker.nextNode()) {
            translateNode(node, true);
            handleShadowRoot(node.shadowRoot);
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
        clearTimeout(fullPassTimer);
        fullPassTimer = setTimeout(() => {
            fullPassTimer = 0;
            walkAndTranslate(document.body || document.documentElement);
        }, delay);
    }

    /* 处理待处理的DOM变化 */
    function processPendingMutations() {
        const mutations = pendingMutations;
        pendingMutations = [];
        rafScheduled = false;
        const processedNodes = new Set();
        for (const mutation of mutations) {
            // 处理属性变化和文本内容变化
            if (mutation.type === 'attributes' || mutation.type === 'characterData') {
                if (!processedNodes.has(mutation.target)) {
                    processedNodes.add(mutation.target);
                    translateNode(mutation.target);
                    handleShadowRoot(mutation.target.shadowRoot);
                }
            }
            // 处理新增节点
            else if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (!processedNodes.has(node)) {
                        processedNodes.add(node);
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // 遍历并翻译新增元素
                            walkAndTranslate(node);
                            handleShadowRoot(node.shadowRoot);
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
        // 延迟翻译(兜底处理部分框架延迟渲染的内容)
        scheduleFullPass(1500);
        // 监听页面生命周期和GitHub Turbo/PJAX(避免刷新或局部导航后漏翻)
        const retrigger = () => scheduleFullPass(80);
        ['pageshow', 'load'].forEach(event => window.addEventListener(event, retrigger, true));
        document.addEventListener('readystatechange', () => document.readyState !== 'loading' && retrigger(), true);
        if (isGitHub) {
            ['turbo:load', 'turbo:render', 'pjax:end', 'pjax:success'].forEach(event => document.addEventListener(event, retrigger, true));
        }
    }

    // 尽早执行翻译(不等待DOMContentLoaded)
    if (document.body) {
        // body已存在(立即执行)
        initTranslation();
    } else {
        // body还未创建(等待其创建)
        new MutationObserver((_, obs) => {
            if (document.body) {
                obs.disconnect();
                initTranslation();
            }
        }).observe(document.documentElement, {childList: true});
    }
})();
