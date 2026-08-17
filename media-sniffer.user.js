// ==UserScript==
// @name         媒体嗅探器
// @namespace    https://greasyfork.org/users/1203191
// @version      1.1.4
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
    // 存储所有已嗅探到的图片对象集合
    const imageStore = new Map();
    // 存储所有已嗅探到的音频对象集合
    const audioStore = new Map();
    // 记录上一次处理的AList目录路径
    let lastAListPath = '';
    let currentTab = 'IMAGE';
    let isModalOpen = false;
    let selectedImages = new Set();
    let selectedAudios = new Set();
    let enableDeduplication = true;
    let knownImageFormats = new Set();
    let activeImageFormatFilters = new Set();
    let knownAudioFormats = new Set();
    let activeAudioFormatFilters = new Set();
    let audioSearchKeyword = '';
    let savedBodyOverflow = null;
    let currentPlayingAudio = null;

    /* 停止当前正在播放的音频实例 */
    function stopCurrentAudio() {
        if (currentPlayingAudio) {
            currentPlayingAudio.pause();
            currentPlayingAudio = null;
        }
    }

    // 识别音频文件常见后缀特征
    const AUDIO_EXT_REGEX = /\.(mp3|m4a|aac|flac|wav|ogg|opus)(\?.*)?$/i;

    /**
     * 从网络链接或MIME类型推断规范的音频格式名称
     * 
     * @param {string} url 音频链接
     * @param {string} mime MIME类型字符串
     * @returns {string} 规范化的音频格式名称
     */
    function detectAudioFormat(url, mime = '') {
        const m = `${url} ${mime}`.match(/\b(mp3|mpeg|m4a|mp4|flac|wav|aac|ogg|opus)\b/i);
        return m ? m[1].toUpperCase().replace('MPEG', 'MP3').replace('MP4', 'M4A') : 'AUDIO';
    }

    /**
     * 从网络链接中提取文件名
     * 
     * @param {string} url 目标网络链接
     * @param {string} defaultName 默认回退文件名
     * @returns {string} 提取出的文件名
     */
    function extractFileName(url, defaultName = 'audio_track') {
        try {
            const pathname = new URL(url, window.location.href).pathname;
            const segment = pathname.split('/').filter(Boolean).pop();
            if (segment) {
                return decodeURIComponent(segment);
            }
        } catch (e) { }
        return defaultName;
    }

    /**
     * 从字符串中提取规范的绝对网络链接
     * 
     * @param {string} url 原始网络链接字符串
     * @returns {string} 规范化的绝对网络链接
     */
    function normalizeUrl(url) {
        if (!url || typeof url !== 'string') {
            return '';
        }
        url = url.trim().replace(/^url\(["']?|["']?\)$/gi, '');
        if (!url || /undefined|null|\[object/i.test(url)) {
            return '';
        }
        if (url.startsWith('data:') || url.startsWith('blob:')) {
            return url;
        }
        try {
            return new URL(url, window.location.href).href;
        } catch (e) {
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
        if (!url || typeof url !== 'string') {
            return url;
        }
        if (url.startsWith('data:') || url.startsWith('blob:')) {
            return url;
        }
        let hdUrl = url;
        hdUrl = hdUrl.replace(/!(small|thumb|preview|middle|large|webp|\d+w|\d+h).*/i, '');
        hdUrl = hdUrl.replace(/@\d+[wh]_\d+[wh].*/i, '');
        hdUrl = hdUrl.replace(/_(thumb|small|preview)\.(jpg|png|jpeg|webp)/i, '.$2');
        hdUrl = hdUrl.replace(/\/thumb\/\d+\//i, '/original/');
        hdUrl = hdUrl.replace(/\.webp$/i, '.jpg');
        return hdUrl;
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
     * 注册音频对象到全局存储集合
     * 
     * @param {string} rawUrl 音频网络链接
     * @param {string} source 触发捕获的来源标识
     * @param {Object} meta 携带的附加元数据对象
     */
    function registerAudio(rawUrl, source = 'NETWORK', meta = {}) {
        const url = normalizeUrl(rawUrl);
        if (!url || url.length < 5) {
            return;
        }
        // 跳过m3u8流媒体播放列表
        if (/\.m3u8(\?|$)/i.test(url) || (meta.mime && meta.mime.includes('mpegurl'))) {
            return;
        }
        if (audioStore.has(url)) {
            const exist = audioStore.get(url);
            if (meta.name && !exist.name) {
                exist.name = meta.name;
            }
            if (meta.size && !exist.size) {
                exist.size = meta.size;
            }
            return;
        }
        const format = meta.format || detectAudioFormat(url, meta.mime);
        if (format && !knownAudioFormats.has(format)) {
            knownAudioFormats.add(format);
            activeAudioFormatFilters.add(format);
        }
        const name = meta.name || extractFileName(url, `audio_${audioStore.size + 1}.${format.toLowerCase()}`);
        const audioObj = {
            url: url,
            name: name,
            format: format,
            source: source,
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
     * 深度递归扫描对象中潜藏的音频网络链接
     * 
     * @param {*} obj 待扫描的任意数据载荷
     * @param {number} depth 当前递归深度层级
     */
    function deepScanForMedia(obj, depth = 0) {
        if (!obj || depth > 6) {
            return;
        }
        if (typeof obj === 'string') {
            if (AUDIO_EXT_REGEX.test(obj)) {
                registerAudio(obj, 'API_PAYLOAD');
            }
            return;
        }
        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                deepScanForMedia(obj[i], depth + 1);
            }
            return;
        }
        if (typeof obj === 'object') {
            for (const key of Object.keys(obj)) {
                const val = obj[key];
                if (typeof val === 'string') {
                    if (/^(url|src|playUrl|play_url|audioUrl|audio_url|streamUrl|file_url|raw_url|download_url)$/i.test(key)) {
                        if (val.startsWith('http') && (AUDIO_EXT_REGEX.test(val) || val.includes('/audio/') || val.includes('/sound/'))) {
                            const nameVal = obj['name'] || obj['title'] || obj['fileName'] || obj['songName'] || '';
                            registerAudio(val, 'API_PAYLOAD', { name: nameVal, size: obj['size'] || 0 });
                        }
                    }
                }
                deepScanForMedia(val, depth + 1);
            }
        }
    }

    /**
     * 解析处理网盘响应数据并注册音频资源
     * 
     * @param {Object} json 网盘接口返回的响应对象
     */
    function handleAListResponse(json) {
        if (!json || json.code !== 200 || !json.data || !Array.isArray(json.data.content)) {
            return;
        }
        // 获取当前路径
        const currentPath = json.data.path
            ? decodeURIComponent(json.data.path)
            : decodeURIComponent(window.location.pathname);
        // 检测路径是否发生变化
        if (lastAListPath !== '' && lastAListPath !== currentPath) {
            audioStore.clear();
            selectedAudios.clear();
            knownAudioFormats.clear();
            activeAudioFormatFilters.clear();
            updateFloatingBadge();
            if (isModalOpen) {
                updateModalHeaderCounters();
                renderGallery();
            }
        }
        lastAListPath = currentPath;
        const list = json.data.content;
        // 过滤出音频文件
        const audioItems = list.filter(item => !item['is_dir'] && AUDIO_EXT_REGEX.test(item.name));
        if (audioItems.length === 0) {
            return;
        }
        // 遍历音频文件并构建直链注册到音频集合
        audioItems.forEach(item => {
            // 拼接完整路径
            const fullPath = (item.path && typeof item.path === 'string')
                ? item.path
                : `${currentPath.replace(/\/$/, '')}/${item.name}`;
            const directUrl = `${window.location.origin}/d${encodeURI(fullPath)}`;
            const fmt = item.name.split('.').pop().toUpperCase();
            // 存在签名则追加签名参数否则直接使用直链
            const finalUrl = item.sign ? `${directUrl}?sign=${item.sign}` : directUrl;
            registerAudio(finalUrl, 'ALIST_LIST', {
                name: item.name,
                size: item.size || 0,
                format: fmt
            });
        });
    }

    // 拦截全局网络请求以实时捕获音频链接与数据接口
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const reqUrl = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
        if (reqUrl && AUDIO_EXT_REGEX.test(reqUrl)) {
            registerAudio(reqUrl, 'FETCH');
        }
        const response = await originalFetch.apply(this, args);
        try {
            const clone = response.clone();
            const contentType = clone.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                clone.json().then(data => {
                    if (reqUrl.includes('/api/fs/list')) {
                        handleAListResponse(data);
                    } else if (reqUrl.includes('/api/fs/get') && data?.data?.['raw_url']) {
                        registerAudio(data.data['raw_url'], 'ALIST_GET', {
                            name: data.data.name,
                            size: data.data.size
                        });
                    } else {
                        deepScanForMedia(data);
                    }
                }).catch(() => { });
            } else if (contentType.startsWith('audio/')) {
                registerAudio(reqUrl, 'FETCH_MIME', { mime: contentType });
            }
        } catch (e) { }
        return response;
    };

    // 拦截全局异步请求对象以捕获音频请求
    const originalXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        if (url && typeof url === 'string' && AUDIO_EXT_REGEX.test(url)) {
            registerAudio(url, 'XHR');
        }
        this.addEventListener('load', function () {
            try {
                const ct = this.getResponseHeader('content-type') || '';
                if (ct.includes('application/json') && this.responseText) {
                    const data = JSON.parse(this.responseText);
                    if (typeof url === 'string' && url.includes('/api/fs/list')) {
                        handleAListResponse(data);
                    } else {
                        deepScanForMedia(data);
                    }
                } else if (ct.startsWith('audio/')) {
                    registerAudio(url, 'XHR_MIME', { mime: ct });
                }
            } catch (e) { }
        });
        return originalXhrOpen.apply(this, arguments);
    };

    // 拦截音频构造函数以捕获内存中创建的音频实例
    const OriginalAudio = window.Audio;
    window.Audio = function (src) {
        if (src) {
            registerAudio(src, 'NEW_AUDIO');
        }
        return new OriginalAudio(src);
    };
    window.Audio.prototype = OriginalAudio.prototype;

    // 拦截音频元素地址赋值操作
    const audioSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    if (audioSrcDescriptor && audioSrcDescriptor.set) {
        const rawSet = audioSrcDescriptor.set;
        Object.defineProperty(HTMLMediaElement.prototype, 'src', {
            set(val) {
                if (val && typeof val === 'string' && (this.tagName === 'AUDIO' || AUDIO_EXT_REGEX.test(val))) {
                    registerAudio(val, 'MEDIA_ELEMENT_SRC');
                }
                return rawSet.call(this, val);
            },
            get: audioSrcDescriptor.get
        });
    }

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
        } catch (e) {
            // 遇到跨域限制时回退为尺寸哈希
            return `dim_${imgEl.naturalWidth || 0}x${imgEl.naturalHeight || 0}`;
        }
    }

    /**
     * 通过二进制魔数特征推导真实图片格式
     * 
     * @param {Uint8Array} bytes 图片二进制字节数组
     * @returns {string} 推导出的图片格式名称
     */
    function detectFormatFromBytes(bytes) {
        if (!bytes || bytes.length < 12) {
            return '';
        }
        if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
            return 'PNG';
        }
        if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
            return 'JPG';
        }
        if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
            bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
            return 'WEBP';
        }
        if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
            return 'GIF';
        }
        if (bytes[0] === 0x3c) {
            const head = String.fromCharCode(...bytes.slice(0, 100)).toLowerCase();
            if (head.includes('<svg') || head.includes('<?xml')) {
                return 'SVG';
            }
        }
        return '';
    }

    /**
     * 拉取图片计算二进制唯一指纹与真实格式
     * 
     * @param {string} url 目标图片网络链接
     * @returns {Promise} 包含哈希与真实格式的期约对象
     */
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

    /**
     * 根据图片链接特征推断格式类型
     * 
     * @param {string} url 图片网络链接
     * @returns {string} 推断出的图片格式大写名称
     */
    function detectImageFormat(url) {
        const m = url.match(/data:image\/(svg|png|jpe?g|webp)|(?:\.|\b(?:format|f)=)(png|jpe?g|webp|svg|gif|avif)(?:[?&#]|$)/i);
        return m ? (m[1] || m[2]).toUpperCase().replace('JPEG', 'JPG') : (url.startsWith('data:') ? 'DATA' : 'JPG');
    }

    /**
     * 动态刷新图片卡片上的真实格式标签
     * 
     * @param {Object} item 目标图片数据对象
     */
    function updateCardFormatDisplay(item) {
        const cards = shadow.querySelectorAll('.img-card');
        cards.forEach(card => {
            if (card.dataset.url === item.url) {
                const badge = card.querySelector('.media-format-badge');
                if (badge) {
                    badge.textContent = item.format;
                }
            }
        });
    }

    /**
     * 注册图片对象到全局存储集合
     * 
     * @param {string} rawUrl 图片网络链接
     * @param {string} source 触发捕获的来源标识
     */
    function registerImage(rawUrl, source = 'DOM') {
        const url = normalizeUrl(rawUrl);
        if (!url || url.length < 5) {
            return;
        }
        if (url.startsWith('data:image/') && url.length < 150) {
            return;
        }
        if (imageStore.has(url)) {
            return;
        }
        const format = detectImageFormat(url);
        if (!knownImageFormats.has(format)) {
            knownImageFormats.add(format);
            activeImageFormatFilters.add(format);
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
            if (isModalOpen && currentTab === 'IMAGE' && enableDeduplication) {
                renderGallery();
            }
        };
        tempImg.onerror = function () {
            imgObj.loaded = true;
            updateFloatingBadge();
        };
        tempImg.src = url;
        // 异步计算二进制指纹以实现去重与格式矫正
        fetchBinaryFingerprint(url).then(info => {
            if (info.format && info.format !== imgObj.format) {
                imgObj.format = info.format;
                if (!knownImageFormats.has(info.format)) {
                    knownImageFormats.add(info.format);
                    activeImageFormatFilters.add(info.format);
                }
                if (isModalOpen && currentTab === 'IMAGE') {
                    updateCardFormatDisplay(imgObj);
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

    /* 深度扫描当前文档中的所有图片元素 */
    function scanPageImages() {
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
                            if (u) {
                                registerImage(u, 'IMG-SRCSET');
                            }
                        });
                    } else {
                        registerImage(val, 'IMG');
                    }
                }
            }
        });
        // 扫描带有背景样式的容器元素
        const bgNodes = document.querySelectorAll('[style*="background"], [style*="url("]');
        bgNodes.forEach(node => {
            const style = node.getAttribute('style') || '';
            const matches = style.match(/url\(["']?([^"']+)["']?\)/gi);
            if (matches) {
                matches.forEach(m => {
                    const clean = m.replace(/^url\(["']?/i, '').replace(/["']?\)$/i, '');
                    registerImage(clean, 'CSS-BG');
                });
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
            } catch (e) { }
        });
        updateFloatingBadge();
    }

    /* 深度扫描当前文档中的所有音频标签与自定义播放器属性 */
    function scanPageAudios() {
        const audioElements = document.querySelectorAll('audio, audio source');
        audioElements.forEach(el => {
            const src = el.getAttribute('src') || el.currentSrc;
            if (src) {
                registerAudio(src, 'DOM_AUDIO');
            }
        });
        const customNodes = document.querySelectorAll('[data-audio], [data-mp3], [data-sound], [data-url], [data-src]');
        customNodes.forEach(node => {
            ['data-audio', 'data-mp3', 'data-sound', 'data-url', 'data-src'].forEach(attr => {
                const val = node.getAttribute(attr);
                if (val && typeof val === 'string' && AUDIO_EXT_REGEX.test(val)) {
                    registerAudio(val, 'DOM_DATASET');
                }
            });
        });
        updateFloatingBadge();
    }

    /* 挂载动态观察器实时捕获异步渲染的新媒体元素 */
    function setupDynamicObserver() {
        let timer = null;
        const observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                scanPageImages();
                scanPageAudios();
            }, 400);
        });
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'style', 'class'] });
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                if (document.body) {
                    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'style', 'class'] });
                }
            });
        }
        window.addEventListener('scroll', () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                scanPageImages();
                scanPageAudios();
            }, 500);
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
    if (document.documentElement) {
        attachContainer();
    } else {
        document.addEventListener('DOMContentLoaded', attachContainer);
    }
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

    // 构建界面悬浮球与弹窗节点
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
            <div class="header-left">
                <div class="header-title">
                    <svg viewBox="0 0 24 24"><path d="M12 15c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm0-8c2.76 0 5 2.24 5 5s-2.24 5-5 5-5-2.24-5-5 2.24-5 5-5zm0-4C6.48 3 2 7.48 2 13c0 3.7 2.01 6.92 4.99 8.65l1.35-2.32C6.16 18.02 5 15.65 5 13c0-3.87 3.13-7 7-7s7 3.13 7 7c0 2.65-1.16 5.02-3.34 6.33l1.35 2.32C20 19.92 22 16.7 22 13c0-5.52-4.48-10-10-10z"/></svg>
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
                    <svg style="width:20px;height:20px;fill:currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
            </div>
        </div>
        <div class="filter-bar">
            <div class="filter-group">
                <div class="filter-format-container" id="ag-format-checkboxes"></div>
                <label class="filter-item filter-dedup-label" id="ag-dedup-label-wrap"><input type="checkbox" id="ag-filter-dedup" class="filter-checkbox" checked> 智能去重</label>
            </div>
            <span class="search-wrap" id="ag-search-wrap" style="display:none">
                <svg class="search-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"/></svg>
                <input type="text" id="ag-search-input" class="search-input">
                <span class="search-clear" id="ag-search-clear"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:inherit"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></span>
            </span>
        </div>
        <div class="modal-body">
            <div class="gallery-grid" id="ag-gallery"></div>
        </div>
    `;
    shadow.appendChild(modal);

    const toast = document.createElement('div');
    toast.className = 'toast-notify';
    shadow.appendChild(toast);

    /**
     * 弹出底部半透明状态提示气泡
     * 
     * @param {string} msg 提示消息文本
     * @param {number} duration 显示持续时间毫秒数
     */
    function showToast(msg, duration = 2500) {
        toast.textContent = msg;
        toast.classList.add('active');
        setTimeout(() => {
            toast.classList.remove('active');
        }, duration);
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
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(text).catch(() => { });
        }
        if (successMsg) {
            showToast(successMsg);
        }
    }

    /* 统一刷新悬浮球角标数量统计 */
    function updateFloatingBadge() {
        const badge = shadow.getElementById('ag-badge');
        if (badge) {
            const filteredImg = getFilteredImages().length;
            const filteredAudio = getFilteredAudios().length;
            const total = filteredImg + filteredAudio;
            badge.textContent = String(total);
        }
    }

    /* 刷新弹窗头部选项卡数量与选中计数 */
    function updateModalHeaderCounters() {
        const tabImg = shadow.getElementById('ag-tab-img');
        const tabAudio = shadow.getElementById('ag-tab-audio');
        const countSpan = shadow.getElementById('ag-selected-count');
        if (tabImg) {
            tabImg.textContent = `图片 (${getFilteredImages().length})`;
        }
        if (tabAudio) {
            tabAudio.textContent = `音频 (${getFilteredAudios().length})`;
        }
        const selectedSet = currentTab === 'IMAGE' ? selectedImages : selectedAudios;
        if (countSpan) {
            countSpan.textContent = `(已选中 ${selectedSet.size} 项)`;
        }
        const toggleBtn = shadow.getElementById('ag-btn-toggle-select');
        if (toggleBtn) {
            const activeList = currentTab === 'IMAGE' ? getFilteredImages() : getFilteredAudios();
            const isAll = activeList.length > 0 && activeList.every(i => selectedSet.has(i.url));
            toggleBtn.textContent = isAll ? '取消全选' : '全选';
        }
    }

    /* 动态统计当前模态下的格式并渲染筛选复选框 */
    function renderFormatFilters() {
        const container = shadow.getElementById('ag-format-checkboxes');
        const dedupWrap = shadow.getElementById('ag-dedup-label-wrap');
        if (!container) {
            return;
        }
        if (currentTab === 'IMAGE') {
            if (dedupWrap) {
                dedupWrap.style.display = 'inline-flex';
            }
            const searchWrap = shadow.getElementById('ag-search-wrap');
            if (searchWrap) searchWrap.style.display = 'none';
            const formatCounts = new Map();
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
            if (formatCounts.size === 0) {
                container.innerHTML = '<span class="format-count">暂无图片格式</span>';
                return;
            }
            let checkedCount = 0;
            formatCounts.forEach((count, fmt) => {
                if (activeImageFormatFilters.has(fmt)) {
                    checkedCount++;
                }
            });
            const isAllChecked = formatCounts.size > 0 && checkedCount === formatCounts.size;
            const isIndeterminate = checkedCount > 0 && checkedCount < formatCounts.size;
            let html = '';
            if (formatCounts.size > 1) {
                html += `<label class="filter-item"><input type="checkbox" class="filter-format-all-checkbox" ${isAllChecked ? 'checked' : ''}> 全部</label>`;
            }
            formatCounts.forEach((count, fmt) => {
                const isChecked = activeImageFormatFilters.has(fmt) ? 'checked' : '';
                html += `<label class="filter-item"><input type="checkbox" class="filter-format-checkbox" value="${fmt}" ${isChecked}> ${fmt}<span class="format-count">（${count}）</span></label>`;
            });
            container.innerHTML = html;
            const allCheckbox = container.querySelector('.filter-format-all-checkbox');
            if (allCheckbox) {
                allCheckbox.indeterminate = isIndeterminate;
                allCheckbox.addEventListener('change', () => {
                    if (allCheckbox.checked) {
                        formatCounts.forEach((_, fmt) => {
                            activeImageFormatFilters.add(fmt);
                        });
                    } else {
                        activeImageFormatFilters.clear();
                    }
                    renderGallery();
                });
            }
            container.querySelectorAll('.filter-format-checkbox').forEach(cb => {
                cb.addEventListener('change', () => {
                    if (cb.checked) {
                        activeImageFormatFilters.add(cb.value);
                    } else {
                        activeImageFormatFilters.delete(cb.value);
                    }
                    renderGallery();
                });
            });
        } else {
            if (dedupWrap) {
                dedupWrap.style.display = 'none';
            }
            const searchWrap = shadow.getElementById('ag-search-wrap');
            if (searchWrap) {
                searchWrap.style.display = 'inline-flex';
            }
            const formatCounts = new Map();
            audioStore.forEach(item => {
                const fmt = item.format || 'AUDIO';
                formatCounts.set(fmt, (formatCounts.get(fmt) || 0) + 1);
            });
            if (formatCounts.size === 0) {
                container.innerHTML = '<span class="format-count">暂无音频格式</span>';
                return;
            }
            let checkedCount = 0;
            formatCounts.forEach((count, fmt) => {
                if (activeAudioFormatFilters.has(fmt)) {
                    checkedCount++;
                }
            });
            const isAllChecked = formatCounts.size > 0 && checkedCount === formatCounts.size;
            const isIndeterminate = checkedCount > 0 && checkedCount < formatCounts.size;
            let html = '';
            if (formatCounts.size > 1) {
                html += `<label class="filter-item"><input type="checkbox" class="filter-format-all-checkbox" ${isAllChecked ? 'checked' : ''}> 全部</label>`;
            }
            formatCounts.forEach((count, fmt) => {
                const isChecked = activeAudioFormatFilters.has(fmt) ? 'checked' : '';
                html += `<label class="filter-item"><input type="checkbox" class="filter-format-checkbox" value="${fmt}" ${isChecked}> ${fmt}<span class="format-count">（${count}）</span></label>`;
            });
            container.innerHTML = html;
            const allAudioCheckbox = container.querySelector('.filter-format-all-checkbox');
            if (allAudioCheckbox) {
                allAudioCheckbox.indeterminate = isIndeterminate;
                allAudioCheckbox.addEventListener('change', () => {
                    if (allAudioCheckbox.checked) {
                        formatCounts.forEach((_, fmt) => {
                            activeAudioFormatFilters.add(fmt);
                        });
                    } else {
                        activeAudioFormatFilters.clear();
                    }
                    renderGallery();
                });
            }
            container.querySelectorAll('.filter-format-checkbox').forEach(cb => {
                cb.addEventListener('change', () => {
                    if (cb.checked) {
                        activeAudioFormatFilters.add(cb.value);
                    } else {
                        activeAudioFormatFilters.delete(cb.value);
                    }
                    renderGallery();
                });
            });
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
            if (knownImageFormats.has(item.format) && !activeImageFormatFilters.has(item.format)) {
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
            if (knownAudioFormats.has(item.format) && !activeAudioFormatFilters.has(item.format)) {
                return;
            }
            if (audioSearchKeyword && !`${item.name} ${item.url}`.toLowerCase().includes(audioSearchKeyword)) {
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
            if (currentTab === 'IMAGE' && enableDeduplication && dupCount > 0) {
                el.textContent = `(已智能去重 ${dupCount} 张)`;
            } else {
                el.textContent = '';
            }
        }
    }

    /* 渲染当前选项卡下的媒体画廊或音频列表 */
    function renderGallery() {
        stopCurrentAudio();
        renderFormatFilters();
        const gallery = shadow.getElementById('ag-gallery');
        if (!gallery) {
            return;
        }
        if (currentTab === 'IMAGE') {
            gallery.className = 'gallery-grid';
            const filtered = getFilteredImages();
            gallery.innerHTML = '';
            if (filtered.length === 0) {
                gallery.innerHTML = '<div class="gallery-empty">当前未发现匹配的图片资源</div>';
                updateModalHeaderCounters();
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
                    if (imgEl && imgEl.naturalWidth && imgEl.naturalHeight) {
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
                if (imgEl && imgEl.complete && imgEl.naturalWidth) {
                    onThumbLoad();
                } else if (imgEl) {
                    imgEl.addEventListener('load', onThumbLoad);
                }
                card.addEventListener('click', () => {
                    if (selectedImages.has(item.url)) {
                        selectedImages.delete(item.url);
                        card.classList.remove('selected');
                    } else {
                        selectedImages.add(item.url);
                        card.classList.add('selected');
                    }
                    updateModalHeaderCounters();
                });
                gallery.appendChild(card);
            });
        } else {
            gallery.className = 'audio-list';
            const filtered = getFilteredAudios();
            gallery.innerHTML = '';
            if (filtered.length === 0) {
                gallery.innerHTML = '<div class="gallery-empty">当前未发现音频资源</div>';
                updateModalHeaderCounters();
                return;
            }
            filtered.forEach(item => {
                const card = document.createElement('div');
                card.dataset.url = item.url;
                card.className = 'audio-card' + (selectedAudios.has(item.url) ? ' selected' : '');
                const sizeStr = formatBytes(item.size);
                card.innerHTML = `
                    <div class="audio-left">
                        <div class="select-checkbox-box">
                            <svg class="select-check-svg" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                        </div>
                        <div class="audio-icon-box">
                            <svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                        </div>
                        <div class="audio-info">
                            <div class="audio-name" title="点击复制文件名">${item.name}</div>
                            <div class="audio-meta-row">
                                <span class="audio-format-badge">${item.format}</span>
                                ${sizeStr ? `<span>${sizeStr}</span>` : ''}
                                <span>来源: ${item.source}</span>
                            </div>
                        </div>
                    </div>
                    <div class="audio-right">
                        <div class="audio-player-wrapper">
                            <audio controls preload="none" src="${item.url}"></audio>
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
                        if (currentPlayingAudio && currentPlayingAudio !== audioPlayer) {
                            currentPlayingAudio.pause();
                        }
                        currentPlayingAudio = audioPlayer;
                    });
                }
                card.addEventListener('click', () => {
                    if (selectedAudios.has(item.url)) {
                        selectedAudios.delete(item.url);
                        card.classList.remove('selected');
                    } else {
                        selectedAudios.add(item.url);
                        card.classList.add('selected');
                    }
                    updateModalHeaderCounters();
                });
                gallery.appendChild(card);
            });
        }
        updateModalHeaderCounters();
        updateFloatingBadge();
    }

    /**
     * 单个媒体文件原生下载
     * 
     * @param {string} url 目标文件网络链接
     * @param {string} name 自定义保存文件名
     * @param {string} ext 目标文件拓展名
     */
    function downloadSingleItem(url, name, ext) {
        const fileName = name || `media_${Date.now()}.${ext.toLowerCase()}`;
        if (url.startsWith('data:')) {
            triggerAnchorDownload(url, fileName);
            return;
        }
        // 先用GM_xmlhttpRequest携带Cookie拉取并校验响应状态再保存
        if (typeof GM_xmlhttpRequest === 'function') {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'blob',
                headers: { 'Referer': window.location.href },
                cookie: document.cookie,
                onload: (res) => {
                    if (res.status >= 200 && res.status < 300) {
                        triggerAnchorDownload(URL.createObjectURL(res.response), fileName);
                    } else {
                        showToast(`下载失败：服务器返回 ${res.status}，该链接可能需要登录或已过期`);
                    }
                },
                onerror: () => showToast(`下载失败：网络错误，请检查链接是否有效`)
            });
        } else if (typeof GM_download === 'function') {
            GM_download({ url: url, name: fileName, saveAs: false });
        } else {
            triggerAnchorDownload(url, fileName);
        }
    }

    /* 逐个下载选中的媒体文件 */
    function downloadSelectedDirectly() {
        const isImg = currentTab === 'IMAGE';
        const selectedSet = isImg ? selectedImages : selectedAudios;
        if (selectedSet.size === 0) {
            showToast(`请先勾选需要下载的${isImg ? '图片' : '音频'}`);
            return;
        }
        const list = Array.from(selectedSet);
        showToast(`已开始下载 ${list.length} 个${isImg ? '图片' : '音频'}文件`);
        list.forEach((url, idx) => {
            setTimeout(() => {
                if (isImg) {
                    const item = imageStore.get(url);
                    downloadSingleItem(item.hdUrl || item.url, `image_${idx + 1}.${(item.format || 'jpg').toLowerCase()}`, item.format || 'jpg');
                } else {
                    const item = audioStore.get(url);
                    downloadSingleItem(item.url, item.name, item.format || 'mp3');
                }
            }, idx * 220);
        });
    }

    /**
     * 跨域拉取二进制数据并封装为异步期约
     * 
     * @param {string} url 目标资源网络链接
     * @returns {Promise} 包含响应数据与状态的期约对象
     */
    function fetchBinary(url) {
        return new Promise((resolve, reject) => {
            if (url.startsWith('data:')) {
                const parts = url.split(',');
                const byteString = atob(parts[1]);
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) {
                    ia[i] = byteString.charCodeAt(i);
                }
                resolve({ data: ab });
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
                            resolve({ data: res.response });
                        } else {
                            reject(new Error('HTTP status ' + res.status));
                        }
                    },
                    onerror: () => reject(new Error('Network error'))
                });
            } else {
                fetch(url)
                    .then(res => res.arrayBuffer())
                    .then(ab => resolve({ data: ab }))
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
            const centralEntry = new Uint8Array(46 + nameBytes.length);
            const cView = new DataView(centralEntry.buffer);
            cView.setUint32(0, 33639248, true);
            cView.setUint16(4, 20, true);
            cView.setUint16(6, 20, true);
            cView.setUint16(8, 0x0800, true);
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
        let totalLen = 0;
        for (const p of parts) {
            totalLen += p.length;
        }
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
        const selectedList = Array.from(selectedSet);
        const filesToZip = [];
        let successCount = 0;
        showToast(`正在下载并打包 0/${selectedList.length} 个文件请稍候`, 60000);
        const tasks = selectedList.map(async (url, idx) => {
            try {
                let targetUrl;
                let fileName;
                if (isImg) {
                    const item = imageStore.get(url);
                    targetUrl = (item && item.hdUrl) ? item.hdUrl : url;
                    const realExt = (item && item.format ? item.format : 'jpg').toLowerCase();
                    const padIndex = String(idx + 1).padStart(3, '0');
                    fileName = `images/img_${padIndex}.${realExt}`;
                } else {
                    const item = audioStore.get(url);
                    targetUrl = url;
                    const rawName = item?.name || extractFileName(url, `audio_${idx + 1}.mp3`);
                    fileName = `audios/${rawName}`;
                }
                const binary = await fetchBinary(targetUrl);
                const rawBytes = new Uint8Array(binary.data);
                filesToZip.push({ name: fileName, data: rawBytes });
                successCount++;
                showToast(`已成功获取 ${successCount}/${selectedList.length} 个文件`, 60000);
            } catch (e) { }
        });
        await Promise.all(tasks);
        if (filesToZip.length === 0) {
            showToast('资源拉取失败无法打包');
            return;
        }
        showToast('正在生成压缩文件请稍候');
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
            } catch (e) {
                triggerAnchorDownload(blobUrl, zipFileName);
            }
        } else {
            triggerAnchorDownload(blobUrl, zipFileName);
        }
        showToast(`成功打包下载 ${successCount} 个文件`);
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
        const maxX = window.innerWidth - 64;
        const maxY = window.innerHeight - 64;
        const newLeft = Math.max(10, Math.min(fabInitialLeft + dx, maxX));
        const newTop = Math.max(10, Math.min(fabInitialTop + dy, maxY));
        fab.style.left = `${newLeft}px`;
        fab.style.top = `${newTop}px`;
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
        scanPageAudios();
        renderGallery();
    });

    // 选项卡切换事件
    const tabImgBtn = shadow.getElementById('ag-tab-img');
    const tabAudioBtn = shadow.getElementById('ag-tab-audio');

    if (tabImgBtn) {
        tabImgBtn.addEventListener('click', () => {
            stopCurrentAudio();
            currentTab = 'IMAGE';
            tabImgBtn.classList.add('active');
            tabAudioBtn.classList.remove('active');
            renderGallery();
        });
    }

    if (tabAudioBtn) {
        tabAudioBtn.addEventListener('click', () => {
            currentTab = 'AUDIO';
            tabAudioBtn.classList.add('active');
            tabImgBtn.classList.remove('active');
            renderGallery();
        });
    }

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
        if (isAllSelected) {
            filtered.forEach(item => selectedSet.delete(item.url));
        } else {
            filtered.forEach(item => selectedSet.add(item.url));
        }
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
        const text = list.join('\n');
        copyToClipboard(text, `已复制 ${list.length} 条${isImg ? '图片' : '音频'}链接到剪贴板`);
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
        scanPageAudios();
        setupDynamicObserver();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 300);
    }

})();
