// ==UserScript==
// @name         语雀文档助手
// @namespace    https://greasyfork.org/users/1203191
// @version      0.1.3
// @description  语雀文档体验增强
// @author       tianxing-ovo
// @icon         https://fastly.jsdelivr.net/gh/tianxing-ovo/Tampermonkey@master/yuque-plus-icon.png
// @match        *://*.yuque.com/*
// @run-at       document-idle
// @grant        none
// @license      Apache-2.0
// @homepageURL  https://github.com/tianxing-ovo/Tampermonkey
// @supportURL   https://github.com/tianxing-ovo/Tampermonkey/issues
// ==/UserScript==

(function () {
    'use strict';

    const TOC_FOLD_SELECTOR = '[data-name="toc-fold"]';
    let previousPath = location.pathname;
    let hasFolded = false;
    let lastFoldButton = null;

    /* 折叠大纲 */
    function collapseOutline() {
        if (hasFolded) {
            return;
        }
        // 查找大纲的全部折叠按钮
        const foldButton = document.querySelector(TOC_FOLD_SELECTOR);
        if (foldButton && foldButton !== lastFoldButton) {
            hasFolded = true;
            lastFoldButton = foldButton;
            // 触发点击
            foldButton.click();
        }
    }

    /* 监听编辑与更新按钮点击 */
    function listenModeButtons() {
        document.addEventListener('click', (event) => {
            const button = event.target.closest('button');
            const text = button?.textContent?.trim();
            if (text === '编辑' || text === '更新') {
                hasFolded = false;
                lastFoldButton = document.querySelector(TOC_FOLD_SELECTOR);
            }
        }, true);
    }

    /* 监听页面变动与单页应用路由跳转 */
    function startObserver() {
        const observer = new MutationObserver(() => {
            if (location.pathname !== previousPath) {
                previousPath = location.pathname;
                hasFolded = false;
                lastFoldButton = null;
            }
            if (!hasFolded) {
                collapseOutline();
            }
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // 启动监听
    startObserver();
    listenModeButtons();
})();
