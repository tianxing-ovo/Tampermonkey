// ==UserScript==
// @name         媒体嗅探器
// @namespace    https://greasyfork.org/users/1203191
// @version      1.2.0
// @description  嗅探媒体资源并下载
// @author       tianxing-ovo
// @icon         https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/media-sniffer-icon.png
// @match        *://*/*
// @run-at       document-start
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
    if (window.self !== window.top) {
        return;
    }

    // 代理全局事件监听以免疫宿主页面焦点陷阱对嗅探器组件的劫持
    const originalDocAddEventListener = Document.prototype.addEventListener;
    Document.prototype.addEventListener = function (type, listener, options) {
        if (['focusin', 'mousedown', 'touchstart', 'click', 'keydown'].includes(type)) {
            const wrappedListener = function (e) {
                const path = e.composedPath?.() || [];
                if (path.includes(container)) {
                    return;
                }
                return typeof listener === 'function' ? listener.apply(this, arguments) : listener?.handleEvent?.(e);
            };
            return originalDocAddEventListener.call(this, type, wrappedListener, options);
        }
        return originalDocAddEventListener.apply(this, arguments);
    };

    // 存储所有已嗅探到的图片对象集合
    const imageStore = new Map();
    // {key = 音频地址, value = 音频对象}
    const audioStore = new Map();
    // key = 纯净音频地址
    const cleanAudioUrls = new Set();
    // 存储选中的图片链接集合
    const selectedImages = new Set();
    // 存储选中的音频链接集合
    const selectedAudios = new Set();
    // 存储已识别的图片格式集合
    const knownImageFormats = new Set();
    // 存储当前已勾选的图片格式集合
    const checkedImageFormats = new Set();
    // 存储已识别的音频格式集合
    const knownAudioFormats = new Set();
    // 存储当前已勾选的音频格式集合
    const checkedAudioFormats = new Set();
    // 记录上一次处理的网盘目录路径
    let lastAListPath = '';
    let currentTab = 'IMAGE';
    let isModalOpen = false;
    let enableDeduplication = true;
    let audioSearchKeyword = '';
    let savedBodyOverflow = null;
    let currentPlayingAudio = null;
    let activeDownloadXhr = null;
    let isDownloadCancelled = false;

    // 界面复用的矢量图标路径字典常量
    const SVG_PATHS = {
        RADAR: 'M12 15c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm0-8c2.76 0 5 2.24 5 5s-2.24 5-5 5-5-2.24-5-5 2.24-5 5-5zm0-4C6.48 3 2 7.48 2 13c0 3.7 2.01 6.92 4.99 8.65l1.35-2.32C6.16 18.02 5 15.65 5 13c0-3.87 3.13-7 7-7s7 3.13 7 7c0 2.65-1.16 5.02-3.34 6.33l1.35 2.32C20 19.92 22 16.7 22 13c0-5.52-4.48-10-10-10z',
        CHECK: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
        CLOSE: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
        SEARCH: 'M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z',
        MUSIC: 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'
    };

    /* 停止当前正在播放的音频实例 */
    function stopCurrentAudio() {
        currentPlayingAudio?.pause();
        currentPlayingAudio = null;
    }

    // 识别音频文件常见后缀特征
    const AUDIO_EXT_REGEX = /\.(mp3|m4a|aac|flac|wav|ogg|opus)$/i;
    // 识别常见默认占位图与空白图特征
    const PLACEHOLDER_IMG_REGEX = /\/(default[-_]?(img|image|thumb|cover|pic|avatar|video)|no[-_]?(img|image|pic|photo|cover)|(small|tiny|mini|transparent|pure|clear)?[-_]?(blank|pixel|spacer|placeholder|loading|1x1|66|lazyload))\.(jpe?g|png|webp|gif|svg)(\?.*)?$/i;

    /**
     * 清洗文本为安全合法的文件名字符串
     * 
     * @param {string} rawName 原始文本字符串
     * @returns {string} 清洗后的合法文件名
     */
    function sanitizeFileName(rawName) {
        if (typeof rawName !== 'string') {
            return '';
        }
        return rawName.trim().replace(/[\\/:*?"<>|\r\n\t]/g, '_').substring(0, 100);
    }

    /**
     * 从字符串中提取规范的绝对网络链接
     * 
     * @param {string} url 原始网络链接字符串
     * @returns {string} 规范化的绝对网络链接
     */
    function normalizeUrl(url) {
        if (typeof url !== 'string') {
            return '';
        }
        url = url.trim().replace(/^url\(["']?|["']?\)$/gi, '');
        if (!url || /undefined|null|\[object|url\(|\);|--[a-z0-9_-]+:/i.test(url)) {
            return '';
        }
        if (/^(?:data|blob):/i.test(url)) {
            return url;
        }
        try {
            return new URL(url, window.location.href).href;
        } catch {
            return '';
        }
    }

    /**
     * 清洗主流图床链接并升级为高清原图地址
     * 
     * @param {string} url 原始图片网络链接
     * @returns {string} 高清原图网络链接
     */
    function upgradeToHdUrl(url) {
        if (typeof url !== 'string' || /^(?:data|blob):/i.test(url)) {
            return url;
        }
        return url
            .replace(/!(small|thumb|preview|middle|large|webp|\d+w|\d+h).*/i, '')
            .replace(/@\d+[wh]_\d+[wh].*/i, '')
            .replace(/_(thumb|small|preview)\.(jpg|png|jpeg|webp)/i, '.$2')
            .replace(/\/thumb\/\d+\//i, '/original/')
            .replace(/\.(jpg|jpeg|png)\.webp$/i, '.$1');
    }

    /**
     * 格式化文件字节大小为易读文本
     * 
     * @param {number} bytes 文件字节数值
     * @returns {string} 格式化后的文件大小字符串
     */
    function formatBytes(bytes) {
        if (!bytes || isNaN(bytes) || bytes <= 0) {
            return '';
        }
        if (bytes < 1024) {
            return `${bytes} B`;
        }
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    /**
     * 获取媒体对象的保存文件名
     * 
     * @param {Object} item 媒体数据对象
     * @param {string} defaultName 默认后备文件名
     * @param {string} defaultExt 默认文件扩展名
     * @returns {string} 规范化文件名
     */
    function getItemFileName(item, defaultName, defaultExt) {
        const ext = (item?.format || defaultExt).toLowerCase();
        const name = item?.name || defaultName;
        return name.toLowerCase().endsWith(`.${ext}`) ? name : `${name}.${ext}`;
    }

    /**
     * 注册音频
     * 
     * @param {string} rawUrl 音频地址
     * @param {string} source 触发捕获的来源标识
     * @param {Object} meta 携带的附加元数据对象
     */
    function registerAudio(rawUrl, source = 'NETWORK', meta = {}) {
        const url = normalizeUrl(rawUrl);
        if (!url || url.length < 5) {
            return;
        }
        // 跳过相同音频
        const cleanUrl = url.split('?')[0];
        if (cleanAudioUrls.has(cleanUrl)) {
            return;
        }
        cleanAudioUrls.add(cleanUrl);
        const format = meta.format || '';
        const fmtKey = format || 'AUDIO';
        if (!knownAudioFormats.has(fmtKey)) {
            knownAudioFormats.add(fmtKey);
            checkedAudioFormats.add(fmtKey);
        }
        const name = meta.name || `audio_${audioStore.size + 1}${format ? `.${format.toLowerCase()}` : ''}`;
        const author = meta.author || '';
        // 音频对象
        const audioObj = {
            url,
            name,
            author,
            format,
            source,
            size: meta.size || 0,
            duration: meta.duration || 0,
            addedAt: Date.now()
        };
        audioStore.set(url, audioObj);
        updateFloatingBadge();
        if (isModalOpen) {
            updateModalHeaderCounters();
            if (currentTab === 'AUDIO') {
                renderGallery();
            }
        }
    }

    /**
     * 处理AList响应
     * 
     * @param {Object} json 响应数据对象
     * @param {string} reqUrl 请求地址
     */
    function handleAListResponse(json, reqUrl = '') {
        if (!json || json.code !== 200 || !json.data) {
            return;
        }
        const isList = reqUrl.includes('/api/fs/list');
        const isSearch = reqUrl.includes('/api/fs/search');
        const isGet = reqUrl.includes('/api/fs/get');
        // 目录列表切换时清空历史数据
        if (isList) {
            const currentPath = json.data.path
                ? decodeURIComponent(json.data.path)
                : decodeURIComponent(window.location.pathname);
            if (lastAListPath !== '' && lastAListPath !== currentPath) {
                audioStore.clear();
                cleanAudioUrls.clear();
                selectedAudios.clear();
                knownAudioFormats.clear();
                checkedAudioFormats.clear();
                const audioGallery = shadow.getElementById('ag-gallery-audio');
                if (audioGallery) {
                    audioGallery.innerHTML = '';
                }
                if (isModalOpen) {
                    renderGallery();
                } else {
                    updateFloatingBadge();
                }
            }
            lastAListPath = currentPath;
        }
        // 归一化为统一条目数组
        const list = Array.isArray(json.data.content)
            ? json.data.content
            : (json.data.name ? [json.data] : []);
        const audioItems = list.filter(item => !item.is_dir && AUDIO_EXT_REGEX.test(item.name));
        if (audioItems.length === 0) {
            return;
        }
        const source = isSearch ? 'ALIST_SEARCH' : (isGet ? 'ALIST_GET' : 'ALIST_LIST');
        audioItems.forEach(item => {
            const parentPath = item.parent || json.data.path || window.location.pathname || '';
            const normalizedParent = parentPath === '/' ? '' : parentPath;
            const fullPath = item.path || `${normalizedParent}/${item.name}`;
            const directUrl = `${window.location.origin}/d${encodeURI(fullPath)}`;
            const format = item.name.split('.').pop().toUpperCase();
            const finalUrl = item.raw_url || (item.sign ? `${directUrl}?sign=${item.sign}` : directUrl);
            // 从parentPath提取作者名
            const pathSegments = (typeof parentPath === 'string' ? decodeURIComponent(parentPath) : '').split('/').filter(Boolean);
            const authorName = pathSegments.length >= 2 ? pathSegments[1] : '';
            registerAudio(finalUrl, source, {
                name: item.name,
                author: authorName,
                size: item.size || 0,
                format
            });
        });
    }

    // 拦截fetch请求以捕获网盘数据接口
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const reqUrl = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
        const response = await originalFetch.apply(this, args);
        if (/\/api\/fs\/(list|search|get)/.test(reqUrl)) {
            response.clone().json().then(data => {
                handleAListResponse(data, reqUrl);
            }).catch(() => { });
        }
        return response;
    };

    // 拦截xhr请求以捕获网盘数据接口
    const originalXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        if (typeof url === 'string' && /\/api\/fs\/(list|search|get)/.test(url)) {
            this.addEventListener('load', () => {
                try {
                    handleAListResponse(JSON.parse(this.responseText), url);
                } catch { }
            });
        }
        return originalXhrOpen.apply(this, arguments);
    };

    // 离线复用的微型指纹计算画布
    const calcCanvas = document.createElement('canvas');
    calcCanvas.width = 9;
    calcCanvas.height = 8;
    const calcCtx = calcCanvas.getContext('2d', { willReadFrequently: true });

    /**
     * 计算图片的差异哈希指纹以用于智能去重
     * 
     * @param {HTMLImageElement} imgEl 图片元素对象
     * @returns {string} 差异哈希十六进制字符串
     */
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
        } catch {
            // 遇到跨域限制时回退为尺寸哈希
            return `dim_${imgEl.naturalWidth || 0}x${imgEl.naturalHeight || 0}`;
        }
    }

    /**
     * 从URL中检测图片格式
     * 
     * @param {string} url 图片地址
     * @returns {string} 图片格式
     */
    function detectImageFormatFromUrl(url) {
        const m = url.match(/(?:data:image\/|\.|\b(?:format|f)=)(jpe?g|png|webp|svg|gif|avif)/i);
        return m ? m[1].toUpperCase().replace('JPEG', 'JPG') : '';
    }

    /**
     * 从字节数组中检测图片格式
     * 
     * @param {Uint8Array} bytes 图片字节数组
     * @returns {string} 图片格式
     */
    function detectImageFormatFromBytes(bytes) {
        if (!bytes || bytes.length < 12) {
            return '';
        }
        const head = String.fromCharCode(...bytes.slice(0, 12));
        if (head.startsWith('\xff\xd8')) {
            return 'JPG';
        }
        if (head.startsWith('\x89PNG')) {
            return 'PNG';
        }
        if (head.startsWith('RIFF') && head.includes('WEBP')) {
            return 'WEBP';
        }
        if (head.startsWith('GIF')) {
            return 'GIF';
        }
        if (head.startsWith('<svg') || head.startsWith('<?xml')) {
            return 'SVG';
        }
        return '';
    }

    /**
     * 底层跨域网络请求并支持进度反馈与中断控制
     * 
     * @param {string} url 目标资源网络链接
     * @param {Object} options 请求配置选项对象
     * @returns {Promise<any>} 响应二进制数据
     */
    function gmRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            const responseType = options.responseType || 'arraybuffer';
            const prefix = options.prefix || '';
            const trackProgress = !!options.trackProgress;
            const tag = prefix ? `${prefix} ` : '';
            if (typeof GM_xmlhttpRequest === 'function') {
                const cleanup = () => {
                    if (trackProgress) {
                        activeDownloadXhr = null;
                    }
                };
                const xhr = GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    responseType,
                    headers: { Referer: window.location.href },
                    cookie: document.cookie,
                    onprogress: trackProgress ? (p) => updateProgressToast(p, tag) : undefined,
                    onload: (res) => {
                        cleanup();
                        if (trackProgress && isDownloadCancelled) {
                            reject(new Error('Cancelled'));
                            return;
                        }
                        if (res.status >= 200 && res.status < 300 && res.response) {
                            resolve(res.response);
                        } else {
                            reject(new Error(`HTTP ${res.status}`));
                        }
                    },
                    ['onabort']: () => {
                        cleanup();
                        reject(new Error('Cancelled'));
                    },
                    onerror: () => {
                        cleanup();
                        reject(new Error('Network error'));
                    }
                });
                if (trackProgress) {
                    activeDownloadXhr = xhr;
                }
            } else {
                fetch(url)
                    .then(res => {
                        if (!res.ok) {
                            throw new Error(`HTTP ${res.status}`);
                        }
                        return responseType === 'blob' ? res.blob() : res.arrayBuffer();
                    })
                    .then(resolve)
                    .catch(reject);
            }
        });
    }

    /**
     * 拉取图片计算二进制唯一指纹与真实格式
     * 
     * @param {string} url 目标图片网络链接
     * @returns {Promise<Object>} 包含哈希与真实格式的期约对象
     */
    async function fetchBinaryFingerprint(url) {
        if (!url || /^(?:data|blob):/i.test(url)) {
            return { hash: '', format: '' };
        }
        try {
            const buffer = await gmRequest(url, { responseType: 'arraybuffer' });
            const bytes = new Uint8Array(buffer);
            let h = 0x811c9dc5;
            for (let i = 0; i < bytes.length; i++) {
                h ^= bytes[i];
                h = (h * 0x01000193) >>> 0;
            }
            const hash = `bin_${bytes.length}_${h.toString(16)}`;
            const realFormat = detectImageFormatFromBytes(bytes);
            return { hash, format: realFormat };
        } catch {
            return { hash: '', format: '' };
        }
    }

    /**
     * 更新卡片格式
     * 
     * @param {Object} item 图片对象
     */
    function updateCardFormat(item) {
        // 获取目标图片卡片对应的格式徽标元素
        const badge = shadow.querySelector(`.img-card[data-url="${CSS.escape(item.url)}"] .media-format-badge`);
        if (badge) {
            badge.textContent = item.format;
        }
    }

    /**
     * 注册图片对象到全局存储集合
     * 
     * @param {string} rawUrl 图片网络链接
     * @param {string} source 触发捕获的来源标识
     * @param {Object} meta 携带的附加元数据对象
     */
    function registerImage(rawUrl, source = 'DOM', meta = {}) {
        const url = normalizeUrl(rawUrl);
        if (!url || url.length < 5) {
            return;
        }
        if (PLACEHOLDER_IMG_REGEX.test(url)) {
            return;
        }
        if (url.startsWith('data:image/') && url.length < 150) {
            return;
        }
        if (imageStore.has(url)) {
            const exist = imageStore.get(url);
            if (meta.name && !exist.name) {
                exist.name = meta.name;
            }
            return;
        }
        // 检测图片格式并记录至格式集合
        const format = detectImageFormatFromUrl(url);
        const fmtKey = format || 'OTHER';
        if (!knownImageFormats.has(fmtKey)) {
            knownImageFormats.add(fmtKey);
            checkedImageFormats.add(fmtKey);
        }
        const imgObj = {
            url,
            hdUrl: upgradeToHdUrl(url),
            name: meta.name || '',
            format,
            source,
            width: 0,
            height: 0,
            hash: '',
            loaded: false
        };
        imageStore.set(url, imgObj);
        // 异步预加载图片以获取真实自然宽高尺寸
        const tempImg = new Image();
        tempImg.referrerPolicy = 'no-referrer';
        tempImg.onload = () => {
            imgObj.width = tempImg.naturalWidth || tempImg.width || 0;
            imgObj.height = tempImg.naturalHeight || tempImg.height || 0;
            // 过滤主题微型矢量图标与占位小图
            if (imgObj.width <= 32 && imgObj.height <= 32 && (url.includes('/themes/') || url.includes('/assets/') || url.endsWith('.svg'))) {
                imageStore.delete(url);
                selectedImages.delete(url);
                updateFloatingBadge();
                return;
            }
            if (imgObj.width > 0 && imgObj.height > 0 && !imgObj.hash) {
                imgObj.hash = calculateDHash(tempImg);
            }
            imgObj.loaded = true;
            updateFloatingBadge();
            if (isModalOpen && currentTab === 'IMAGE' && enableDeduplication) {
                renderGallery();
            }
        };
        tempImg.onerror = () => {
            imageStore.delete(url);
            selectedImages.delete(url);
            updateFloatingBadge();
            if (isModalOpen && currentTab === 'IMAGE') {
                renderGallery();
            }
        };
        tempImg.src = url;
        // 异步计算二进制指纹以实现去重与格式补充
        fetchBinaryFingerprint(url).then(info => {
            if (imageStore.get(url) !== imgObj) {
                return;
            }
            // 若初始未识别出格式且魔数成功识别则补充格式
            if (!imgObj.format && info.format) {
                imgObj.format = info.format;
                if (!knownImageFormats.has(info.format)) {
                    knownImageFormats.add(info.format);
                    checkedImageFormats.add(info.format);
                }
                // 若无任何未识别格式图片则清理历史 OTHER 键
                let hasOther = false;
                for (const item of imageStore.values()) {
                    if (!item.format) {
                        hasOther = true;
                        break;
                    }
                }
                if (!hasOther) {
                    knownImageFormats.delete('OTHER');
                    checkedImageFormats.delete('OTHER');
                }
                if (isModalOpen && currentTab === 'IMAGE') {
                    updateCardFormat(imgObj);
                }
            }
            if (info.hash) {
                imgObj.hash = info.hash;
                if (isModalOpen && currentTab === 'IMAGE' && enableDeduplication) {
                    renderGallery();
                }
            }
            updateFloatingBadge();
        });
    }

    // 图片元素中可能存放图片地址的属性名称集合
    const POSSIBLE_IMG_ATTRS = [
        'data-original', 'data-src', 'data-actualsrc', 'data-url', 'zoomfile',
        'file', 'original', 'srcset', 'src', 'data-lazy-src', 'xlink:href', 'href'
    ];

    /* 深度扫描当前文档中的所有图片元素 */
    function scanPageImages() {
        const imgElements = document.querySelectorAll('img, picture source, image');
        imgElements.forEach(el => {
            const altText = el.getAttribute('alt') || el.getAttribute('title') || el.closest('a')?.getAttribute('title') || '';
            const cleanName = sanitizeFileName(altText);
            for (const attr of POSSIBLE_IMG_ATTRS) {
                const val = el.getAttribute(attr);
                if (val) {
                    if (attr === 'srcset') {
                        const parts = val.split(',');
                        parts.forEach(p => {
                            const u = p.trim().split(/\s+/)[0];
                            if (u) {
                                registerImage(u, 'IMG-SRCSET', { name: cleanName });
                            }
                        });
                    } else {
                        registerImage(val, 'IMG', { name: cleanName });
                    }
                }
            }
        });
        // 扫描带有背景样式的容器元素
        const bgNodes = document.querySelectorAll('[style*="background"], [style*="url("]');
        bgNodes.forEach(node => {
            const style = node.getAttribute('style') || '';
            const bgTitle = node.getAttribute('title') || node.getAttribute('aria-label') || '';
            const cleanName = sanitizeFileName(bgTitle);
            const matches = style.matchAll(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/gi);
            for (const m of matches) {
                const rawUrl = (m[1] || '').trim();
                if (rawUrl) {
                    registerImage(rawUrl, 'CSS-BG', { name: cleanName });
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
            } catch { }
        });
        updateFloatingBadge();
    }

    /* 挂载动态观察器实时捕获异步渲染的新媒体元素 */
    function setupDynamicObserver() {
        let timer = null;
        const observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(scanPageImages, 400);
        });
        const startObserve = () => {
            if (document.body) {
                observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'style', 'class'] });
            }
        };
        if (document.body) {
            startObserve();
        } else {
            document.addEventListener('DOMContentLoaded', startObserve);
        }
        window.addEventListener('scroll', () => {
            clearTimeout(timer);
            timer = setTimeout(scanPageImages, 500);
        }, { passive: true });
    }

    // 创建独立沙箱节点防止宿主网页既有样式污染
    const container = document.createElement('div');
    container.id = 'ag-media-sniffer-root';

    /* 将独立沙箱容器挂载到当前文档根节点 */
    function attachContainer() {
        if (!container.isConnected) {
            (document.body || document.documentElement).appendChild(container);
        }
    }
    attachContainer();
    // 监听 SPA 路由切换导致容器被移除后自动重新挂载
    new MutationObserver(attachContainer).observe(document.documentElement, { childList: true, subtree: false });

    const shadow = container.attachShadow({ mode: 'open' });

    // 注入现代化响应式界面样式表
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        :host, :root {
            --primary: #4f46e5;
            --primary-hover: #4338ca;
            --bg-glass: rgba(255, 255, 255, 0.96);
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
            gap: 16px;
        }
        .header-left {
            display: flex;
            align-items: center;
            gap: 16px;
            flex-wrap: wrap;
        }
        .header-title {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 17px;
            font-weight: 700;
            color: var(--text-main);
        }
        .header-title svg { width: 22px; height: 22px; fill: var(--primary); }
        /* 模态选项卡 */
        .tab-switcher {
            display: inline-flex;
            background: #e2e8f0;
            border-radius: 8px;
            padding: 3px;
            gap: 2px;
        }
        .tab-btn {
            background: transparent;
            border: none;
            color: var(--text-muted);
            padding: 6px 14px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .tab-btn:hover {
            color: var(--text-main);
        }
        .tab-btn.active {
            background: #ffffff;
            color: var(--primary);
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .header-selected-count {
            font-size: 13px;
            color: var(--text-muted);
            font-weight: normal;
        }
        .header-dedup-stat {
            font-size: 12px;
            color: var(--primary);
            font-weight: 600;
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
            cursor: pointer;
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
        /* 音频搜索框 */
        .search-wrap {
            position: relative;
            display: inline-flex;
            align-items: center;
        }
        .search-icon {
            position: absolute;
            left: 9px;
            width: 15px;
            height: 15px;
            fill: var(--text-muted);
            pointer-events: none;
        }
        .search-input {
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 6px 28px 6px 30px;
            font-size: 13px;
            color: var(--text-main);
            background: #fff;
            outline: none;
            width: 200px;
            transition: border-color 0.2s;
        }
        .search-input:focus { border-color: var(--primary); }
        .search-clear {
            display: none;
            position: absolute;
            right: 6px;
            width: 16px;
            height: 16px;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            fill: var(--text-muted);
        }
        .search-clear:hover { fill: var(--text-main); }
        .search-wrap.has-value .search-clear { display: inline-flex; }
        /* 媒体画廊主体 */
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
        .audio-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
            max-width: 1100px;
            margin: 0 auto;
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
        /* 音频卡片条目 */
        .audio-card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 14px 18px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            transition: all 0.2s;
            box-shadow: 0 1px 3px rgba(0,0,0,0.04);
            cursor: pointer;
        }
        .audio-card:hover {
            border-color: rgba(79, 70, 229, 0.4);
            box-shadow: 0 4px 12px rgba(0,0,0,0.06);
            transform: translateY(-1px);
        }
        .audio-card.selected {
            border-color: var(--primary);
            background: #f8faff;
            box-shadow: 0 0 0 2px var(--primary);
        }
        .audio-left {
            display: flex;
            align-items: center;
            gap: 14px;
            flex: 1;
            min-width: 0;
        }
        .audio-icon-box {
            width: 42px;
            height: 42px;
            border-radius: 10px;
            background: linear-gradient(135deg, #e0e7ff, #ede9fe);
            color: var(--primary);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .audio-icon-box svg { width: 22px; height: 22px; fill: currentColor; }
        .audio-info {
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 0;
            flex: 1;
        }
        .audio-name {
            font-size: 14px;
            font-weight: 600;
            color: var(--text-main);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            cursor: pointer;
            transition: color 0.15s ease;
        }
        .audio-name:hover {
            color: var(--primary);
            text-decoration: underline;
        }
        .audio-meta-row {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 12px;
            color: var(--text-muted);
        }
        .audio-right {
            display: flex;
            align-items: center;
            gap: 14px;
            flex-shrink: 0;
        }
        .audio-player-wrapper {
            display: flex;
            align-items: center;
        }
        .audio-player-wrapper audio {
            height: 34px;
            outline: none;
        }
        /* 选中标记框 */
        .select-checkbox-box {
            width: 20px;
            height: 20px;
            border-radius: 6px;
            border: 1px solid #cbd5e1;
            background: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            transition: all 0.2s;
        }
        .selected .select-checkbox-box {
            background: var(--primary);
            border-color: var(--primary);
        }
        .select-check-svg {
            display: none;
            width: 14px;
            height: 14px;
            fill: #fff;
        }
        .selected .select-check-svg { display: block; }
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
        .media-format-badge {
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
        .audio-format-badge {
            background: #e0f2fe;
            color: #0284c7;
            border: 1px solid #bae6fd;
            font-size: 10px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 6px;
            text-transform: uppercase;
        }
        .audio-author-name {
            color: #334155;
            font-weight: 500;
            font-size: 12px;
            max-width: 160px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
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
        .gallery-empty {
            text-align: center;
            padding: 60px 20px;
            color: var(--text-muted);
            font-size: 15px;
        }
        /* 进度提示浮层 */
        .toast-notify {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(15, 23, 42, 0.92);
            color: #fff;
            padding: 8px 16px;
            border-radius: 10px;
            border: 1px solid rgba(255,255,255,0.1);
            box-shadow: 0 10px 30px rgba(0,0,0,0.25);
            z-index: 2147483647;
            display: none;
            align-items: center;
            gap: 12px;
            font-size: 13px;
        }
        .toast-notify.active { display: flex; animation: toastIn 0.2s ease; }
        .toast-cancel-btn {
            background: rgba(239, 68, 68, 0.25);
            color: #fca5a5;
            border: 1px solid rgba(239, 68, 68, 0.4);
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            line-height: 1.4;
            transition: all 0.15s ease;
        }
        .toast-cancel-btn:hover {
            background: rgba(239, 68, 68, 0.5);
            color: #ffffff;
        }
        @keyframes toastIn { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
    `;
    shadow.appendChild(styleEl);

    // 构建界面悬浮球与弹窗节点
    const fab = document.createElement('div');
    fab.className = 'fab-trigger';
    fab.title = '打开媒体嗅探器';
    fab.innerHTML = `
        <svg class="fab-icon" viewBox="0 0 24 24">
            <path d="${SVG_PATHS.RADAR}"/>
        </svg>
        <span class="fab-badge" id="ag-badge">0</span>
    `;
    shadow.appendChild(fab);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-header">
            <div class="header-left">
                <div class="header-title">
                    <svg viewBox="0 0 24 24"><path d="${SVG_PATHS.RADAR}"/></svg>
                    <span>媒体嗅探器</span>
                </div>
                <div class="tab-switcher">
                    <button class="tab-btn active" id="ag-tab-img" data-tab="IMAGE">图片 (0)</button>
                    <button class="tab-btn" id="ag-tab-audio" data-tab="AUDIO">音频 (0)</button>
                </div>
                <span id="ag-selected-count" class="header-selected-count">(已选中 0 项)</span>
                <span id="ag-dedup-stat" class="header-dedup-stat"></span>
            </div>
            <div class="header-actions">
                <button class="btn" id="ag-btn-toggle-select">全选</button>
                <button class="btn" id="ag-btn-copy-links">复制链接</button>
                <button class="btn btn-primary btn-download-selected" id="ag-btn-download-selected">下载</button>
                <button class="btn btn-primary" id="ag-btn-download-zip">下载并打包</button>
                <button class="btn-close" id="ag-btn-close">
                    <svg style="width:20px;height:20px;fill:currentColor" viewBox="0 0 24 24"><path d="${SVG_PATHS.CLOSE}"/></svg>
                </button>
            </div>
        </div>
        <div class="filter-bar">
            <div class="filter-group">
                <div class="filter-format-container" id="ag-format-checkboxes"></div>
                <label class="filter-item filter-dedup-label" id="ag-dedup-label-wrap"><input type="checkbox" id="ag-filter-dedup" class="filter-checkbox" checked> 智能去重</label>
            </div>
            <span class="search-wrap" id="ag-search-wrap" style="display:none">
                <svg class="search-icon" viewBox="0 0 24 24"><path d="${SVG_PATHS.SEARCH}"/></svg>
                <input type="text" id="ag-search-input" class="search-input" placeholder="搜索音频名称或作者">
                <span class="search-clear" id="ag-search-clear"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:inherit"><path d="${SVG_PATHS.CLOSE}"/></svg></span>
            </span>
        </div>
        <div class="modal-body">
            <div class="gallery-grid" id="ag-gallery-image"></div>
            <div class="audio-list" id="ag-gallery-audio" style="display:none"></div>
        </div>
    `;
    shadow.appendChild(modal);

    const toast = document.createElement('div');
    toast.className = 'toast-notify';
    const toastTextSpan = document.createElement('span');
    const toastCancelBtn = document.createElement('button');
    toastCancelBtn.className = 'toast-cancel-btn';
    toastCancelBtn.textContent = '取消';
    toastCancelBtn.style.display = 'none';
    toast.appendChild(toastTextSpan);
    toast.appendChild(toastCancelBtn);
    shadow.appendChild(toast);

    let toastTimer = null;
    let currentToastCancelCallback = null;

    toastCancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentToastCancelCallback?.();
    });

    /**
     * 弹出底部半透明状态提示气泡
     * 
     * @param {string} msg 提示消息文本
     * @param {number} duration 显示持续时间毫秒数
     * @param {Function} onCancel 取消操作回调函数
     */
    function showToast(msg, duration = 2500, onCancel = null) {
        if (toastTimer) {
            clearTimeout(toastTimer);
            toastTimer = null;
        }
        toastTextSpan.textContent = msg;
        currentToastCancelCallback = onCancel;
        toastCancelBtn.style.display = (typeof onCancel === 'function') ? 'inline-block' : 'none';
        toast.classList.add('active');
        if (duration > 0 && duration < 60000) {
            toastTimer = setTimeout(() => {
                toast.classList.remove('active');
                toastTimer = null;
            }, duration);
        }
    }

    /* 取消当前正在执行的媒体下载任务 */
    function cancelDownload() {
        isDownloadCancelled = true;
        currentToastCancelCallback = null;
        try {
            activeDownloadXhr?.abort?.();
        } catch { }
        activeDownloadXhr = null;
        showToast('已取消下载', 2000);
    }

    /**
     * 格式化并更新下载进度提示浮层
     * 
     * @param {Object} progress 网络传输进度事件对象
     * @param {string} tag 任务序数标识前缀文本
     */
    function updateProgressToast(progress, tag = '') {
        if (isDownloadCancelled) {
            return;
        }
        if (progress.lengthComputable && progress.total > 0) {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            const loadedStr = formatBytes(progress.loaded);
            const totalStr = formatBytes(progress.total);
            showToast(`${tag}${percent}% (${loadedStr} / ${totalStr})`, 60000, cancelDownload);
        } else if (progress.loaded > 0) {
            const loadedStr = formatBytes(progress.loaded);
            showToast(`${tag}已接收 ${loadedStr}`, 60000, cancelDownload);
        }
    }

    /**
     * 将文本内容复制到系统剪贴板并弹出提示
     * 
     * @param {string} text 待复制的文本内容
     * @param {string} successMsg 复制成功时的提示文本
     */
    function copyToClipboard(text, successMsg = '已复制到剪贴板') {
        if (!text) {
            return;
        }
        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(text);
        } else {
            navigator.clipboard?.writeText(text).catch(() => { });
        }
        if (successMsg) {
            showToast(successMsg);
        }
    }

    /**
     * 统一刷新悬浮球角标数量统计
     * 
     * @param {Array<Object>} [imgList] 预计算的图片列表
     * @param {Array<Object>} [audioList] 预计算的音频列表
     */
    function updateFloatingBadge(imgList = null, audioList = null) {
        const badge = shadow.getElementById('ag-badge');
        if (badge) {
            const imgCount = imgList ? imgList.length : getFilteredImages().length;
            const audioCount = audioList ? audioList.length : getFilteredAudios().length;
            badge.textContent = String(imgCount + audioCount);
        }
    }

    /**
     * 刷新弹窗头部选项卡数量与选中计数
     * 
     * @param {Array<Object>} [imgList] 预计算的图片列表
     * @param {Array<Object>} [audioList] 预计算的音频列表
     */
    function updateModalHeaderCounters(imgList = null, audioList = null) {
        const tabImg = shadow.getElementById('ag-tab-img');
        const tabAudio = shadow.getElementById('ag-tab-audio');
        const countSpan = shadow.getElementById('ag-selected-count');
        const toggleBtn = shadow.getElementById('ag-btn-toggle-select');
        const images = imgList || getFilteredImages();
        const audios = audioList || getFilteredAudios();
        const isImg = currentTab === 'IMAGE';
        const selectedSet = isImg ? selectedImages : selectedAudios;
        const activeList = isImg ? images : audios;
        if (tabImg) {
            tabImg.textContent = `图片 (${images.length})`;
        }
        if (tabAudio) {
            tabAudio.textContent = `音频 (${audios.length})`;
        }
        if (countSpan) {
            countSpan.textContent = `(已选中 ${selectedSet.size} 项)`;
        }
        if (toggleBtn) {
            const isAll = activeList.length > 0 && activeList.every(i => selectedSet.has(i.url));
            toggleBtn.textContent = isAll ? '取消全选' : '全选';
        }
    }

    /**
     * 渲染格式筛选复选框组并绑定联动事件
     * 
     * @param {HTMLElement} container 复选框容器元素
     * @param {Map<string, number>} formatCounts 格式数量统计映射
     * @param {Set<string>} checkedFormats 当前勾选的格式集合
     * @param {string} emptyText 无格式时的提示文本
     */
    function renderFormatCheckboxGroup(container, formatCounts, checkedFormats, emptyText) {
        if (formatCounts.size === 0) {
            container.innerHTML = `<span class="format-count">${emptyText}</span>`;
            return;
        }
        const checkedCount = Array.from(formatCounts.keys()).filter(fmt => checkedFormats.has(fmt)).length;
        const isAllChecked = formatCounts.size > 0 && checkedCount === formatCounts.size;
        const isIndeterminate = checkedCount > 0 && checkedCount < formatCounts.size;
        let html = '';
        if (formatCounts.size > 1) {
            html += `<label class="filter-item"><input type="checkbox" class="filter-format-all-checkbox" ${isAllChecked ? 'checked' : ''}> 全部</label>`;
        }
        formatCounts.forEach((count, fmt) => {
            const isChecked = checkedFormats.has(fmt) ? 'checked' : '';
            html += `<label class="filter-item"><input type="checkbox" class="filter-format-checkbox" value="${fmt}" ${isChecked}> ${fmt}<span class="format-count">（${count}）</span></label>`;
        });
        container.innerHTML = html;
        const allCheckbox = container.querySelector('.filter-format-all-checkbox');
        if (allCheckbox) {
            allCheckbox.indeterminate = isIndeterminate;
            allCheckbox.addEventListener('change', () => {
                if (allCheckbox.checked) {
                    formatCounts.forEach((_, fmt) => {
                        checkedFormats.add(fmt);
                    });
                } else {
                    checkedFormats.clear();
                }
                renderGallery();
            });
        }
        container.querySelectorAll('.filter-format-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                if (cb.checked) {
                    checkedFormats.add(cb.value);
                } else {
                    checkedFormats.delete(cb.value);
                }
                renderGallery();
            });
        });
    }

    /* 动态统计当前模态下的格式并渲染筛选复选框 */
    function renderFormatFilters() {
        const container = shadow.getElementById('ag-format-checkboxes');
        const dedupWrap = shadow.getElementById('ag-dedup-label-wrap');
        const searchWrap = shadow.getElementById('ag-search-wrap');
        if (!container) {
            return;
        }
        const formatCounts = new Map();
        const isImg = currentTab === 'IMAGE';
        if (dedupWrap) {
            dedupWrap.style.display = isImg ? 'inline-flex' : 'none';
        }
        if (searchWrap) {
            searchWrap.style.display = isImg ? 'none' : 'inline-flex';
        }
        if (isImg) {
            const seenHashes = new Set();
            imageStore.forEach(item => {
                if (enableDeduplication && item.hash) {
                    if (seenHashes.has(item.hash)) {
                        return;
                    }
                    seenHashes.add(item.hash);
                }
                const fmt = item.format || 'OTHER';
                formatCounts.set(fmt, (formatCounts.get(fmt) || 0) + 1);
            });
            renderFormatCheckboxGroup(container, formatCounts, checkedImageFormats, '暂无图片格式');
        } else {
            audioStore.forEach(item => {
                const fmt = item.format || 'AUDIO';
                formatCounts.set(fmt, (formatCounts.get(fmt) || 0) + 1);
            });
            renderFormatCheckboxGroup(container, formatCounts, checkedAudioFormats, '暂无音频格式');
        }
    }

    /**
     * 获取经过筛选过滤后的图片列表
     * 
     * @returns {Array<Object>} 过滤后的图片数据对象数组
     */
    function getFilteredImages() {
        const result = [];
        const seenHashes = new Set();
        let dupCount = 0;
        imageStore.forEach(item => {
            const fmt = item.format || 'OTHER';
            if (knownImageFormats.has(fmt) && !checkedImageFormats.has(fmt)) {
                return;
            }
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

    /**
     * 获取经过筛选过滤后的音频列表
     * 
     * @returns {Array<Object>} 过滤后的音频数据对象数组
     */
    function getFilteredAudios() {
        const result = [];
        audioStore.forEach(item => {
            const fmt = item.format || 'AUDIO';
            if (knownAudioFormats.has(fmt) && !checkedAudioFormats.has(fmt)) {
                return;
            }
            if (audioSearchKeyword && !`${item.name} ${item.author || ''} ${item.url}`.toLowerCase().includes(audioSearchKeyword)) {
                return;
            }
            result.push(item);
        });
        return result;
    }

    /**
     * 更新去重统计信息文字显示
     * 
     * @param {number} dupCount 当前识别出的重复项目总数
     */
    function updateDeduplicationStat(dupCount) {
        const el = shadow.getElementById('ag-dedup-stat');
        if (el) {
            el.textContent = (currentTab === 'IMAGE' && enableDeduplication && dupCount > 0)
                ? `(已智能去重 ${dupCount} 张)`
                : '';
        }
    }

    /* 渲染当前选项卡下的媒体画廊或音频列表 */
    function renderGallery() {
        renderFormatFilters();
        const imgGallery = shadow.getElementById('ag-gallery-image');
        const audioGallery = shadow.getElementById('ag-gallery-audio');
        if (!imgGallery || !audioGallery) {
            return;
        }
        if (currentTab === 'IMAGE') {
            imgGallery.style.display = 'grid';
            audioGallery.style.display = 'none';
            const filtered = getFilteredImages();
            imgGallery.innerHTML = '';
            if (filtered.length === 0) {
                imgGallery.innerHTML = '<div class="gallery-empty">当前未发现匹配的图片资源</div>';
            } else {
                filtered.forEach(item => {
                    const card = document.createElement('div');
                    card.dataset.url = item.url;
                    card.className = 'img-card' + (selectedImages.has(item.url) ? ' selected' : '');
                    const dimText = (item.width && item.height) ? `${item.width} × ${item.height}` : '加载中...';
                    card.innerHTML = `
                        <div class="img-thumb-wrapper">
                            <img class="img-thumb" src="${item.url}" alt="thumb" referrerpolicy="no-referrer" loading="lazy">
                            <div class="img-select-overlay">
                                <svg class="img-select-check" viewBox="0 0 24 24"><path d="${SVG_PATHS.CHECK}"/></svg>
                            </div>
                            <span class="media-format-badge">${item.format}</span>
                        </div>
                        <div class="img-meta">
                            <span class="img-dim">${dimText}</span>
                        </div>
                    `;
                    const imgEl = card.querySelector('.img-thumb');
                    const dimSpan = card.querySelector('.img-dim');

                    /* 缩略图加载完成计算尺寸并更新显示 */
                    function onThumbLoad() {
                        if (imgEl?.naturalWidth && imgEl?.naturalHeight) {
                            item.width = imgEl.naturalWidth;
                            item.height = imgEl.naturalHeight;
                            if (!item.hash) {
                                item.hash = calculateDHash(imgEl);
                            }
                            if (dimSpan) {
                                dimSpan.textContent = `${item.width} × ${item.height}`;
                            }
                        }
                    }

                    /* 缩略图加载失败时自动剔除死链卡片 */
                    function onThumbError() {
                        selectedImages.delete(item.url);
                        imageStore.delete(item.url);
                        card.remove();
                        updateModalHeaderCounters();
                        updateFloatingBadge();
                        if (imgGallery.children.length === 0) {
                            imgGallery.innerHTML = '<div class="gallery-empty">当前未发现匹配的图片资源</div>';
                        }
                    }

                    if (imgEl?.complete && imgEl?.naturalWidth) {
                        onThumbLoad();
                    } else if (imgEl) {
                        imgEl.addEventListener('load', onThumbLoad);
                        imgEl.addEventListener('error', onThumbError);
                    }
                    card.addEventListener('click', () => {
                        const isSelected = selectedImages.has(item.url);
                        selectedImages[isSelected ? 'delete' : 'add'](item.url);
                        card.classList.toggle('selected', !isSelected);
                        updateModalHeaderCounters(filtered, null);
                    });
                    imgGallery.appendChild(card);
                });
            }
            updateModalHeaderCounters(filtered, null);
            updateFloatingBadge(filtered, null);
        } else {
            imgGallery.style.display = 'none';
            audioGallery.style.display = 'flex';
            const filtered = getFilteredAudios();
            const filteredUrlSet = new Set(filtered.map(item => item.url));
            // 移除空状态提示占位符
            const emptyTip = audioGallery.querySelector('.gallery-empty');
            if (emptyTip) {
                emptyTip.remove();
            }
            // 获取已存在的音频卡片映射
            const existingCards = new Map();
            audioGallery.querySelectorAll('.audio-card').forEach(card => {
                existingCards.set(card.dataset.url, card);
            });
            // 遍历过滤后的音频数据并进行增量复用与显隐控制
            filtered.forEach(item => {
                let card = existingCards.get(item.url);
                if (card) {
                    card.style.display = '';
                    card.classList.toggle('selected', selectedAudios.has(item.url));
                } else {
                    card = document.createElement('div');
                    card.dataset.url = item.url;
                    card.className = 'audio-card' + (selectedAudios.has(item.url) ? ' selected' : '');
                    const sizeStr = formatBytes(item.size);
                    card.innerHTML = `
                        <div class="audio-left">
                            <div class="select-checkbox-box">
                                <svg class="select-check-svg" viewBox="0 0 24 24"><path d="${SVG_PATHS.CHECK}"/></svg>
                            </div>
                            <div class="audio-icon-box">
                                <svg viewBox="0 0 24 24"><path d="${SVG_PATHS.MUSIC}"/></svg>
                            </div>
                            <div class="audio-info">
                                <div class="audio-name" title="点击复制文件名">${item.name}</div>
                                <div class="audio-meta-row">
                                    <span class="audio-format-badge">${item.format}</span>
                                    ${item.author ? `<span class="audio-author-name">${item.author}</span>` : ''}
                                    ${sizeStr ? `<span>${sizeStr}</span>` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="audio-right">
                            <div class="audio-player-wrapper">
                                <audio controls preload="metadata" src="${item.url}"></audio>
                            </div>
                        </div>
                    `;
                    // 阻止文件名点击触发整行选择并复制到剪贴板
                    const audioNameEl = card.querySelector('.audio-name');
                    if (audioNameEl) {
                        audioNameEl.addEventListener('click', (e) => {
                            e.stopPropagation();
                            copyToClipboard(item.name, '已复制文件名');
                        });
                    }
                    // 阻止播放器控件点击触发整行选择并监听互斥播放事件
                    const audioPlayer = card.querySelector('audio');
                    if (audioPlayer) {
                        audioPlayer.addEventListener('click', (e) => {
                            e.stopPropagation();
                        });
                        audioPlayer.addEventListener('play', () => {
                            if (currentPlayingAudio !== audioPlayer) {
                                currentPlayingAudio?.pause();
                            }
                            currentPlayingAudio = audioPlayer;
                        });
                    }
                    card.addEventListener('click', () => {
                        const isSelected = selectedAudios.has(item.url);
                        selectedAudios[isSelected ? 'delete' : 'add'](item.url);
                        card.classList.toggle('selected', !isSelected);
                        updateModalHeaderCounters(null, filtered);
                    });
                    audioGallery.appendChild(card);
                }
            });
            // 隐藏未命中过滤条件的已有音频卡片
            existingCards.forEach((card, url) => {
                if (!filteredUrlSet.has(url)) {
                    card.style.display = 'none';
                }
            });
            if (filtered.length === 0) {
                const tip = document.createElement('div');
                tip.className = 'gallery-empty';
                tip.textContent = '当前未发现音频资源';
                audioGallery.appendChild(tip);
            }
            updateModalHeaderCounters(null, filtered);
            updateFloatingBadge(null, filtered);
        }
    }

    /**
     * 单个媒体文件原生下载
     * 
     * @param {string} url 目标文件网络链接
     * @param {string} name 自定义保存文件名
     * @param {string} ext 目标文件拓展名
     * @param {string} fallbackUrl 请求失败时的回退网络链接
     * @param {string} prefix 任务序数标识前缀
     * @returns {Promise<boolean>} 下载是否成功完成
     */
    async function downloadSingleItem(url, name = '', ext = '', fallbackUrl = '', prefix = '') {
        if (isDownloadCancelled) {
            return false;
        }
        const fileName = name || `media_${Date.now()}.${ext.toLowerCase()}`;
        const tag = prefix ? `${prefix} ` : '';
        if (url.startsWith('data:')) {
            triggerAnchorDownload(url, fileName);
            return true;
        }
        try {
            const blob = await gmRequest(url, {
                responseType: 'blob',
                prefix,
                trackProgress: true
            });
            if (isDownloadCancelled) {
                return false;
            }
            triggerAnchorDownload(URL.createObjectURL(blob), fileName);
            showToast(`${tag}下载完成`, 2000);
            return true;
        } catch (e) {
            if (isDownloadCancelled) {
                return false;
            }
            if (fallbackUrl && fallbackUrl !== url) {
                return await downloadSingleItem(fallbackUrl, name, ext, '', prefix);
            }
            if (e.message?.startsWith('HTTP ')) {
                showToast(`${tag}下载失败：${e.message}`);
                return false;
            }
            if (typeof GM_download === 'function') {
                GM_download({ url, name: fileName, saveAs: false });
                return true;
            }
            showToast(`${tag}下载失败：${e.message || '网络错误'}`);
            return false;
        }
    }

    /* 采用串行异步队列逐个下载选中的媒体文件 */
    async function downloadSelectedDirectly() {
        const isImg = currentTab === 'IMAGE';
        const selectedSet = isImg ? selectedImages : selectedAudios;
        if (selectedSet.size === 0) {
            showToast(`请先勾选需要下载的${isImg ? '图片' : '音频'}`);
            return;
        }
        isDownloadCancelled = false;
        const list = Array.from(selectedSet);
        showToast(`开始下载 (共 ${list.length} 个文件)`, 1500, cancelDownload);
        let successCount = 0;
        for (let idx = 0; idx < list.length; idx++) {
            if (isDownloadCancelled) {
                break;
            }
            const url = list[idx];
            const prefix = list.length > 1 ? `[${idx + 1}/${list.length}]` : '';
            let success = false;
            if (isImg) {
                const item = imageStore.get(url);
                const ext = (item?.format || 'jpg').toLowerCase();
                const fileName = getItemFileName(item, `image_${idx + 1}`, 'jpg');
                success = await downloadSingleItem(item?.hdUrl || url, fileName, ext, url, prefix);
            } else {
                const item = audioStore.get(url);
                const ext = (item?.format || 'mp3').toLowerCase();
                const fileName = getItemFileName(item, `audio_${idx + 1}`, 'mp3');
                success = await downloadSingleItem(url, fileName, ext, '', prefix);
            }
            if (isDownloadCancelled) {
                break;
            }
            if (success) {
                successCount++;
            }
            // 每个文件下载完成后稍作停顿缓冲防止过快触发浏览器安全拦截
            if (idx < list.length - 1 && !isDownloadCancelled) {
                await new Promise(r => setTimeout(r, 400));
            }
        }
        if (!isDownloadCancelled && list.length > 1) {
            showToast(`全部完成 (${successCount}/${list.length})`, 3000);
        }
    }

    /**
     * 拉取指定地址的二进制数据流
     * 
     * @param {string} url 目标资源网络链接
     * @param {string} prefix 任务序数标识前缀
     * @returns {Promise<Object>} 包含响应二进制数据对象的期约
     */
    async function fetchBinary(url, prefix = '') {
        if (isDownloadCancelled) {
            throw new Error('Cancelled');
        }
        if (url.startsWith('data:')) {
            const res = await fetch(url);
            return { data: await res.arrayBuffer() };
        }
        const data = await gmRequest(url, {
            responseType: 'arraybuffer',
            prefix,
            trackProgress: true
        });
        return { data };
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

    /**
     * 计算二进制数据的循环冗余校验值
     * 
     * @param {Uint8Array} bytes 待校验的二进制字节数组
     * @returns {number} 计算得到的校验数值
     */
    function calculateCrc32(bytes) {
        let crc = ~0 >>> 0;
        for (let i = 0; i < bytes.length; i++) {
            crc = crc32Table[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
        }
        return (~crc) >>> 0;
    }

    /**
     * 原生零依赖压缩包生成引擎
     * 
     * @param {Array<Object>} files 待打包的文件数据对象数组
     * @returns {Uint8Array} 生成的压缩包二进制字节数组
     */
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
            const localHeader = new Uint8Array(30 + nameBytes.length);
            const view = new DataView(localHeader.buffer);
            view.setUint32(0, 67324752, true);
            view.setUint16(4, 20, true);
            // 设置UTF-8编码标志位
            view.setUint16(6, 0x0800, true);
            view.setUint32(14, crc, true);
            view.setUint32(18, size, true);
            view.setUint32(22, size, true);
            view.setUint16(26, nameBytes.length, true);
            localHeader.set(nameBytes, 30);
            parts.push(localHeader);
            parts.push(dataBytes);
            const centralEntry = new Uint8Array(46 + nameBytes.length);
            const cView = new DataView(centralEntry.buffer);
            cView.setUint32(0, 33639248, true);
            cView.setUint16(4, 20, true);
            cView.setUint16(6, 20, true);
            cView.setUint16(8, 0x0800, true);
            cView.setUint32(16, crc, true);
            cView.setUint32(20, size, true);
            cView.setUint32(24, size, true);
            cView.setUint16(28, nameBytes.length, true);
            cView.setUint32(42, offset, true);
            centralEntry.set(nameBytes, 46);
            centralEntries.push(centralEntry);
            offset += localHeader.length + dataBytes.length;
        }
        const centralDirOffset = offset;
        const centralDirSize = centralEntries.reduce((acc, entry) => acc + entry.length, 0);
        parts.push(...centralEntries);
        const endRecord = new Uint8Array(22);
        const endView = new DataView(endRecord.buffer);
        endView.setUint32(0, 101010256, true);
        endView.setUint16(8, files.length, true);
        endView.setUint16(10, files.length, true);
        endView.setUint32(12, centralDirSize, true);
        endView.setUint32(16, centralDirOffset, true);
        parts.push(endRecord);
        const totalLen = parts.reduce((acc, p) => acc + p.length, 0);
        const result = new Uint8Array(totalLen);
        let cur = 0;
        for (const p of parts) {
            result.set(p, cur);
            cur += p.length;
        }
        return result;
    }

    /* 将选中的全部图片或音频打包为压缩包下载 */
    async function downloadSelectedAsZip() {
        const isImg = currentTab === 'IMAGE';
        const selectedSet = isImg ? selectedImages : selectedAudios;
        if (selectedSet.size === 0) {
            showToast(`请先勾选需要下载的${isImg ? '图片' : '音频'}`);
            return;
        }
        isDownloadCancelled = false;
        const selectedList = Array.from(selectedSet);
        const fileNames = selectedList.map((url, idx) => {
            if (isImg) {
                const item = imageStore.get(url);
                const padIndex = String(idx + 1).padStart(3, '0');
                return getItemFileName(item, `img_${padIndex}`, 'jpg');
            }
            const item = audioStore.get(url);
            return getItemFileName(item, `audio_${idx + 1}`, 'mp3');
        });
        // 避免同名文件在压缩包内产生冲突
        const nameOccurrences = new Map();
        const uniqueFileNames = fileNames.map(fName => {
            const count = (nameOccurrences.get(fName) || 0) + 1;
            nameOccurrences.set(fName, count);
            if (count > 1) {
                const lastDot = fName.lastIndexOf('.');
                if (lastDot > 0) {
                    return `${fName.substring(0, lastDot)}_${count}${fName.substring(lastDot)}`;
                }
                return `${fName}_${count}`;
            }
            return fName;
        });
        const filesToZip = [];
        let successCount = 0;
        showToast(`开始打包 (共 ${selectedList.length} 个文件)`, 1500, cancelDownload);
        for (let idx = 0; idx < selectedList.length; idx++) {
            if (isDownloadCancelled) {
                break;
            }
            const url = selectedList[idx];
            const prefix = selectedList.length > 1 ? `[${idx + 1}/${selectedList.length}]` : '';
            const targetUrl = isImg ? (imageStore.get(url)?.hdUrl || url) : url;
            const fileName = `${isImg ? 'images' : 'audios'}/${uniqueFileNames[idx]}`;
            let binary = null;
            try {
                binary = await fetchBinary(targetUrl, prefix);
            } catch {
                if (targetUrl !== url && !isDownloadCancelled) {
                    try {
                        binary = await fetchBinary(url, prefix);
                    } catch { }
                }
            }
            if (isDownloadCancelled) {
                break;
            }
            if (binary && binary.data) {
                filesToZip.push({ name: fileName, data: new Uint8Array(binary.data) });
                successCount++;
            }
        }
        if (isDownloadCancelled) {
            return;
        }
        if (filesToZip.length === 0) {
            showToast('资源拉取失败无法打包');
            return;
        }
        showToast('正在生成压缩包...', 60000);
        const zipBytes = createZipArchive(filesToZip);
        const zipBlob = new Blob([zipBytes], { type: 'application/zip' });
        const zipFileName = `${isImg ? 'images' : 'audios'}_pack_${Date.now()}.zip`;
        const blobUrl = URL.createObjectURL(zipBlob);
        if (typeof GM_download === 'function') {
            try {
                GM_download({
                    url: blobUrl,
                    name: zipFileName,
                    saveAs: false,
                    onload: () => setTimeout(() => URL.revokeObjectURL(blobUrl), 30000),
                    onerror: () => triggerAnchorDownload(blobUrl, zipFileName)
                });
            } catch {
                triggerAnchorDownload(blobUrl, zipFileName);
            }
        } else {
            triggerAnchorDownload(blobUrl, zipFileName);
        }
        showToast(`打包完成 (共 ${successCount} 个文件)`, 3000);
    }

    /**
     * 触发原生锚点标签下载
     * 
     * @param {string} blobUrl 待下载的二进制对象链接
     * @param {string} fileName 保存的文件名
     */
    function triggerAnchorDownload(blobUrl, fileName) {
        const downloadLink = document.createElement('a');
        downloadLink.href = blobUrl;
        downloadLink.download = fileName;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    }

    // 实现悬浮球的平滑拖拽与防误触点击
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let fabInitialLeft = 0;
    let fabInitialTop = 0;
    let hasMoved = false;

    /**
     * 限制悬浮球在可视视口边界范围内的坐标
     * 
     * @param {number} x 目标横坐标数值
     * @param {number} y 目标纵坐标数值
     * @returns {{x: number, y: number}} 裁剪后的安全坐标对象
     */
    function clampFabPosition(x, y) {
        const maxX = window.innerWidth - 64;
        const maxY = window.innerHeight - 64;
        return {
            x: Math.max(10, Math.min(x, maxX)),
            y: Math.max(10, Math.min(y, maxY))
        };
    }

    // 从持久化存储恢复悬浮球的历史位置
    const savedFabPos = (typeof GM_getValue === 'function') ? GM_getValue('ag_fab_pos', null) : null;
    if (savedFabPos?.x !== undefined && savedFabPos?.y !== undefined) {
        const { x, y } = clampFabPosition(savedFabPos.x, savedFabPos.y);
        fab.style.left = `${x}px`;
        fab.style.top = `${y}px`;
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
    }

    /**
     * 处理悬浮球全局指针拖拽位移
     * 
     * @param {PointerEvent} e 指针移动事件对象
     */
    function onPointerMove(e) {
        if (!isDragging) {
            return;
        }
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
            hasMoved = true;
        }
        const { x, y } = clampFabPosition(fabInitialLeft + dx, fabInitialTop + dy);
        fab.style.left = `${x}px`;
        fab.style.top = `${y}px`;
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
    }

    /* 处理悬浮球拖拽释放并持久化保存位置坐标 */
    function onPointerUp() {
        if (!isDragging) {
            return;
        }
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
        savedBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        fab.style.display = 'none';
        scanPageImages();
        renderGallery();
    });

    // 选项卡切换事件
    const tabImgBtn = shadow.getElementById('ag-tab-img');
    const tabAudioBtn = shadow.getElementById('ag-tab-audio');

    /**
     * 切换当前激活的媒体选项卡
     * 
     * @param {string} tab 目标选项卡标识
     */
    function switchTab(tab) {
        if (currentTab === tab) {
            return;
        }
        if (tab === 'IMAGE') {
            stopCurrentAudio();
        }
        currentTab = tab;
        if (tabImgBtn) {
            tabImgBtn.classList.toggle('active', tab === 'IMAGE');
        }
        if (tabAudioBtn) {
            tabAudioBtn.classList.toggle('active', tab === 'AUDIO');
        }
        renderGallery();
    }

    tabImgBtn?.addEventListener('click', () => switchTab('IMAGE'));
    tabAudioBtn?.addEventListener('click', () => switchTab('AUDIO'));

    shadow.getElementById('ag-btn-close').addEventListener('click', () => {
        stopCurrentAudio();
        isModalOpen = false;
        modal.classList.remove('active');
        document.body.style.overflow = savedBodyOverflow;
        fab.style.display = '';
    });

    shadow.getElementById('ag-btn-toggle-select').addEventListener('click', () => {
        const isImg = currentTab === 'IMAGE';
        const filtered = isImg ? getFilteredImages() : getFilteredAudios();
        const selectedSet = isImg ? selectedImages : selectedAudios;
        if (filtered.length === 0) {
            return;
        }
        const isAllSelected = filtered.every(item => selectedSet.has(item.url));
        const action = isAllSelected ? 'delete' : 'add';
        filtered.forEach(item => selectedSet[action](item.url));
        renderGallery();
    });

    shadow.getElementById('ag-btn-copy-links').addEventListener('click', () => {
        const isImg = currentTab === 'IMAGE';
        const selectedSet = isImg ? selectedImages : selectedAudios;
        if (selectedSet.size === 0) {
            showToast(`请先勾选需要复制的${isImg ? '图片' : '音频'}`);
            return;
        }
        const list = Array.from(selectedSet);
        copyToClipboard(list.join('\n'), `已复制 ${list.length} 条${isImg ? '图片' : '音频'}链接到剪贴板`);
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

    const searchInput = shadow.getElementById('ag-search-input');
    if (searchInput) {
        const searchWrap = shadow.getElementById('ag-search-wrap');
        const searchClear = shadow.getElementById('ag-search-clear');
        // 阻止输入框按键冒泡防止触发宿主网页的全局快捷键
        searchInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
        });
        searchInput.addEventListener('input', () => {
            audioSearchKeyword = searchInput.value.trim().toLowerCase();
            searchWrap.classList.toggle('has-value', searchInput.value.length > 0);
            renderGallery();
        });
        if (searchClear) {
            searchClear.addEventListener('click', () => {
                searchInput.value = '';
                audioSearchKeyword = '';
                searchWrap.classList.remove('has-value');
                renderGallery();
                searchInput.focus();
            });
        }
    }

    /* 初始启动扫描与动态监听 */
    function init() {
        scanPageImages();
        setupDynamicObserver();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 300);
    }

})();
