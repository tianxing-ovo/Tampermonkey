// ==UserScript==
// @name         媒体嗅探器
// @namespace    https://greasyfork.org/users/1203191
// @version      1.0.1
// @description  嗅探媒体资源并下载
// @author       tianxing-ovo
// @icon         https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/media-sniffer-icon.png
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @license      Apache-2.0
// @homepageURL  https://github.com/tianxing-ovo/Tampermonkey
// @supportURL   https://github.com/tianxing-ovo/Tampermonkey/issues
// @updateURL    https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/media-sniffer.user.js
// @downloadURL  https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/media-sniffer.user.js
// ==/UserScript==

/* global GM_download, GM_xmlhttpRequest, GM_setClipboard, GM_getValue, GM_setValue */

(function () {
    'use strict';

    // 避免在嵌套子框架中重复注入悬浮按钮
    if (window.self !== window.top) return;

    // 存储所有已嗅探到的图片对象集合
    const imageStore = new Map();
    let isModalOpen = false;
    let selectedImages = new Set();
    let enableDeduplication = true;
    let knownFormats = new Set();
    let activeFormatFilters = new Set();

    // 离线复用的微型指纹计算画布
    const calcCanvas = document.createElement('canvas');
    calcCanvas.width = 9;
    calcCanvas.height = 8;
    const calcCtx = calcCanvas.getContext('2d', { willReadFrequently: true });

    // 计算图片的差异哈希指纹以用于智能去重
    function calculateDHash(imgEl) {
        try {
            calcCtx.clearRect(0, 0, 9, 8);
            calcCtx.drawImage(imgEl, 0, 0, 9, 8);
            const data = calcCtx.getImageData(0, 0, 9, 8).data;
            const grays = [];
            for (let i = 0; i < data.length; i += 4) {
                grays.push(Math.floor(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114));
            }
            let hashBinary = '';
            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    hashBinary += (grays[row * 9 + col] > grays[row * 9 + col + 1] ? '1' : '0');
                }
            }
            let hex = '';
            for (let i = 0; i < 64; i += 4) {
                hex += parseInt(hashBinary.substring(i, i + 4), 2).toString(16);
            }
            return hex;
        } catch (e) {
            // 遇到跨域限制时回退为宽高尺寸与路径特征哈希
            return `dim_${imgEl.naturalWidth || 0}x${imgEl.naturalHeight || 0}`;
        }
    }

    // 清洗并升级主流图床为最高清原图地址
    function upgradeToHdUrl(url) {
        if (!url || typeof url !== 'string') return url;
        if (url.startsWith('data:') || url.startsWith('blob:')) return url;
        
        let hdUrl = url;
        hdUrl = hdUrl.replace(/!(small|thumb|preview|middle|large|webp|\d+w|\d+h).*/i, '');
        hdUrl = hdUrl.replace(/@\d+[wh]_\d+[wh].*/i, '');
        hdUrl = hdUrl.replace(/_(thumb|small|preview)\.(jpg|png|jpeg|webp)/i, '.$2');
        hdUrl = hdUrl.replace(/\/thumb\/\d+\//i, '/original/');
        hdUrl = hdUrl.replace(/\.webp$/i, '.jpg');
        return hdUrl;
    }

    // 从任意字符串中提取规范的绝对网络链接
    function normalizeUrl(url) {
        if (!url || typeof url !== 'string') return '';
        url = url.trim().replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
        if (!url || url === 'undefined' || url === 'null' || url.includes('/undefined') || url.includes('/null') || url.includes('[object')) {
            return '';
        }
        if (url.startsWith('//')) {
            url = window.location.protocol + url;
        } else if (url.startsWith('/')) {
            url = window.location.origin + url;
        } else if (!url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('blob:')) {
            try {
                url = new URL(url, window.location.href).href;
            } catch (e) {
                return '';
            }
        }
        return url;
    }

    // 通过二进制魔数特征精准推导真实图片格式
    function detectFormatFromBytes(bytes) {
        if (!bytes || bytes.length < 12) return '';
        // 识别 PNG 文件魔数
        if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'PNG';
        // 识别 JPEG 文件魔数
        if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'JPG';
        // 识别 WEBP 文件魔数
        if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
            bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'WEBP';
        // 识别 GIF 文件魔数
        if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'GIF';
        // 识别 SVG 文本特征
        if (bytes[0] === 0x3c) {
            const head = String.fromCharCode(...bytes.slice(0, 100)).toLowerCase();
            if (head.includes('<svg') || head.includes('<?xml')) return 'SVG';
        }
        return '';
    }

    // 使用油猴无跨域限制接口拉取图片计算二进制唯一指纹与真实格式
    function fetchBinaryFingerprint(url) {
        return new Promise((resolve) => {
            if (!url || url.startsWith('data:') || url.startsWith('blob:')) {
                resolve({ hash: '', format: '' });
                return;
            }
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    responseType: 'arraybuffer',
                    headers: { 'Referer': window.location.href },
                    onload: (res) => {
                        if (res.status >= 200 && res.status < 300 && res.response) {
                            const bytes = new Uint8Array(res.response);
                            let h = 0x811c9dc5;
                            for (let i = 0; i < bytes.length; i++) {
                                h ^= bytes[i];
                                h = (h * 0x01000193) >>> 0;
                            }
                            const hash = `bin_${bytes.length}_${h.toString(16)}`;
                            const realFormat = detectFormatFromBytes(bytes);
                            resolve({ hash: hash, format: realFormat });
                        } else {
                            resolve({ hash: '', format: '' });
                        }
                    },
                    onerror: () => resolve({ hash: '', format: '' })
                });
            } else {
                resolve({ hash: '', format: '' });
            }
        });
    }

    // 根据图片链接推断格式类型
    function detectFormat(url) {
        if (url.startsWith('data:image/svg')) return 'SVG';
        if (url.startsWith('data:image/png')) return 'PNG';
        if (url.startsWith('data:image/jpeg') || url.startsWith('data:image/jpg')) return 'JPG';
        if (url.startsWith('data:image/webp')) return 'WEBP';
        if (url.startsWith('data:')) return 'DATA';
        
        const cleanUrl = url.split('?')[0].toLowerCase();
        const queryStr = (url.split('?')[1] || '').toLowerCase();
        if (cleanUrl.endsWith('.png') || queryStr.includes('format=png') || queryStr.includes('f=png')) return 'PNG';
        if (cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg') || queryStr.includes('format=jpg') || queryStr.includes('f=jpg')) return 'JPG';
        if (cleanUrl.endsWith('.webp') || queryStr.includes('format=webp') || queryStr.includes('f=webp')) return 'WEBP';
        if (cleanUrl.endsWith('.svg') || queryStr.includes('format=svg') || queryStr.includes('f=svg')) return 'SVG';
        if (cleanUrl.endsWith('.gif') || queryStr.includes('format=gif') || queryStr.includes('f=gif')) return 'GIF';
        if (cleanUrl.endsWith('.avif') || queryStr.includes('format=avif') || queryStr.includes('f=avif')) return 'AVIF';
        return 'JPG';
    }

    // 动态刷新卡片上的真实格式标签
    function updateCardFormatDisplay(item) {
        const cards = shadow.querySelectorAll('.img-card');
        cards.forEach(card => {
            if (card.dataset.url === item.url) {
                const badge = card.querySelector('.img-format-badge');
                if (badge) badge.textContent = item.format;
            }
        });
    }

    // 将图片添加到全局存储并异步获取其真实分辨率
    function registerImage(rawUrl, source = 'DOM') {
        const url = normalizeUrl(rawUrl);
        if (!url || url.length < 5) return;
        if (url.startsWith('data:image/') && url.length < 150) return;
        if (imageStore.has(url)) return;

        const format = detectFormat(url);
        if (format && !knownFormats.has(format)) {
            knownFormats.add(format);
            activeFormatFilters.add(format);
        }

        const imgObj = {
            url: url,
            hdUrl: upgradeToHdUrl(url),
            format: format,
            source: source,
            width: 0,
            height: 0,
            hash: '',
            loaded: false
        };

        imageStore.set(url, imgObj);

        // 异步预加载图片以获取真实自然宽高尺寸
        const tempImg = new Image();
        tempImg.onload = function () {
            imgObj.width = tempImg.naturalWidth || tempImg.width || 0;
            imgObj.height = tempImg.naturalHeight || tempImg.height || 0;
            if (imgObj.width > 0 && imgObj.height > 0 && !imgObj.hash) {
                imgObj.hash = calculateDHash(tempImg);
            }
            imgObj.loaded = true;
            updateFloatingBadge();
            if (isModalOpen && enableDeduplication) {
                renderGallery();
            }
        };
        tempImg.onerror = function () {
            imgObj.loaded = true;
            updateFloatingBadge();
        };
        tempImg.src = url;

        // 异步计算二进制指纹以实现跨域无障碍百分百精准去重与格式矫正
        fetchBinaryFingerprint(url).then(info => {
            if (info.format && info.format !== imgObj.format) {
                imgObj.format = info.format;
                if (!knownFormats.has(info.format)) {
                    knownFormats.add(info.format);
                    activeFormatFilters.add(info.format);
                }
                if (isModalOpen) updateCardFormatDisplay(imgObj);
            }
            if (info.hash) {
                imgObj.hash = info.hash;
                if (isModalOpen && enableDeduplication) {
                    renderGallery();
                }
            }
            updateFloatingBadge();
        });
    }

    // 深度扫描当前文档中的所有图片元素
    function scanPageImages() {
        // 扫描标准图片标签及其懒加载常用属性
        const imgElements = document.querySelectorAll('img, picture source, image');
        imgElements.forEach(el => {
            const possibleAttrs = [
                'src', 'data-src', 'data-original', 'data-lazy-src', 'data-actualsrc',
                'data-url', 'zoomfile', 'file', 'original', 'srcset', 'xlink:href', 'href'
            ];
            for (const attr of possibleAttrs) {
                const val = el.getAttribute(attr);
                if (val) {
                    if (attr === 'srcset') {
                        const parts = val.split(',');
                        parts.forEach(p => {
                            const u = p.trim().split(/\s+/)[0];
                            if (u) registerImage(u, 'IMG-SRCSET');
                        });
                    } else {
                        registerImage(val, 'IMG');
                    }
                }
            }
        });

        // 扫描带有背景样式的容器元素
        const allNodes = document.querySelectorAll('div, section, article, a, span, header, footer, li, figure');
        allNodes.forEach(node => {
            const bg = window.getComputedStyle(node).backgroundImage;
            if (bg && bg !== 'none' && bg.includes('url(')) {
                const matches = bg.match(/url\(["']?([^"']+)["']?\)/g);
                if (matches) {
                    matches.forEach(m => {
                        const clean = m.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
                        registerImage(clean, 'CSS-BG');
                    });
                }
            }
        });

        // 扫描并导出画布内容
        const canvases = document.querySelectorAll('canvas');
        canvases.forEach(cvs => {
            try {
                if (cvs.width > 50 && cvs.height > 50) {
                    const dataUrl = cvs.toDataURL('image/png');
                    registerImage(dataUrl, 'CANVAS');
                }
            } catch (e) {}
        });

        updateFloatingBadge();
    }

    // 挂载动态观察器实时捕获瀑布流滚动加载的新图片
    function setupDynamicObserver() {
        let timer = null;
        const observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(scanPageImages, 400);
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'style', 'class'] });
        window.addEventListener('scroll', () => {
            clearTimeout(timer);
            timer = setTimeout(scanPageImages, 500);
        }, { passive: true });
    }

    // 创建独立沙箱节点防止网页既有样式污染扩展界面
    const container = document.createElement('div');
    container.id = 'ag-img-sniffer-root';
    document.documentElement.appendChild(container);
    const shadow = container.attachShadow({ mode: 'open' });

    // 注入浅色现代化视觉样式表
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        :host, :root {
            --primary: #4f46e5;
            --primary-hover: #4338ca;
            --bg-glass: rgba(255, 255, 255, 0.95);
            --card-glass: rgba(255, 255, 255, 0.9);
            --border-glass: rgba(226, 232, 240, 0.9);
            --text-main: #0f172a;
            --text-muted: #64748b;
            --accent: #10b981;
            --danger: #ef4444;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 14px;
            color: var(--text-main);
            box-sizing: border-box;
            z-index: 2147483647;
            position: relative;
        }
        *, *::before, *::after { box-sizing: inherit; }

        /* 悬浮球控件 */
        .fab-trigger {
            position: fixed;
            bottom: 28px;
            right: 28px;
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: linear-gradient(135deg, #4f46e5, #7c3aed);
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: grab;
            box-shadow: 0 10px 25px -5px rgba(79, 70, 229, 0.4), 0 8px 10px -6px rgba(79, 70, 229, 0.3);
            border: 2px solid #fff;
            backdrop-filter: blur(12px);
            transition: transform 0.2s, box-shadow 0.2s;
            user-select: none;
            touch-action: none;
            z-index: 2147483647;
        }
        .fab-trigger:active, .fab-trigger.dragging {
            cursor: grabbing;
            transform: scale(0.96);
            transition: none;
        }
        .fab-trigger:hover:not(.dragging) {
            transform: scale(1.08) translateY(-2px);
            box-shadow: 0 15px 30px -5px rgba(79, 70, 229, 0.5);
        }
        .fab-icon { width: 26px; height: 26px; fill: currentColor; }
        .fab-badge {
            position: absolute;
            top: -4px;
            right: -4px;
            background: var(--danger);
            color: #fff;
            font-size: 11px;
            font-weight: 700;
            padding: 2px 7px;
            border-radius: 12px;
            border: 2px solid #fff;
            min-width: 20px;
            text-align: center;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
            animation: badgePop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        @keyframes badgePop {
            0% { transform: scale(0); }
            80% { transform: scale(1.2); }
            100% { transform: scale(1); }
        }

        /* 模态弹窗遮罩与主面板 */
        .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.45);
            backdrop-filter: blur(6px);
            z-index: 2147483646;
            display: none;
            flex-direction: column;
            opacity: 0;
            transition: opacity 0.25s ease;
        }
        .modal-overlay.active {
            display: flex;
            opacity: 1;
        }

        /* 顶部标题栏与导航 */
        .modal-header {
            height: 64px;
            background: var(--bg-glass);
            border-bottom: 1px solid var(--border-glass);
            backdrop-filter: blur(16px);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 24px;
            flex-shrink: 0;
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
        }
        .header-title {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 18px;
            font-weight: 700;
            color: var(--text-main);
            letter-spacing: 0.3px;
        }
        .header-title svg { width: 22px; height: 22px; fill: var(--primary); }
        .header-selected-count {
            font-size: 13px;
            color: var(--text-muted);
            font-weight: normal;
        }
        .header-dedup-stat {
            font-size: 12px;
            color: var(--primary);
            font-weight: 600;
            margin-left: 4px;
        }

        /* 顶部操作区 */
        .header-actions {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }
        .btn {
            background: #ffffff;
            color: #334155;
            border: 1px solid #cbd5e1;
            padding: 7px 14px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s;
            box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }
        .btn:hover {
            background: #f1f5f9;
            border-color: #94a3b8;
            color: #0f172a;
        }
        .btn-primary {
            background: var(--primary);
            border-color: transparent;
            color: #fff;
            box-shadow: 0 2px 4px rgba(79, 70, 229, 0.2);
        }
        .btn-primary:hover {
            background: var(--primary-hover);
            color: #fff;
        }
        .btn-download-selected {
            background: #0284c7;
        }
        .btn-download-selected:hover {
            background: #0369a1;
        }
        .btn-close {
            background: transparent;
            border: none;
            color: var(--text-muted);
            padding: 6px;
            cursor: pointer;
            border-radius: 6px;
        }
        .btn-close:hover { color: var(--text-main); background: #e2e8f0; }

        /* 筛选与过滤工具条 */
        .filter-bar {
            background: #f8fafc;
            border-bottom: 1px solid var(--border-glass);
            padding: 10px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 20px;
            flex-wrap: wrap;
            font-size: 13px;
            color: #475569;
        }
        .filter-group {
            display: flex;
            align-items: center;
            gap: 14px;
            flex-wrap: wrap;
        }
        .filter-item {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .filter-checkbox {
            cursor: pointer;
            accent-color: var(--primary);
        }
        .filter-format-container {
            display: inline-flex;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
        }
        .format-count {
            font-size: inherit;
            color: var(--text-muted);
        }

        /* 瀑布流画廊主体 */
        .modal-body {
            flex: 1;
            overflow-y: auto;
            padding: 20px 24px;
            background: #f1f5f9;
        }
        .gallery-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
            gap: 18px;
        }

        /* 图片卡片 */
        .img-card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            overflow: hidden;
            position: relative;
            display: flex;
            flex-direction: column;
            transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
            cursor: pointer;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }
        .img-card:hover {
            transform: translateY(-3px);
            border-color: rgba(79, 70, 229, 0.4);
            box-shadow: 0 10px 20px rgba(0, 0, 0, 0.08);
        }
        .img-card.selected {
            border-color: var(--primary);
            box-shadow: 0 0 0 2px var(--primary);
        }
        .img-thumb-wrapper {
            width: 100%;
            height: 180px;
            background: repeating-conic-gradient(#f8fafc 0% 25%, #ffffff 0% 50%) 50% / 16px 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
            border-bottom: 1px solid #f1f5f9;
        }
        .img-thumb {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            transition: transform 0.3s;
        }
        .img-card:hover .img-thumb {
            transform: scale(1.05);
        }

        /* 卡片上层标签与勾选器 */
        .img-select-overlay {
            position: absolute;
            top: 8px;
            left: 8px;
            width: 22px;
            height: 22px;
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.9);
            border: 1px solid #cbd5e1;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .img-card.selected .img-select-overlay {
            background: var(--primary);
            border-color: var(--primary);
        }
        .img-select-check {
            display: none;
            width: 14px;
            height: 14px;
            fill: #fff;
        }
        .img-card.selected .img-select-check { display: block; }

        .img-format-badge {
            position: absolute;
            top: 8px;
            right: 8px;
            background: rgba(255, 255, 255, 0.95);
            border: 1px solid #e2e8f0;
            color: #0284c7;
            font-size: 10px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 6px;
            text-transform: uppercase;
            box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }

        /* 卡片底部信息条 */
        .img-meta {
            padding: 10px 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #ffffff;
            border-top: 1px solid #f1f5f9;
            font-size: 12px;
        }
        .img-dim {
            color: var(--text-muted);
            font-family: monospace;
        }

        /* 进度提示浮层 */
        .toast-notify {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(15, 23, 42, 0.9);
            color: #fff;
            padding: 10px 20px;
            border-radius: 10px;
            border: 1px solid rgba(255,255,255,0.1);
            box-shadow: 0 10px 30px rgba(0,0,0,0.25);
            z-index: 2147483647;
            display: none;
            align-items: center;
            gap: 10px;
            font-size: 13px;
        }
        .toast-notify.active { display: flex; animation: toastIn 0.2s ease; }
        @keyframes toastIn { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
    `;
    shadow.appendChild(styleEl);

    // 构建界面 DOM 结构
    const fab = document.createElement('div');
    fab.className = 'fab-trigger';
    fab.title = '打开媒体嗅探器';
    fab.innerHTML = `
        <svg class="fab-icon" viewBox="0 0 24 24">
            <path d="M12 15c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm0-8c2.76 0 5 2.24 5 5s-2.24 5-5 5-5-2.24-5-5 2.24-5 5-5zm0-4C6.48 3 2 7.48 2 13c0 3.7 2.01 6.92 4.99 8.65l1.35-2.32C6.16 18.02 5 15.65 5 13c0-3.87 3.13-7 7-7s7 3.13 7 7c0 2.65-1.16 5.02-3.34 6.33l1.35 2.32C20 19.92 22 16.7 22 13c0-5.52-4.48-10-10-10z"/>
        </svg>
        <span class="fab-badge" id="ag-badge">0</span>
    `;
    shadow.appendChild(fab);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-header">
            <div class="header-title">
                <svg viewBox="0 0 24 24"><path d="M12 15c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm0-8c2.76 0 5 2.24 5 5s-2.24 5-5 5-5-2.24-5-5 2.24-5 5-5zm0-4C6.48 3 2 7.48 2 13c0 3.7 2.01 6.92 4.99 8.65l1.35-2.32C6.16 18.02 5 15.65 5 13c0-3.87 3.13-7 7-7s7 3.13 7 7c0 2.65-1.16 5.02-3.34 6.33l1.35 2.32C20 19.92 22 16.7 22 13c0-5.52-4.48-10-10-10z"/></svg>
                <span>媒体嗅探器</span>
                <span id="ag-selected-count" class="header-selected-count">(已选中 0 张)</span>
                <span id="ag-dedup-stat" class="header-dedup-stat"></span>
            </div>
            <div class="header-actions">
                <button class="btn" id="ag-btn-toggle-select">全选</button>
                <button class="btn" id="ag-btn-copy-links">复制链接</button>
                <button class="btn btn-primary btn-download-selected" id="ag-btn-download-selected">下载</button>
                <button class="btn btn-primary" id="ag-btn-download-zip">下载并打包</button>
                <button class="btn-close" id="ag-btn-close">
                    <svg style="width:20px;height:20px;fill:currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
            </div>
        </div>

        <div class="filter-bar">
            <div class="filter-group">
                <div class="filter-format-container" id="ag-format-checkboxes"></div>
                <label class="filter-item filter-dedup-label"><input type="checkbox" id="ag-filter-dedup" checked> 智能去重</label>
            </div>
        </div>

        <div class="modal-body">
            <div class="gallery-grid" id="ag-gallery"></div>
        </div>
    `;
    shadow.appendChild(modal);

    const toast = document.createElement('div');
    toast.className = 'toast-notify';
    shadow.appendChild(toast);

    function showToast(msg, duration = 2500) {
        toast.textContent = msg;
        toast.classList.add('active');
        setTimeout(() => toast.classList.remove('active'), duration);
    }

    function updateFloatingBadge() {
        const badge = shadow.getElementById('ag-badge');
        if (badge) {
            badge.textContent = String(getFilteredImages().length);
        }
    }

    // 动态统计当前页面存在的所有格式并更新筛选复选框
    function renderFormatFilters() {
        const container = shadow.getElementById('ag-format-checkboxes');
        if (!container) return;

        const formatCounts = new Map();
        imageStore.forEach(item => {
            const fmt = item.format || 'OTHER';
            formatCounts.set(fmt, (formatCounts.get(fmt) || 0) + 1);
        });

        if (formatCounts.size === 0) {
            container.innerHTML = '<span class="format-count">暂无格式</span>';
            return;
        }

        formatCounts.forEach((_, fmt) => {
            if (!knownFormats.has(fmt)) {
                knownFormats.add(fmt);
                activeFormatFilters.add(fmt);
            }
        });

        let html = '';
        formatCounts.forEach((count, fmt) => {
            const isChecked = activeFormatFilters.has(fmt) ? 'checked' : '';
            html += `<label class="filter-item"><input type="checkbox" class="filter-format-checkbox" value="${fmt}" ${isChecked}> ${fmt}<span class="format-count">（${count}）</span></label>`;
        });
        container.innerHTML = html;

        container.querySelectorAll('.filter-format-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                if (cb.checked) {
                    activeFormatFilters.add(cb.value);
                } else {
                    activeFormatFilters.delete(cb.value);
                }
                renderGallery();
            });
        });
    }

    // 获取经过多维筛选条件过滤后的图片列表
    function getFilteredImages() {
        const result = [];
        const seenHashes = new Set();
        let dupCount = 0;

        imageStore.forEach(item => {
            if (knownFormats.has(item.format) && !activeFormatFilters.has(item.format)) return;

            // 智能去重过滤逻辑
            if (enableDeduplication && item.hash) {
                if (seenHashes.has(item.hash)) {
                    dupCount++;
                    return;
                }
                seenHashes.add(item.hash);
            }

            result.push(item);
        });

        updateDeduplicationStat(dupCount);
        return result;
    }

    // 更新去重统计信息文字显示
    function updateDeduplicationStat(dupCount) {
        const el = shadow.getElementById('ag-dedup-stat');
        if (el) {
            el.textContent = (enableDeduplication && dupCount > 0) ? `(已智能去重 ${dupCount} 张)` : '';
        }
    }

    // 渲染图片网格画廊列表
    function renderGallery() {
        renderFormatFilters();
        const gallery = shadow.getElementById('ag-gallery');
        if (!gallery) return;

        const filtered = getFilteredImages();
        gallery.innerHTML = '';

        if (filtered.length === 0) {
            gallery.innerHTML = '<div class="gallery-empty">当前筛选条件下没有匹配的图片</div>';
            return;
        }

        filtered.forEach(item => {
            const card = document.createElement('div');
            card.dataset.url = item.url;
            card.className = 'img-card' + (selectedImages.has(item.url) ? ' selected' : '');
            
            const dimText = (item.width && item.height) ? `${item.width} × ${item.height}` : '加载中...';
            
            card.innerHTML = `
                <div class="img-thumb-wrapper">
                    <img class="img-thumb" src="${item.url}" alt="thumb" loading="lazy">
                    <div class="img-select-overlay">
                        <svg class="img-select-check" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    </div>
                    <span class="img-format-badge">${item.format}</span>
                </div>
                <div class="img-meta">
                    <span class="img-dim">${dimText}</span>
                </div>
            `;

            // 当缩略图加载就绪时直接提取真实宽高与指纹并就地刷新显示
            const imgEl = card.querySelector('.img-thumb');
            const dimSpan = card.querySelector('.img-dim');
            function onThumbLoad() {
                if (imgEl && imgEl.naturalWidth && imgEl.naturalHeight) {
                    item.width = imgEl.naturalWidth;
                    item.height = imgEl.naturalHeight;
                    if (!item.hash) {
                        item.hash = calculateDHash(imgEl);
                    }
                    if (dimSpan) dimSpan.textContent = `${item.width} × ${item.height}`;
                }
            }
            if (imgEl && imgEl.complete && imgEl.naturalWidth) {
                onThumbLoad();
            } else if (imgEl) {
                imgEl.addEventListener('load', onThumbLoad);
            }

            // 点击卡片切换选中状态
            card.addEventListener('click', () => {
                if (selectedImages.has(item.url)) {
                    selectedImages.delete(item.url);
                    card.classList.remove('selected');
                } else {
                    selectedImages.add(item.url);
                    card.classList.add('selected');
                }
                updateSelectedCount();
            });

            gallery.appendChild(card);
        });

        updateSelectedCount();
        updateFloatingBadge();
    }

    function updateSelectedCount() {
        const el = shadow.getElementById('ag-selected-count');
        if (el) el.textContent = `(已选中 ${selectedImages.size} 张)`;

        const toggleBtn = shadow.getElementById('ag-btn-toggle-select');
        if (toggleBtn) {
            const filtered = getFilteredImages();
            const isAllSelected = filtered.length > 0 && filtered.every(item => selectedImages.has(item.url));
            toggleBtn.textContent = isAllSelected ? '取消全选' : '全选';
        }
    }

    // 单张图片原生极速下载
    function downloadSingleImage(item) {
        const fileName = `image_${Date.now()}.${item.format.toLowerCase()}`;
        if (typeof GM_download === 'function' && !item.url.startsWith('data:')) {
            GM_download({
                url: item.hdUrl || item.url,
                name: fileName,
                saveAs: false
            });
        } else {
            const a = document.createElement('a');
            a.href = item.url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
        showToast('已开始下载单张图片');
    }

    // 逐张下载选中的图片到本地设备
    function downloadSelectedDirectly() {
        if (selectedImages.size === 0) {
            showToast('请先勾选需要下载的图片');
            return;
        }
        const list = Array.from(selectedImages);
        showToast(`已开始下载 ${list.length} 张图片`);
        list.forEach((url, idx) => {
            setTimeout(() => {
                const item = imageStore.get(url) || { url: url, format: detectFormat(url) };
                downloadSingleImage(item);
            }, idx * 200);
        });
    }

    // 跨域拉取二进制数据并封装为 Promise
    function fetchBinary(url) {
        return new Promise((resolve, reject) => {
            if (url.startsWith('data:')) {
                const parts = url.split(',');
                const byteString = atob(parts[1]);
                const mimeString = parts[0].split(':')[1].split(';')[0];
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) {
                    ia[i] = byteString.charCodeAt(i);
                }
                resolve({ data: ab, format: mimeString.split('/')[1] || 'png' });
                return;
            }

            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    responseType: 'arraybuffer',
                    headers: { 'Referer': window.location.href },
                    onload: (res) => {
                        if (res.status >= 200 && res.status < 300) {
                            resolve({ data: res.response, format: detectFormat(url) });
                        } else {
                            reject(new Error('HTTP status ' + res.status));
                        }
                    },
                    onerror: () => reject(new Error('Network error'))
                });
            } else {
                fetch(url)
                    .then(res => res.arrayBuffer())
                    .then(ab => resolve({ data: ab, format: detectFormat(url) }))
                    .catch(reject);
            }
        });
    }

    // 快速生成 CRC32 校验码查找表
    const crc32Table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
            // noinspection JSBitwiseOperatorUsage
            c = (c & 1) ? (3988292384 ^ (c >>> 1)) : (c >>> 1);
        }
        crc32Table[i] = c;
    }

    // 计算二进制数据的 CRC32 校验值
    function calculateCrc32(bytes) {
        let crc = ~0 >>> 0;
        for (let i = 0; i < bytes.length; i++) {
            // noinspection JSBitwiseOperatorUsage
            crc = crc32Table[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
        }
        return (~crc) >>> 0;
    }

    // 原生轻量零依赖 ZIP 打包引擎
    function createZipArchive(files) {
        const encoder = new TextEncoder();
        const parts = [];
        const centralEntries = [];
        let offset = 0;

        for (const file of files) {
            const nameBytes = encoder.encode(file.name);
            const dataBytes = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
            const crc = calculateCrc32(dataBytes);
            const size = dataBytes.length;

            // 写入局部文件头结构
            const localHeader = new Uint8Array(30 + nameBytes.length);
            const view = new DataView(localHeader.buffer);
            view.setUint32(0, 67324752, true);
            view.setUint16(4, 20, true);
            view.setUint16(6, 0, true);
            view.setUint16(8, 0, true);
            view.setUint16(10, 0, true);
            view.setUint16(12, 0, true);
            view.setUint32(14, crc, true);
            view.setUint32(18, size, true);
            view.setUint32(22, size, true);
            view.setUint16(26, nameBytes.length, true);
            view.setUint16(28, 0, true);
            localHeader.set(nameBytes, 30);

            parts.push(localHeader);
            parts.push(dataBytes);

            // 写入中心目录记录结构
            const centralEntry = new Uint8Array(46 + nameBytes.length);
            const cView = new DataView(centralEntry.buffer);
            cView.setUint32(0, 33639248, true);
            cView.setUint16(4, 20, true);
            cView.setUint16(6, 20, true);
            cView.setUint16(8, 0, true);
            cView.setUint16(10, 0, true);
            cView.setUint16(12, 0, true);
            cView.setUint16(14, 0, true);
            cView.setUint32(16, crc, true);
            cView.setUint32(20, size, true);
            cView.setUint32(24, size, true);
            cView.setUint16(28, nameBytes.length, true);
            cView.setUint16(30, 0, true);
            cView.setUint16(32, 0, true);
            cView.setUint16(34, 0, true);
            cView.setUint16(36, 0, true);
            cView.setUint32(38, 0, true);
            cView.setUint32(42, offset, true);
            centralEntry.set(nameBytes, 46);

            centralEntries.push(centralEntry);
            offset += localHeader.length + dataBytes.length;
        }

        const centralDirOffset = offset;
        let centralDirSize = 0;
        for (const entry of centralEntries) {
            parts.push(entry);
            centralDirSize += entry.length;
        }

        // 写入中心目录结尾结构
        const endRecord = new Uint8Array(22);
        const endView = new DataView(endRecord.buffer);
        endView.setUint32(0, 101010256, true);
        endView.setUint16(4, 0, true);
        endView.setUint16(6, 0, true);
        endView.setUint16(8, files.length, true);
        endView.setUint16(10, files.length, true);
        endView.setUint32(12, centralDirSize, true);
        endView.setUint32(16, centralDirOffset, true);
        endView.setUint16(20, 0, true);
        parts.push(endRecord);

        // 合并生成完整 ZIP 二进制数据流
        let totalLen = 0;
        for (const p of parts) totalLen += p.length;
        const result = new Uint8Array(totalLen);
        let cur = 0;
        for (const p of parts) {
            result.set(p, cur);
            cur += p.length;
        }
        return result;
    }

    // 将选中的全部图片打包为 ZIP 压缩包下载
    async function downloadSelectedAsZip() {
        if (selectedImages.size === 0) {
            showToast('请先勾选需要下载的图片');
            return;
        }

        console.log('[媒体嗅探器] 开始执行打包任务，选中图片数:', selectedImages.size);

        const selectedList = Array.from(selectedImages);
        const filesToZip = [];
        let successCount = 0;

        showToast(`正在下载并打包 0/${selectedList.length} 张图片请稍候...`, 60000);

        const tasks = selectedList.map(async (url, idx) => {
            try {
                const item = imageStore.get(url);
                const targetUrl = (item && item.hdUrl) ? item.hdUrl : url;
                console.log(`[媒体嗅探器] 正在抓取第 ${idx + 1} 张图片:`, targetUrl);
                const binary = await fetchBinary(targetUrl);
                const realExt = (item && item.format ? item.format : binary.format).toLowerCase();
                const padIndex = String(idx + 1).padStart(3, '0');
                const rawBytes = new Uint8Array(binary.data);
                filesToZip.push({ name: `images/img_${padIndex}.${realExt}`, data: rawBytes });
                successCount++;
                console.log(`[媒体嗅探器] 第 ${idx + 1} 张图片拉取成功，大小:`, rawBytes.byteLength);
                showToast(`已成功获取 ${successCount}/${selectedList.length} 张图片...`, 60000);
            } catch (e) {
                console.error(`[媒体嗅探器] 第 ${idx + 1} 张图片拉取失败:`, url, e);
            }
        });

        await Promise.all(tasks);

        if (filesToZip.length === 0) {
            console.error('[媒体嗅探器] 所有选中的图片均拉取失败，中止打包');
            showToast('图片资源拉取失败无法打包');
            return;
        }

        showToast('正在生成压缩文件请稍候...');
        console.log('[媒体嗅探器] 正在即时生成 ZIP 文件流...');
        const zipBytes = createZipArchive(filesToZip);
        const zipBlob = new Blob([zipBytes], { type: 'application/zip' });
        console.log('[媒体嗅探器] ZIP 文件生成完毕，大小:', zipBlob.size, '字节');
        
        const zipFileName = `images_pack_${Date.now()}.zip`;
        const blobUrl = URL.createObjectURL(zipBlob);

        // 优先使用油猴扩展特权下载接口以规避浏览器异步手势失效拦截
        if (typeof GM_download === 'function') {
            try {
                GM_download({
                    url: blobUrl,
                    name: zipFileName,
                    saveAs: false,
                    onload: () => {
                        console.log('[媒体嗅探器] GM_download 下载完成');
                        setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
                    },
                    onerror: () => {
                        console.warn('[媒体嗅探器] GM_download 触发异常，回退原生链接触发');
                        triggerAnchorDownload(blobUrl, zipFileName);
                    }
                });
            } catch (e) {
                triggerAnchorDownload(blobUrl, zipFileName);
            }
        } else {
            triggerAnchorDownload(blobUrl, zipFileName);
        }

        showToast(`成功打包下载 ${successCount} 张图片！`);
    }

    // 触发原生锚点标签下载
    function triggerAnchorDownload(blobUrl, fileName) {
        const downloadLink = document.createElement('a');
        downloadLink.href = blobUrl;
        downloadLink.download = fileName;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
        console.log('[媒体嗅探器] 已触发原生链接下载');
    }

    // 实现悬浮球的平滑拖拽与防误触点击
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let fabInitialLeft = 0;
    let fabInitialTop = 0;
    let hasMoved = false;

    // 从持久化存储恢复悬浮球的历史位置
    const savedFabPos = (typeof GM_getValue === 'function') ? GM_getValue('ag_fab_pos', null) : null;
    if (savedFabPos && savedFabPos.x !== undefined && savedFabPos.y !== undefined) {
        const maxX = window.innerWidth - 64;
        const maxY = window.innerHeight - 64;
        const posX = Math.max(10, Math.min(savedFabPos.x, maxX));
        const posY = Math.max(10, Math.min(savedFabPos.y, maxY));
        fab.style.left = `${posX}px`;
        fab.style.top = `${posY}px`;
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
    }

    function onPointerMove(e) {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;

        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
            hasMoved = true;
        }

        const maxX = window.innerWidth - 64;
        const maxY = window.innerHeight - 64;
        const newLeft = Math.max(10, Math.min(fabInitialLeft + dx, maxX));
        const newTop = Math.max(10, Math.min(fabInitialTop + dy, maxY));

        fab.style.left = `${newLeft}px`;
        fab.style.top = `${newTop}px`;
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
    }

    function onPointerUp() {
        if (!isDragging) return;
        isDragging = false;
        fab.classList.remove('dragging');
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);

        if (hasMoved) {
            const rect = fab.getBoundingClientRect();
            if (typeof GM_setValue === 'function') {
                GM_setValue('ag_fab_pos', { x: rect.left, y: rect.top });
            }
        }
    }

    fab.addEventListener('pointerdown', (e) => {
        isDragging = true;
        hasMoved = false;
        dragStartX = e.clientX;
        dragStartY = e.clientY;

        const rect = fab.getBoundingClientRect();
        fabInitialLeft = rect.left;
        fabInitialTop = rect.top;

        fab.classList.add('dragging');
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
    });

    fab.addEventListener('click', (e) => {
        if (hasMoved) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        isModalOpen = true;
        modal.classList.add('active');
        scanPageImages();
        renderGallery();
    });

    shadow.getElementById('ag-btn-close').addEventListener('click', () => {
        isModalOpen = false;
        modal.classList.remove('active');
    });

    shadow.getElementById('ag-btn-toggle-select').addEventListener('click', () => {
        const filtered = getFilteredImages();
        if (filtered.length === 0) return;
        const isAllSelected = filtered.every(item => selectedImages.has(item.url));
        if (isAllSelected) {
            filtered.forEach(item => selectedImages.delete(item.url));
        } else {
            filtered.forEach(item => selectedImages.add(item.url));
        }
        renderGallery();
    });

    shadow.getElementById('ag-btn-copy-links').addEventListener('click', () => {
        if (selectedImages.size === 0) {
            showToast('请先勾选需要复制的图片');
            return;
        }
        const list = Array.from(selectedImages);
        const text = list.join('\n');
        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(text);
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(text).catch(() => {});
        }
        showToast(`已复制 ${list.length} 条图片链接到剪贴板`);
    });

    shadow.getElementById('ag-btn-download-selected').addEventListener('click', downloadSelectedDirectly);
    shadow.getElementById('ag-btn-download-zip').addEventListener('click', downloadSelectedAsZip);

    const dedupCheckbox = shadow.getElementById('ag-filter-dedup');
    if (dedupCheckbox) {
        dedupCheckbox.addEventListener('change', (e) => {
            enableDeduplication = e.target.checked;
            renderGallery();
        });
    }

    // 初始启动扫描与动态监听
    setTimeout(scanPageImages, 800);
    setupDynamicObserver();

})();
