// ==UserScript==
// @name         语雀文档助手
// @namespace    https://greasyfork.org/users/1203191
// @version      0.1.1
// @description  语雀文档体验增强
// @author       tianxing-ovo
// @icon         https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/yuque-plus-icon.png
// @match        *://*.yuque.com/*
// @run-at       document-idle
// @grant        none
// @license      Apache-2.0
// @homepageURL  https://github.com/tianxing-ovo/Tampermonkey
// @supportURL   https://github.com/tianxing-ovo/Tampermonkey/issues
// ==/UserScript==

(function () {
    'use strict';

    let previousPath = location.pathname;
    let hasFolded = false;

    /* 折叠大纲 */
    function collapseOutline() {
        if (hasFolded) {
            return;
        }
        // 查找大纲的全部折叠按钮
        const foldButton = document.querySelector('[data-name="toc-fold"], .ne-icon-toc-fold');
        if (foldButton) {
            hasFolded = true;
            // 触发点击
            foldButton.click();
        }
    }

    /* 监听页面变动与单页应用路由跳转 */
    function startObserver() {
        const observer = new MutationObserver(() => {
            if (location.pathname !== previousPath) {
                previousPath = location.pathname;
                hasFolded = false;
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
})();
