// ==UserScript==
// @name         媒体嗅探器
// @namespace    https://greasyfork.org/users/1203191
// @version      1.6.5
// @description  嗅探媒体资源并下载
// @author       tianxing-ovo
// @icon         https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/media-sniffer-icon.png
// @match        *://*/*
// @run-at       document-start
// @require      https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_openInTab
// @connect      *
// @license      Apache-2.0
// @homepageURL  https://github.com/tianxing-ovo/Tampermonkey
// @supportURL   https://github.com/tianxing-ovo/Tampermonkey/issues
// @updateURL    https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/media-sniffer.user.js
// @downloadURL  https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/media-sniffer.user.js
// ==/UserScript==

/* global GM_download, GM_xmlhttpRequest, GM_setClipboard, GM_getValue, GM_setValue, GM_openInTab, Hls */

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
    // {key = 视频地址, value = 视频对象}
    const videoStore = new Map();
    // key = 纯净音频地址
    const cleanAudioUrls = new Set();
    // key = 纯净视频地址
    const cleanVideoUrls = new Set();
    // 存储选中的图片链接集合
    const selectedImages = new Set();
    // 存储选中的音频链接集合
    const selectedAudios = new Set();
    // 存储选中的视频链接集合
    const selectedVideos = new Set();
    // 存储已识别的图片格式集合
    const knownImageFormats = new Set();
    // 存储当前已勾选的图片格式集合
    const checkedImageFormats = new Set();
    // 存储已识别的音频格式集合
    const knownAudioFormats = new Set();
    // 存储当前已勾选的音频格式集合
    const checkedAudioFormats = new Set();
    // 存储已识别的视频格式集合
    const knownVideoFormats = new Set();
    // 存储当前已勾选的视频格式集合
    const checkedVideoFormats = new Set();
    // 记录上一次处理的网盘目录路径
    let lastAListPath = '';
    let currentTab = 'IMAGE';
    let isModalOpen = false;
    let enableDeduplication = true;
    let audioSearchKeyword = '';
    let videoSearchKeyword = '';
    let savedBodyOverflow = null;
    let currentPlayingAudio = null;
    let currentPlayingVideo = null;
    let currentPlayingCard = null;
    let currentPlayingType = null;
    const PLAY_MODES = {
        ORDER: 'ORDER',
        LOOP: 'LOOP',
        RANDOM: 'RANDOM'
    };
    let currentPlayMode = GM_getValue('ag_media_play_mode', PLAY_MODES.ORDER);
    if (!PLAY_MODES[currentPlayMode]) {
        currentPlayMode = PLAY_MODES.ORDER;
    }
    const playedRandomUrls = new Set();
    let activeDownloadXhr = null;
    let isDownloadCancelled = false;
    // 存储等待探测元数据的音频元素队列
    const metadataQueue = [];
    let activeMetadataCount = 0;
    const MAX_METADATA_CONCURRENCY = 2;
    let isUserPlaying = false;
    let userPlayTimer = null;
    let isImagesManuallyCleared = false;
    let lastAListRawData = null;

    // 界面复用的矢量图标路径字典常量
    const SVG_PATHS = {
        RADAR: 'M12 15c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm0-8c2.76 0 5 2.24 5 5s-2.24 5-5 5-5-2.24-5-5 2.24-5 5-5zm0-4C6.48 3 2 7.48 2 13c0 3.7 2.01 6.92 4.99 8.65l1.35-2.32C6.16 18.02 5 15.65 5 13c0-3.87 3.13-7 7-7s7 3.13 7 7c0 2.65-1.16 5.02-3.34 6.33l1.35 2.32C20 19.92 22 16.7 22 13c0-5.52-4.48-10-10-10z',
        CHECK: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
        CLOSE: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
        SEARCH: 'M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z',
        MUSIC: 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z',
        VIDEO: 'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z',
        PREV: 'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z',
        NEXT: 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
        OPEN_IN_NEW: 'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z'
    };

    /* 停止当前正在播放的音频实例 */
    function stopCurrentAudio() {
        if (currentPlayingAudio) {
            currentPlayingAudio.pause();
            currentPlayingAudio = null;
            updateNowPlayingBar(null, null, null, false);
        }
    }

    /* 停止当前正在播放的视频实例 */
    function stopCurrentVideo() {
        if (currentPlayingVideo) {
            currentPlayingVideo.pause();
            currentPlayingVideo = null;
            updateNowPlayingBar(null, null, null, false);
        }
    }

    /* 停止所有正在播放的音视频实例 */
    function stopAllMediaPlayback() {
        stopCurrentAudio();
        stopCurrentVideo();
    }

    /* 调度后台低并发音频元数据探测队列 */
    function processMetadataQueue() {
        while (!isUserPlaying && activeMetadataCount < MAX_METADATA_CONCURRENCY && metadataQueue.length > 0) {
            const audioEl = metadataQueue.shift();
            if (!audioEl || !audioEl.isConnected || audioEl.preload === 'metadata' || audioEl.preload === 'auto' || (audioEl.duration && !isNaN(audioEl.duration))) {
                continue;
            }
            activeMetadataCount++;
            let isDone = false;
            let timer = null;
            const cleanup = () => {
                if (isDone) {
                    return;
                }
                isDone = true;
                clearTimeout(timer);
                audioEl.removeEventListener('loadedmetadata', cleanup);
                audioEl.removeEventListener('error', cleanup);
                activeMetadataCount--;
                processMetadataQueue();
            };
            timer = setTimeout(cleanup, 8000);
            audioEl.addEventListener('loadedmetadata', cleanup, { once: true });
            audioEl.addEventListener('error', cleanup, { once: true });
            audioEl.preload = 'metadata';
            try {
                audioEl.load();
            } catch { }
        }
    }

    /* 用户触发主动播放或交互时暂停后台队列让路 */
    function notifyUserPlayback() {
        isUserPlaying = true;
        clearTimeout(userPlayTimer);
        userPlayTimer = setTimeout(() => {
            isUserPlaying = false;
            processMetadataQueue();
        }, 4000);
    }

    // 识别音频文件常见后缀特征
    const AUDIO_EXT_REGEX = /\.(mp3|m4a|aac|flac|wav|ogg|opus)$/i;
    // 识别视频文件常见后缀特征
    const VIDEO_EXT_REGEX = /\.(mp4|m3u8|webm|flv|mov|m4v|mkv|mpd)(\?.*)?$/i;
    // 识别图片文件常见后缀特征
    const IMAGE_EXT_REGEX = /\.(jpe?g|png|webp|gif|svg|avif|bmp)$/i;
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
        // 修复路径中未转义的特殊字符导致签名参数被吞入哈希锚点
        if (url.includes('#') && (url.includes('?sign=') || /\.(mp3|m4a|wav|flac|aac|ogg|opus|mp4|webm|mkv|m3u8|jpe?g|png|webp|gif)/i.test(url))) {
            const queryIndex = url.indexOf('?');
            const hashIndex = url.indexOf('#');
            if (hashIndex !== -1 && (queryIndex === -1 || hashIndex < queryIndex)) {
                if (queryIndex !== -1) {
                    const pathPart = url.slice(0, queryIndex).replace(/#/g, '%23');
                    url = `${pathPart}${url.slice(queryIndex)}`;
                } else {
                    url = url.replace(/#/g, '%23');
                }
            }
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
            .replace(/\.(jpe?g|png|webp|gif|avif|bmp|tiff)@.*/i, '.$1')
            .replace(/\.(jpe?g|png|webp|gif|avif|bmp|tiff)!(?!$).*/i, '.$1')
            .replace(/[?&](?:x-oss-process|image\x6d\x6f\x67\x722|imageView2)(?:[=/][^&]*)?/gi, '')
            .replace(/_(?:thumb|small|preview|middle|large)\.(jpe?g|png|webp|gif)/i, '.$1')
            .replace(/\/thumb\/\d+\//i, '/original/')
            .replace(/[_-]\d+x\d+\.(jpe?g|png|webp|gif)$/i, '.$1')
            .replace(/\.(jpe?g|png)\.(?:webp|avif)$/i, '.$1')
            .replace(/\?&/, '?')
            .replace(/[?&]$/, '');
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
        let ext = (item?.format || defaultExt).toLowerCase();
        if (ext === 'm3u8') {
            ext = 'ts';
        }
        let name = item?.name || defaultName;
        if (name.toLowerCase().endsWith('.m3u8')) {
            name = name.substring(0, name.length - 5);
        }
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
        let cleanUrl = url.split('?')[0];
        try {
            cleanUrl = decodeURIComponent(cleanUrl);
        } catch { }
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
        if (name && !name.startsWith('audio_') && !source.startsWith('ALIST')) {
            for (const exist of audioStore.values()) {
                if (exist.name === name && exist.author === author) {
                    return;
                }
            }
        }
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
        if (isModalOpen && !isDeepCrawling) {
            updateModalHeaderCounters();
            if (currentTab === 'AUDIO') {
                renderGallery();
            }
        }
    }

    /**
     * 跨域网络请求加载器以代理流媒体切片
     */
    class GMHlsLoader {
        /**
         * 初始化加载器配置对象
         * 
         * @param {Object} config 配置参数对象
         */
        constructor(config) {
            this.config = config;
            this.stats = {
                trequest: 0,
                tfirst: 0,
                tload: 0,
                loaded: 0,
                total: 0,
                retry: 0,
                chunkCount: 0,
                bwEstimate: 0,
                loading: { start: 0, first: 0, end: 0 },
                parsing: { start: 0, end: 0 },
                buffering: { start: 0, first: 0, end: 0 }
            };
            this.req = null;
        }

        /* 销毁当前请求实例 */
        destroy() {
            this.abort();
        }

        /* 中断当前进行中的网络请求 */
        abort() {
            if (this.req) {
                try {
                    this.req.abort();
                } catch { }
                this.req = null;
            }
        }

        /**
         * 加载流媒体切片数据
         * 
         * @param {Object} context 请求上下文对象
         * @param {Object} config 额外配置参数
         * @param {{onSuccess: Function, onError: Function}} callbacks 回调函数映射对象
         */
        load(context, config, callbacks) {
            const now = performance.now();
            this.stats.trequest = now;
            this.stats.loading.start = now;
            const responseType = context.responseType === 'arraybuffer' ? 'arraybuffer' : (context.responseType || 'text');
            let targetUrl = context.url;
            try {
                targetUrl = encodeURI(decodeURI(context.url));
            } catch {
                targetUrl = context.url;
            }

            if (typeof GM_xmlhttpRequest === 'function') {
                this.req = GM_xmlhttpRequest({
                    method: 'GET',
                    url: targetUrl,
                    responseType,
                    headers: {
                        'Referer': window.location.href
                    },
                    cookie: document.cookie,
                    onload: (res) => {
                        this.req = null;
                        const tEnd = performance.now();
                        this.stats.tfirst = Math.max(this.stats.trequest, tEnd - 30);
                        this.stats.tload = tEnd;
                        this.stats.loading.first = this.stats.tfirst;
                        this.stats.loading.end = tEnd;
                        const rawData = res.response;
                        const len = rawData?.byteLength || rawData?.length || 0;
                        this.stats.loaded = len;
                        this.stats.total = len;

                        if (res.status >= 200 && res.status < 300) {
                            callbacks.onSuccess({
                                url: res.finalUrl || targetUrl,
                                data: rawData
                            }, this.stats, context, res);
                        } else {
                            console.error('[MediaSniffer] GM_xmlhttpRequest failed with status:', res.status, targetUrl);
                            callbacks.onError({
                                code: res.status,
                                text: res.statusText
                            }, context, res);
                        }
                    },
                    onerror: (err) => {
                        this.req = null;
                        console.error('[MediaSniffer] GM_xmlhttpRequest network error:', err, targetUrl);
                        callbacks.onError(err, context, null);
                    }
                });
            } else {
                fetch(targetUrl)
                    .then(res => {
                        if (!res.ok) {
                            throw new Error(`HTTP ${res.status}`);
                        }
                        return responseType === 'arraybuffer' ? res.arrayBuffer() : res.text();
                    })
                    .then(data => {
                        const tEnd = performance.now();
                        this.stats.tfirst = Math.max(this.stats.trequest, tEnd - 30);
                        this.stats.tload = tEnd;
                        this.stats.loading.first = this.stats.tfirst;
                        this.stats.loading.end = tEnd;
                        const len = data?.byteLength || data?.length || 0;
                        this.stats.loaded = len;
                        this.stats.total = len;
                        callbacks.onSuccess({
                            url: targetUrl,
                            data
                        }, this.stats, context);
                    })
                    .catch(err => {
                        console.error('[MediaSniffer] Fetch error:', err, targetUrl);
                        callbacks.onError(err, context, null);
                    });
            }
        }
    }

    let hlsLoadingPromise = null;

    /**
     * 动态获取或加载 Hls 流媒体播放引擎类
     * 
     * @returns {Promise<*>} 返回可用的 Hls 构造函数或空
     */
    function getHlsClass() {
        const existingHls = (typeof window !== 'undefined' && typeof window['Hls'] === 'function')
            ? window['Hls']
            : (typeof globalThis !== 'undefined' && typeof globalThis['Hls'] === 'function' ? globalThis['Hls'] : null);
        if (existingHls) {
            return Promise.resolve(existingHls);
        }
        if (hlsLoadingPromise) {
            return hlsLoadingPromise;
        }
        hlsLoadingPromise = new Promise((resolve) => {
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js',
                    onload: (res) => {
                        try {
                            const fn = new Function(`${res.responseText}\nreturn (typeof window !== 'undefined' && window['Hls'] ? window['Hls'] : (typeof globalThis !== 'undefined' && globalThis['Hls'] ? globalThis['Hls'] : null));`);
                            const loadedHls = fn();
                            if (loadedHls) {
                                console.log('[MediaSniffer] Hls.js dynamically loaded and initialized');
                                resolve(loadedHls);
                                return;
                            }
                        } catch (e) {
                            console.warn('[MediaSniffer] Eval Hls failed:', e);
                        }
                        injectHlsScriptTag(resolve);
                    },
                    onerror: () => {
                        injectHlsScriptTag(resolve);
                    }
                });
            } else {
                injectHlsScriptTag(resolve);
            }
        });
        return hlsLoadingPromise;
    }

    /**
     * 注入脚本标签作为后备加载方案
     * 
     * @param {Function} resolve 期约兑现回调函数
     */
    function injectHlsScriptTag(resolve) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
        script.onload = () => {
            const h = (typeof window !== 'undefined' && typeof window['Hls'] === 'function')
                ? window['Hls']
                : (typeof globalThis !== 'undefined' && typeof globalThis['Hls'] === 'function' ? globalThis['Hls'] : null);
            console.log('[MediaSniffer] Hls.js loaded via script tag');
            resolve(h);
        };
        script.onerror = () => {
            console.error('[MediaSniffer] Failed to load Hls.js via script tag');
            resolve(null);
        };
        (document.head || document.documentElement).appendChild(script);
    }

    /**
     * 从网络链接中检测视频格式
     * 
     * @param {string} url 目标网络链接
     * @returns {string} 识别出的视频格式大写字符串
     */
    function detectVideoFormatFromUrl(url) {
        const m = url.match(/(?:\.|\b(?:format|ext)=)(mp4|m3u8|webm|flv|mov|m4v|mkv|mpd)(?=[?#&]|$)/i);
        return m ? m[1].toUpperCase() : '';
    }

    /**
     * 注册视频
     * 
     * @param {string} rawUrl 视频地址
     * @param {string} source 触发捕获的来源标识
     * @param {Object} meta 携带的附加元数据对象
     */
    function registerVideo(rawUrl, source = 'NETWORK', meta = {}) {
        const url = normalizeUrl(rawUrl);
        if (!url || url.length < 5) {
            return;
        }
        let cleanUrl = url.split('?')[0];
        try {
            cleanUrl = decodeURIComponent(cleanUrl);
        } catch { }
        if (cleanVideoUrls.has(cleanUrl)) {
            const exist = videoStore.get(url);
            if (exist && meta.name && (!exist.hasCustomName || !exist.name)) {
                exist.name = meta.name;
                exist.hasCustomName = true;
            }
            return;
        }
        cleanVideoUrls.add(cleanUrl);
        const format = meta.format || detectVideoFormatFromUrl(url) || 'VIDEO';
        const fmtKey = format || 'VIDEO';
        if (!knownVideoFormats.has(fmtKey)) {
            knownVideoFormats.add(fmtKey);
            checkedVideoFormats.add(fmtKey);
        }
        let hasCustomName = Boolean(meta.name);
        let defaultName = meta.name;
        if (!defaultName) {
            const pageTitle = sanitizeFileName(document.querySelector('h1, .entry-title, .post-title')?.innerText || document.title.replace(/-[^-]+$/, ''));
            if (pageTitle && pageTitle.length >= 2) {
                defaultName = `${pageTitle}${format ? `.${format.toLowerCase()}` : ''}`;
                hasCustomName = true;
            }
        }
        const name = defaultName || `video_${videoStore.size + 1}${format ? `.${format.toLowerCase()}` : ''}`;
        const author = meta.author || '';
        if (name && !name.startsWith('video_') && !source.startsWith('ALIST')) {
            for (const exist of videoStore.values()) {
                if (exist.name === name && exist.author === author) {
                    return;
                }
            }
        }
        const videoObj = {
            url,
            name,
            hasCustomName,
            author,
            format,
            source,
            size: meta.size || 0,
            duration: meta.duration || 0,
            addedAt: Date.now()
        };
        videoStore.set(url, videoObj);
        updateFloatingBadge();
        if (isModalOpen && !isDeepCrawling) {
            updateModalHeaderCounters();
            if (currentTab === 'VIDEO') {
                renderGallery();
            }
        }
    }

    /**
     * 构建网盘资源的完整网络链接
     * 
     * @param {Object} item 网盘资源条目对象
     * @param {Object} json 接口原始响应对象
     * @param {boolean} isGet 是否为单文件详情接口
     * @returns {string} 构造的规范化网络直链
     */
    function buildAListDirectUrl(item, json, isGet) {
        if (isGet && item['raw_url']) {
            return item['raw_url'];
        }
        const rawParent = item.parent || json.data?.path || window.location.pathname || '';
        let decodedParent;
        try {
            decodedParent = decodeURIComponent(rawParent);
        } catch {
            decodedParent = rawParent;
        }
        const normalizedParent = decodedParent === '/' ? '' : decodedParent;
        let fullPath = `${normalizedParent}/${item.name}`;
        if (item.path) {
            try {
                fullPath = decodeURIComponent(item.path);
            } catch {
                fullPath = item.path;
            }
        }
        const encodedPath = fullPath.split('/').map(seg => encodeURIComponent(seg)).join('/');
        const directUrl = `${window.location.origin}/d${encodedPath.startsWith('/') ? '' : '/'}${encodedPath}`;
        return item.sign ? `${directUrl}?sign=${item.sign}` : directUrl;
    }

    /**
     * 从网盘目录路径中提取作者根路径
     * 
     * @param {string} pathStr 网盘目录路径字符串
     * @returns {string} 提取到的作者根目录路径
     */
    function getAListAuthorBasePath(pathStr) {
        if (!pathStr || pathStr === '/') {
            return '';
        }
        const segments = pathStr.split('/').filter(Boolean);
        if (segments.length === 0) {
            return '';
        }
        if (segments.length === 1) {
            return `/${segments[0]}`;
        }
        return `/${segments[0]}/${segments[1]}`;
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
        lastAListRawData = { json, reqUrl };
        const isList = reqUrl.includes('/api/fs/list');
        const isSearch = reqUrl.includes('/api/fs/search');
        const isGet = reqUrl.includes('/api/fs/get');
        // 目录列表切换时智能判断是否属于同一个作者
        if (isList) {
            const currentPath = json.data.path
                ? decodeURIComponent(json.data.path)
                : decodeURIComponent(window.location.pathname);
            const currentAuthorBase = getAListAuthorBasePath(currentPath);
            const prevAuthorBase = getAListAuthorBasePath(lastAListPath);
            // 当切换到不同作者或离开作者目录回到分类根目录时才清空历史数据
            if (lastAListPath !== '' && currentAuthorBase !== prevAuthorBase) {
                isImagesManuallyCleared = false;
                clearImageState();
                clearAudioState();
                clearVideoState();
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
        const source = isSearch ? 'ALIST_SEARCH' : (isGet ? 'ALIST_GET' : 'ALIST_LIST');
        // 提取网盘中的图片资源
        const imageItems = list.filter(item => !item['is_dir'] && (isGet ? item['raw_url'] : item.sign) && IMAGE_EXT_REGEX.test(item.name));
        imageItems.forEach(item => {
            const finalUrl = buildAListDirectUrl(item, json, isGet);
            const cleanName = sanitizeFileName(item.name.replace(/\.[^.]+$/, ''));
            registerImage(finalUrl, source, { name: cleanName });
        });
        // 提取网盘中的音视频资源
        const mediaItems = list.filter(item => !item['is_dir'] && (isGet ? item['raw_url'] : item.sign) && (AUDIO_EXT_REGEX.test(item.name) || VIDEO_EXT_REGEX.test(item.name) || item.type === 2));
        mediaItems.forEach(item => {
            const finalUrl = buildAListDirectUrl(item, json, isGet);
            const format = item.name.split('.').pop().toUpperCase();
            const rawParent = item.parent || json.data?.path || window.location.pathname || '';
            let decodedParent;
            try {
                decodedParent = decodeURIComponent(rawParent);
            } catch {
                decodedParent = rawParent;
            }
            const pathSegments = (typeof decodedParent === 'string' ? decodedParent : '').split('/').filter(Boolean);
            const authorName = pathSegments.length >= 2 ? pathSegments[1] : '';
            const isVideo = VIDEO_EXT_REGEX.test(item.name) || item.type === 2;
            const registerFn = isVideo ? registerVideo : registerAudio;
            registerFn(finalUrl, source, {
                name: item.name,
                author: authorName,
                size: item.size || 0,
                format
            });
        });
        setTimeout(() => {
            scanPageImages();
            scanPageVideos();
        }, 300);
        setTimeout(() => {
            scanPageImages();
            scanPageVideos();
        }, 800);
    }

    // 拦截fetch请求以捕获网盘数据接口与音频及视频流
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const reqUrl = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
        if (typeof reqUrl === 'string') {
            if (VIDEO_EXT_REGEX.test(reqUrl)) {
                registerVideo(reqUrl, 'FETCH');
            }
            if (AUDIO_EXT_REGEX.test(reqUrl)) {
                registerAudio(reqUrl, 'FETCH');
            }
        }
        const response = await originalFetch.apply(this, args);
        if (/\/api\/fs\/(list|search|get)/.test(reqUrl)) {
            response.clone().json().then(data => {
                handleAListResponse(data, reqUrl);
            }).catch(() => { });
        }
        return response;
    };

    // 拦截xhr请求以捕获网盘数据接口与音频及视频流
    const originalXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        if (typeof url === 'string') {
            if (VIDEO_EXT_REGEX.test(url)) {
                registerVideo(url, 'XHR');
            }
            if (AUDIO_EXT_REGEX.test(url)) {
                registerAudio(url, 'XHR');
            }
            if (/\/api\/fs\/(list|search|get)/.test(url)) {
                this.addEventListener('load', () => {
                    try {
                        handleAListResponse(JSON.parse(this.responseText), url);
                    } catch { }
                });
            }
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
     * 计算适用于跨域资源拉取的通用防盗链请求来源
     * 
     * @param {string} targetUrl 目标资源网络链接
     * @returns {string} 安全请求来源地址
     */
    function getRefererForUrl(targetUrl) {
        try {
            const targetParsed = new URL(targetUrl, window.location.href);
            const currentHost = window.location.hostname.toLowerCase();
            const targetHost = targetParsed.hostname.toLowerCase();
            if (targetHost === currentHost || targetHost.endsWith(`.${currentHost}`) || currentHost.endsWith(`.${targetHost}`)) {
                return window.location.href;
            }
            return `${targetParsed.origin}/`;
        } catch { }
        return '';
    }

    /**
     * 底层跨域网络请求并支持进度反馈与中断控制
     * 
     * @param {string} url 目标资源网络链接
     * @param {Object} [options={}] 请求配置选项对象
     * @param {string} [options.referer] 自定义防盗链引用来源
     * @param {Object} [options.headers] 自定义请求头对象
     * @param {string} [options.responseType] 响应数据类型
     * @param {string} [options.prefix] 任务日志前缀
     * @param {boolean} [options.trackProgress] 是否追踪传输进度
     * @returns {Promise<any>} 响应二进制数据
     */
    function gmRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            const responseType = options.responseType || 'arraybuffer';
            const prefix = options.prefix || '';
            const trackProgress = !!options.trackProgress;
            const tag = prefix ? `${prefix} ` : '';
            const reqReferer = options['referer'] || getRefererForUrl(url);
            const reqHeaders = Object.assign({ Referer: reqReferer }, options['headers'] || {});
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
                    headers: reqHeaders,
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
                        if (responseType === 'blob') {
                            return res.blob();
                        }
                        if (responseType === 'text') {
                            return res.text();
                        }
                        return res.arrayBuffer();
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
        if (isImagesManuallyCleared) {
            return;
        }
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
            if (meta.name && (!exist.hasCustomName || !exist.name)) {
                exist.name = meta.name;
                exist.hasCustomName = true;
            }
            return;
        }
        // 检测图片格式并记录至格式集合
        const hdUrl = upgradeToHdUrl(url);
        const format = detectImageFormatFromUrl(hdUrl) || detectImageFormatFromUrl(url);
        const fmtKey = format || 'OTHER';
        if (!knownImageFormats.has(fmtKey)) {
            knownImageFormats.add(fmtKey);
            checkedImageFormats.add(fmtKey);
        }
        const hasCustomName = Boolean(meta.name);
        let autoName = meta.name || '';
        if (!autoName && !url.startsWith('data:') && !url.startsWith('blob:')) {
            try {
                const pathname = new URL(hdUrl, window.location.href).pathname;
                const lastPart = pathname.split('/').filter(Boolean).pop() || '';
                if (lastPart) {
                    autoName = decodeURIComponent(lastPart.replace(/\.[^.]+$/, ''));
                }
            } catch { }
        }
        const imgObj = {
            url,
            hdUrl,
            name: autoName,
            hasCustomName,
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
            if (tempImg.src !== url) {
                tempImg.src = url;
                return;
            }
            imageStore.delete(url);
            selectedImages.delete(url);
            updateFloatingBadge();
            if (isModalOpen && currentTab === 'IMAGE') {
                renderGallery();
            }
        };
        tempImg.src = hdUrl || url;
        // 异步计算二进制指纹以实现去重与格式补充
        fetchBinaryFingerprint(hdUrl || url).then(info => {
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
        'data-original', 'data-src', 'data-srcset', 'data-actualsrc', 'data-url', 'zoomfile',
        'file', 'original', 'srcset', 'src', 'data-lazy-src', 'xlink:href', 'href'
    ];

    /**
     * 提取媒体元素的上下文标题
     * 
     * @param {HTMLElement} el 媒体元素
     * @returns {string} 标题文本
     */
    function extractElementTitle(el) {
        if (!el) {
            return '';
        }
        let rawTitle = el.getAttribute('title') || el.getAttribute('alt') || el.getAttribute('aria-label') || '';
        if (!rawTitle && el.tagName.toLowerCase() === 'source' && el.parentElement) {
            const siblingMedia = el.parentElement.querySelector('img, video, audio');
            if (siblingMedia) {
                rawTitle = siblingMedia.getAttribute('title') || siblingMedia.getAttribute('alt') || siblingMedia.getAttribute('aria-label') || '';
            }
        }
        if (!rawTitle) {
            const parentA = el.closest('a');
            if (parentA) {
                rawTitle = parentA.getAttribute('title') || parentA.getAttribute('aria-label') || '';
            }
        }
        if (!rawTitle) {
            const figure = el.closest('figure');
            if (figure) {
                rawTitle = (figure.querySelector('figcaption')?.textContent || '').trim();
            }
        }
        // 排除广告与横幅容器
        const isAdElement = Boolean(el.closest('.ad-slot, [class*="ad-slot"], [class*="ad_slot"], [class*="ad-banner"], [class*="advertisement"], [id*="google_ads"]'));
        if (!rawTitle && !isAdElement) {
            const card = el.closest('article, .card, [class~="card"], [class~="post"], .post-list-item, .post-item, .video-card, .recommended-card, .item-in, .grid-item, .media-item, [class*="post-list"], [class*="video-item"]');
            if (card) {
                const heading = card.querySelector('h1, h2, h3, h4, [role="heading"], .card-title, .post-title, .entry-title, .video-title, .title, a[title]');
                if (heading && !heading.contains(el)) {
                    rawTitle = heading.getAttribute('title') || heading.closest('a')?.getAttribute('title') || heading.getAttribute('aria-label') || (heading.textContent || '').trim();
                }
            } else {
                let current = el.parentElement;
                let depth = 0;
                const rootTags = new Set(['MAIN', 'BODY', 'HTML', 'HEADER', 'FOOTER', 'NAV', 'ASIDE']);
                while (current && !rootTags.has(current.tagName) && depth < 4) {
                    const heading = current.querySelector('h1, h2, h3, h4, [role="heading"], .card-title, .post-title, .entry-title, .video-title, .title, a[title]');
                    if (heading && !heading.contains(el)) {
                        const text = heading.getAttribute('title') || heading.closest('a')?.getAttribute('title') || heading.getAttribute('aria-label') || (heading.textContent || '').trim();
                        if (text && text.length >= 2 && text.length <= 160) {
                            rawTitle = text;
                            break;
                        }
                    }
                    current = current.parentElement;
                    depth++;
                }
            }
        }
        if (!rawTitle) {
            const pageHeading = document.querySelector('h1, .entry-title, .post-title, .video-title');
            if (pageHeading) {
                rawTitle = pageHeading.getAttribute('title') || (pageHeading.textContent || '').trim();
            }
        }
        return sanitizeFileName(rawTitle);
    }

    /**
     * 解析 srcset 并提取最高清图片链接
     * 
     * @param {string} srcsetValue srcset 属性值
     * @returns {string} 最高清图片链接
     */
    function getBestUrlFromSrcset(srcsetValue) {
        if (!srcsetValue || typeof srcsetValue !== 'string') {
            return '';
        }
        const candidates = srcsetValue.split(',').map(item => {
            const parts = item.trim().split(/\s+/);
            const url = parts[0] || '';
            const descriptor = parts[1] || '';
            let weight = 0;
            if (descriptor.endsWith('w')) {
                weight = parseInt(descriptor.slice(0, -1), 10) || 0;
            } else if (descriptor.endsWith('x')) {
                weight = Math.round(parseFloat(descriptor.slice(0, -1)) * 1000) || 0;
            }
            return { url, weight };
        }).filter(item => {
            return Boolean(item.url);
        });
        if (candidates.length === 0) {
            return '';
        }
        candidates.sort((a, b) => {
            return b.weight - a.weight;
        });
        return candidates[0].url;
    }

    /* 深度扫描当前文档中的所有图片元素 */
    function scanPageImages() {
        if (isImagesManuallyCleared) {
            return;
        }
        const imgElements = document.querySelectorAll('img, picture source, image');
        imgElements.forEach(el => {
            if (el.tagName.toLowerCase() === 'img' && el.closest('picture')?.querySelector('source[srcset], source[src]')) {
                return;
            }
            const cleanName = extractElementTitle(el);
            let targetUrl = '';
            const srcsetValue = el.getAttribute('srcset') || el.getAttribute('data-srcset');
            if (srcsetValue) {
                targetUrl = getBestUrlFromSrcset(srcsetValue);
            }
            if (!targetUrl) {
                for (const attr of POSSIBLE_IMG_ATTRS) {
                    if (attr === 'srcset' || attr === 'data-srcset') {
                        continue;
                    }
                    const val = el.getAttribute(attr);
                    if (val) {
                        targetUrl = val;
                        break;
                    }
                }
            }
            if (targetUrl) {
                registerImage(targetUrl, 'IMG', { name: cleanName });
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
                registerImage(m[1].trim(), 'CSS-BG', { name: cleanName });
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

    /* 深度扫描当前文档中的所有音频元素 */
    function scanPageAudios() {
        const audioElements = document.querySelectorAll('audio, audio source');
        audioElements.forEach(el => {
            let cleanName = extractElementTitle(el);
            if (!cleanName) {
                const pageTitle = (document.querySelector('h1, .entry-title, .post-title')?.textContent || '').trim();
                cleanName = sanitizeFileName(pageTitle);
            }
            const src = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-url');
            if (src && AUDIO_EXT_REGEX.test(src)) {
                registerAudio(src, 'AUDIO-TAG', { name: cleanName });
            }
        });
        updateFloatingBadge();
    }

    /* 深度扫描当前文档中的所有视频元素 */
    function scanPageVideos() {
        const videoElements = document.querySelectorAll('video, video source');
        videoElements.forEach(el => {
            let cleanName = extractElementTitle(el);
            if (!cleanName) {
                const pageTitle = (document.querySelector('h1, .entry-title, .post-title')?.textContent || '').trim();
                cleanName = sanitizeFileName(pageTitle);
            }
            const src = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-url');
            if (src && VIDEO_EXT_REGEX.test(src)) {
                registerVideo(src, 'VIDEO-TAG', { name: cleanName });
            }
        });
        updateFloatingBadge();
    }

    /* 扫描页面全部媒体元素 */
    function scanAllPageMedia() {
        scanPageImages();
        scanPageAudios();
        scanPageVideos();
    }

    /* 挂载动态观察器实时捕获异步渲染的新媒体元素 */
    function setupDynamicObserver() {
        let timer = null;
        const observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(scanAllPageMedia, 400);
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
            timer = setTimeout(scanAllPageMedia, 500);
        }, { passive: true });
    }

    /* 监听单页应用路由变更以自动重置清空状态并扫描新页面 */
    function setupUrlChangeListener() {
        let lastUrl = window.location.href;
        const onUrlChange = () => {
            if (window.location.href !== lastUrl) {
                lastUrl = window.location.href;
                isImagesManuallyCleared = false;
                scanAllPageMedia();
                if (isModalOpen) {
                    renderGallery();
                } else {
                    updateFloatingBadge();
                }
                setTimeout(scanAllPageMedia, 400);
                setTimeout(scanAllPageMedia, 1000);
            }
        };
        const rawPushState = history.pushState;
        if (typeof rawPushState === 'function') {
            history.pushState = function (...args) {
                rawPushState.apply(this, args);
                setTimeout(onUrlChange, 100);
            };
        }
        const rawReplaceState = history.replaceState;
        if (typeof rawReplaceState === 'function') {
            history.replaceState = function (...args) {
                rawReplaceState.apply(this, args);
                setTimeout(onUrlChange, 100);
            };
        }
        window.addEventListener('popstate', () => {
            setTimeout(onUrlChange, 100);
        });
        window.addEventListener('hashchange', () => {
            setTimeout(onUrlChange, 100);
        });
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
            padding: 0 6px;
            height: 18px;
            min-width: 18px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 10px;
            border: 2px solid #fff;
            box-sizing: border-box;
            line-height: 1;
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
            min-height: 64px;
            height: auto;
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
        .btn-deep-crawl {
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color: #ffffff;
            border: 1px solid transparent;
            font-weight: 500;
            display: none;
            align-items: center;
            gap: 4px;
        }
        .btn-deep-crawl:hover {
            background: linear-gradient(135deg, #4f46e5, #7c3aed);
            color: #ffffff;
            box-shadow: 0 2px 8px rgba(99, 102, 241, 0.35);
        }
        .btn-deep-crawl.running {
            background: #e0e7ff;
            color: #4338ca;
            border-color: #c7d2fe;
            cursor: pointer;
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
        .filter-right-controls {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .sort-control-group {
            position: relative;
            display: inline-flex;
            align-items: stretch;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            background: #fff;
            height: 32px;
            box-sizing: border-box;
            transition: border-color 0.2s, box-shadow 0.2s;
        }
        .sort-control-group:hover,
        .sort-control-group.open {
            border-color: var(--primary);
            box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.12);
        }
        .sort-select-btn {
            border: none;
            background: transparent;
            padding: 0 12px;
            font-size: 13px;
            font-weight: 500;
            color: var(--text-main);
            outline: none;
            cursor: pointer;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            user-select: none;
            border-top-left-radius: 7px;
            border-bottom-left-radius: 7px;
            transition: background 0.15s, color 0.15s;
            white-space: nowrap;
            min-width: 52px;
        }
        .sort-select-btn:hover {
            background: #f8fafc;
            color: var(--primary);
        }
        .btn-sort-order {
            border: none;
            border-left: 1px solid #e2e8f0;
            background: #f8fafc;
            padding: 0 9px;
            color: var(--text-muted);
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: background 0.15s, color 0.15s;
            user-select: none;
            height: 100%;
            border-top-right-radius: 7px;
            border-bottom-right-radius: 7px;
        }
        .btn-sort-order:hover {
            background: #ede9fe;
            color: var(--primary);
        }
        .sort-dropdown-menu {
            position: absolute;
            top: calc(100% + 4px);
            left: 0;
            min-width: 100%;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
            z-index: 1000;
            overflow: hidden;
            padding: 4px;
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .sort-menu-item {
            padding: 6px 10px;
            font-size: 13px;
            color: var(--text-main);
            text-align: center;
            justify-content: center;
            display: flex;
            align-items: center;
            border-radius: 6px;
            cursor: pointer;
            user-select: none;
            transition: background 0.15s, color 0.15s;
            white-space: nowrap;
        }
        .sort-menu-item:hover {
            background: #f1f5f9;
            color: var(--primary);
        }
        .sort-menu-item.active {
            background: #ede9fe;
            color: var(--primary);
            font-weight: 600;
        }
        /* 底部正在播放极简定位条 */
        .now-playing-bar {
            position: absolute;
            bottom: 24px;
            left: 50%;
            transform: translate(calc(-50% + var(--ag-bar-tx, 0px)), var(--ag-bar-ty, 0px));
            background: rgba(15, 23, 42, 0.9);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 30px;
            padding: 7px 12px 7px 22px;
            display: flex;
            align-items: center;
            gap: 14px;
            box-shadow: 0 12px 32px rgba(0, 0, 0, 0.32), 0 0 0 1px rgba(255, 255, 255, 0.06);
            z-index: 100;
            max-width: calc(100% - 32px);
            width: max-content;
            cursor: grab;
            touch-action: none;
            user-select: none;
            will-change: transform;
        }
        .now-playing-bar.dragging {
            cursor: grabbing;
        }
        @keyframes agMarqueeScroll {
            0%, 15% {
                transform: translateX(0);
            }
            75%, 85% {
                transform: translateX(var(--marquee-distance, 0px));
            }
            100% {
                transform: translateX(0);
            }
        }
        .now-playing-title {
            color: #f1f5f9;
            font-size: 13px;
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            text-align: center;
            max-width: min(850px, calc(100vw - 460px));
            min-width: 0;
            flex: 1 1 auto;
            cursor: pointer;
            transition: color 0.15s;
            letter-spacing: 0.2px;
            position: relative;
        }
        .now-playing-title-inner {
            display: inline-block;
            white-space: nowrap;
            will-change: transform;
        }
        .now-playing-title.has-marquee {
            text-overflow: clip;
            text-align: left;
        }
        .now-playing-title.has-marquee .now-playing-title-inner {
            animation: agMarqueeScroll var(--marquee-duration, 8s) ease-in-out infinite;
        }
        .now-playing-title:hover {
            color: #a5b4fc;
        }
        .now-playing-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
        }
        .btn-now-playing {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.16);
            color: #ffffff;
            padding: 4px 13px;
            border-radius: 14px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            outline: none;
            user-select: none;
        }
        .btn-now-playing:hover {
            background: var(--primary);
            border-color: var(--primary);
            color: #ffffff;
        }
        #ag-btn-locate-playing {
            background: rgba(99, 102, 241, 0.25);
            border-color: rgba(129, 140, 248, 0.45);
            color: #e0e7ff;
        }
        #ag-btn-locate-playing:hover {
            background: var(--primary);
            border-color: var(--primary);
            color: #ffffff;
            box-shadow: 0 2px 8px rgba(79, 70, 229, 0.4);
        }
        .btn-now-playing-pause:hover {
            background: #ef4444;
            border-color: #ef4444;
        }
        .btn-now-playing-resume {
            background: rgba(16, 185, 129, 0.22);
            border-color: rgba(52, 211, 153, 0.4);
            color: #6ee7b7;
        }
        .btn-now-playing-resume:hover {
            background: #10b981;
            border-color: #10b981;
            color: #ffffff;
        }
        .btn-now-playing-close {
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.12);
            color: rgba(255, 255, 255, 0.6);
            font-size: 11px;
            cursor: pointer;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s;
            line-height: 1;
            outline: none;
            user-select: none;
            margin-left: 2px;
        }
        .btn-now-playing-close:hover {
            color: #ffffff;
            background: rgba(255, 255, 255, 0.22);
            border-color: rgba(255, 255, 255, 0.28);
        }
        .audio-card.is-playing,
        .video-card.is-playing {
            border-color: var(--primary);
            box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.35);
        }
        .audio-card.locate-pulse,
        .video-card.locate-pulse {
            animation: agCardPulse 1.2s ease-in-out;
        }
        /* 右下角双向平滑滚动导航胶囊 */
        .scroll-nav-capsule {
            position: absolute;
            bottom: 28px;
            right: 24px;
            background: rgba(15, 23, 42, 0.85);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 3px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
            z-index: 90;
            cursor: grab;
            touch-action: none;
            user-select: none;
            transition: opacity 0.2s, background 0.15s;
        }
        .scroll-nav-capsule.dragging {
            cursor: grabbing;
            user-select: none;
        }
        .btn-scroll-nav {
            background: transparent;
            border: none;
            color: rgba(255, 255, 255, 0.7);
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.15s;
            outline: none;
            user-select: none;
        }
        .btn-scroll-nav:hover {
            background: rgba(255, 255, 255, 0.18);
            color: #ffffff;
        }
        .btn-scroll-nav svg {
            width: 16px;
            height: 16px;
            fill: currentColor;
        }
        .scroll-nav-divider {
            width: 16px;
            height: 1px;
            background: rgba(255, 255, 255, 0.12);
            margin: 1px 0;
        }
        @keyframes agCardPulse {
            0%, 100% {
                box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.35);
            }
            50% {
                box-shadow: 0 0 0 6px rgba(79, 70, 229, 0.6);
            }
        }
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
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.4;
            word-break: break-all;
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
            width: 24px;
            height: 24px;
            border-radius: 6px;
            background: rgba(255, 255, 255, 0.92);
            border: 1px solid #cbd5e1;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 1px 4px rgba(0,0,0,0.12);
            z-index: 5;
            transition: transform 0.15s ease, background 0.15s ease;
        }
        .img-select-overlay:hover {
            transform: scale(1.12);
            background: #ffffff;
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
        .video-format-badge {
            background: #fef3c7;
            color: #d97706;
            border: 1px solid #fde68a;
            font-size: 10px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 6px;
            text-transform: uppercase;
        }
        .video-list {
            display: flex;
            flex-direction: column;
            gap: 14px;
            max-width: 1100px;
            margin: 0 auto;
        }
        .video-card {
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
        .video-card:hover {
            border-color: rgba(79, 70, 229, 0.4);
            box-shadow: 0 4px 12px rgba(0,0,0,0.06);
            transform: translateY(-1px);
        }
        .video-card.selected {
            border-color: var(--primary);
            background: #f8faff;
            box-shadow: 0 0 0 2px var(--primary);
        }
        .video-player-wrapper {
            width: 280px;
            max-height: 160px;
            border-radius: 8px;
            overflow: hidden;
            background: #000;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .video-player-wrapper video {
            width: 100%;
            max-height: 160px;
            outline: none;
        }
        .audio-author-name {
            color: #334155;
            font-weight: 500;
            font-size: 12px;
            max-width: 160px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            cursor: pointer;
            transition: color 0.15s ease;
        }
        .audio-author-name:hover {
            color: var(--primary);
            text-decoration: underline;
        }
        /* 卡片底部信息条 */
        .img-meta {
            padding: 8px 12px 10px;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            gap: 4px;
            background: #ffffff;
            border-top: 1px solid #f1f5f9;
        }
        .img-name {
            width: 100%;
            font-size: 13px;
            font-weight: 600;
            color: var(--text-main);
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
            word-break: break-all;
            line-height: 1.4;
            cursor: pointer;
            text-align: center;
            transition: color 0.15s ease;
        }
        .img-name:hover {
            color: var(--primary);
            text-decoration: underline;
        }
        .img-dim-row {
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
        }
        .img-dim {
            color: var(--text-muted);
            font-family: monospace;
        }
        /* 进度提示浮层 */
        .toast-notify {
            position: fixed;
            top: 90px;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(15, 23, 42, 0.92);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            color: #fff;
            padding: 8px 18px;
            border-radius: 20px;
            border: 1px solid rgba(255, 255, 255, 0.15);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            z-index: 2147483648;
            display: none;
            align-items: center;
            gap: 12px;
            font-size: 13px;
            font-weight: 500;
        }
        .toast-notify.active { display: flex; animation: toastIn 0.25s ease; }
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
        @keyframes toastIn { from { opacity: 0; transform: translate(-50%, calc(-50% - 10px)); } to { opacity: 1; transform: translate(-50%, -50%); } }
        /* 全屏高清图片灯箱 */
        .lightbox-overlay {
            position: fixed;
            inset: 0;
            background: rgba(3, 7, 18, 0.95);
            backdrop-filter: blur(16px);
            z-index: 2147483647;
            display: none;
            flex-direction: column;
            opacity: 0;
            transition: opacity 0.2s ease;
            user-select: none;
            overflow: hidden;
        }
        .lightbox-overlay.active {
            display: flex;
            opacity: 1;
        }
        .lightbox-content {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: grab;
            z-index: 10;
        }
        .lightbox-content.grabbing {
            cursor: grabbing;
        }
        .lightbox-img {
            width: 100vw;
            height: 100vh;
            max-width: 100vw;
            max-height: 100vh;
            object-fit: contain;
            transition: transform 0.05s ease-out;
            transform-origin: center center;
            border-radius: 0;
            box-shadow: none;
        }
        .lightbox-nav-btn {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            width: 52px;
            height: 52px;
            border-radius: 50%;
            background: rgba(15, 23, 42, 0.5);
            backdrop-filter: blur(8px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: #fff;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 20;
            transition: all 0.2s;
        }
        .lightbox-nav-btn:hover {
            background: var(--primary);
            border-color: var(--primary);
            transform: translateY(-50%) scale(1.1);
        }
        .lightbox-nav-btn svg {
            width: 28px;
            height: 28px;
            fill: currentColor;
        }
        .lightbox-prev { left: 24px; }
        .lightbox-next { right: 24px; }

        /* 移动端与窄屏自适应响应式规则 */
        @media (max-width: 768px) {
            .modal-header {
                position: relative;
                min-height: 56px;
                height: auto;
                padding: 10px 12px;
                gap: 8px;
                flex-direction: column;
                align-items: stretch;
            }
            .header-left {
                width: 100%;
                padding-right: 36px;
                gap: 8px;
            }
            .header-title {
                font-size: 15px;
            }
            .header-title svg {
                width: 18px;
                height: 18px;
            }
            .tab-switcher {
                padding: 2px;
            }
            .tab-btn {
                padding: 4px 8px;
                font-size: 12px;
            }
            .header-selected-count,
            .header-dedup-stat {
                font-size: 11px;
            }
            .header-actions {
                width: 100%;
                display: flex;
                align-items: center;
                gap: 6px;
                flex-wrap: wrap;
            }
            .btn {
                padding: 5px 8px;
                font-size: 12px;
                border-radius: 6px;
            }
            .btn-close {
                position: absolute;
                top: 8px;
                right: 8px;
                padding: 6px;
                z-index: 10;
            }
            .filter-bar {
                padding: 8px 12px;
                gap: 8px;
                flex-direction: column;
                align-items: stretch;
            }
            .filter-group {
                gap: 6px 12px;
                font-size: 12px;
            }
            .filter-format-container {
                gap: 6px 10px;
            }
            .filter-right-controls {
                width: 100%;
                justify-content: space-between;
                gap: 8px;
            }
            .search-wrap {
                flex: 1;
            }
            .search-input {
                width: 100%;
                font-size: 12px;
                padding: 5px 24px 5px 26px;
            }
            .sort-control-group {
                height: 28px;
            }
            .sort-select-btn {
                padding: 0 8px;
                font-size: 12px;
                min-width: 44px;
            }
            .modal-body {
                padding: 10px 8px calc(10px + env(safe-area-inset-bottom, 0px));
            }
            .gallery-grid {
                grid-template-columns: repeat(2, 1fr);
                gap: 8px;
            }
            .img-thumb-wrapper {
                height: 130px;
            }
            .img-meta {
                padding: 6px 8px 8px;
                gap: 2px;
            }
            .img-name {
                font-size: 12px;
            }
            .img-dim-row {
                font-size: 10px;
            }
            .audio-list,
            .video-list {
                gap: 8px;
            }
            .audio-card,
            .video-card {
                padding: 10px 12px;
                flex-direction: column;
                align-items: stretch;
                gap: 10px;
            }
            .audio-left {
                width: 100%;
                gap: 10px;
            }
            .audio-icon-box {
                width: 36px;
                height: 36px;
            }
            .audio-icon-box svg {
                width: 18px;
                height: 18px;
            }
            .audio-name {
                font-size: 13px;
            }
            .audio-right {
                width: 100%;
                justify-content: stretch;
            }
            .audio-player-wrapper {
                width: 100%;
            }
            .audio-player-wrapper audio {
                width: 100%;
                height: 32px;
            }
            .video-player-wrapper {
                width: 100%;
                max-height: 200px;
            }
            .now-playing-bar {
                bottom: calc(10px + env(safe-area-inset-bottom, 0px));
                left: 10px !important;
                right: 10px !important;
                transform: none !important;
                max-width: calc(100% - 20px) !important;
                width: auto !important;
                flex-direction: column !important;
                align-items: stretch !important;
                padding: 7px 10px 7px 12px;
                gap: 6px;
                border-radius: 16px;
                cursor: default;
            }
            .now-playing-title {
                font-size: 12.5px;
                font-weight: 600;
                color: #f8fafc;
                width: 100%;
                max-width: 100%;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                line-height: 1.35;
                text-align: center;
                position: relative;
            }
            .now-playing-title.has-marquee {
                text-overflow: clip;
                text-align: left;
            }
            .now-playing-actions {
                display: flex;
                align-items: center;
                justify-content: space-between;
                width: 100%;
                gap: 5px;
            }
            .btn-now-playing {
                flex: 1;
                padding: 4px 0;
                font-size: 11px;
                text-align: center;
                justify-content: center;
                white-space: nowrap;
                border-radius: 6px;
            }
            .btn-now-playing-close {
                flex: 0 0 24px;
                height: 24px;
                font-size: 12px;
            }
            .scroll-nav-capsule {
                bottom: calc(72px + env(safe-area-inset-bottom, 0px));
                right: 12px;
            }
            .fab-trigger {
                width: 48px;
                height: 48px;
                bottom: calc(18px + env(safe-area-inset-bottom, 0px));
                right: 16px;
            }
            .fab-icon {
                width: 22px;
                height: 22px;
            }
            .lightbox-nav-btn {
                width: 40px;
                height: 40px;
            }
            .lightbox-prev {
                left: 10px;
            }
            .lightbox-next {
                right: 10px;
            }
        }
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
                    <button class="tab-btn" id="ag-tab-video" data-tab="VIDEO">视频 (0)</button>
                </div>
                <span id="ag-selected-count" class="header-selected-count">(已选中 0 项)</span>
                <span id="ag-dedup-stat" class="header-dedup-stat"></span>
            </div>
            <div class="header-actions">
                <button class="btn btn-deep-crawl" id="ag-btn-deep-crawl">深度抓取</button>
                <button class="btn" id="ag-btn-refresh">重新扫描</button>
                <button class="btn" id="ag-btn-clear">清空</button>
                <button class="btn" id="ag-btn-toggle-select">全选</button>
                <button class="btn" id="ag-btn-copy-links">复制链接</button>
                <button class="btn" id="ag-btn-open-tabs">在新标签页打开</button>
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
                <label class="filter-item" id="ag-dedup-label-wrap"><input type="checkbox" id="ag-filter-dedup" class="filter-checkbox" checked> 智能去重</label>
            </div>
            <div class="filter-right-controls">
                <span class="search-wrap" id="ag-search-wrap" style="display:none">
                    <svg class="search-icon" viewBox="0 0 24 24"><path d="${SVG_PATHS.SEARCH}"/></svg>
                    <input type="text" id="ag-search-input" class="search-input" placeholder="搜索音频名称或作者">
                    <span class="search-clear" id="ag-search-clear"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:inherit"><path d="${SVG_PATHS.CLOSE}"/></svg></span>
                </span>
                <div class="sort-control-group" id="ag-sort-group">
                    <button type="button" class="sort-select-btn" id="ag-sort-trigger">默认</button>
                    <button type="button" class="btn-sort-order" id="ag-btn-sort-order"></button>
                    <div class="sort-dropdown-menu" id="ag-sort-menu" style="display:none">
                        <div class="sort-menu-item active" data-value="DEFAULT">默认</div>
                        <div class="sort-menu-item" data-value="NAME">名称</div>
                        <div class="sort-menu-item" data-value="SIZE">大小</div>
                        <div class="sort-menu-item" data-value="AUTHOR">作者</div>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-body">
            <div class="gallery-grid" id="ag-gallery-image"></div>
            <div class="audio-list" id="ag-gallery-audio" style="display:none"></div>
            <div class="video-list" id="ag-gallery-video" style="display:none"></div>
        </div>
        <div class="now-playing-bar" id="ag-now-playing-bar" style="display:none">
            <div class="now-playing-title" id="ag-now-playing-title" title="点击定位"><span class="now-playing-title-inner" id="ag-now-playing-title-inner"></span></div>
            <div class="now-playing-actions">
                <button type="button" class="btn-now-playing" id="ag-btn-prev-playing" title="播放上一个">上一个</button>
                <button type="button" class="btn-now-playing btn-now-playing-pause" id="ag-btn-pause-playing">暂停</button>
                <button type="button" class="btn-now-playing" id="ag-btn-next-playing" title="播放下一个">下一个</button>
                <button type="button" class="btn-now-playing" id="ag-btn-play-mode" title="切换播放模式">顺序</button>
                <button type="button" class="btn-now-playing" id="ag-btn-locate-playing">定位</button>
                <button type="button" class="btn-now-playing-close" id="ag-btn-close-playing" title="关闭">✕</button>
            </div>
        </div>
        <div class="scroll-nav-capsule" id="ag-scroll-capsule" style="display:none">
            <button type="button" class="btn-scroll-nav" id="ag-btn-scroll-top" title="回到顶部" style="display:none">
                <svg viewBox="0 0 24 24"><path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/></svg>
            </button>
            <div class="scroll-nav-divider" id="ag-scroll-nav-divider" style="display:none"></div>
            <button type="button" class="btn-scroll-nav" id="ag-btn-scroll-bottom" title="直达底部" style="display:none">
                <svg viewBox="0 0 24 24"><path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z"/></svg>
            </button>
        </div>
    `;
    shadow.appendChild(modal);

    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox-overlay';
    lightbox.id = 'ag-lightbox';
    lightbox.innerHTML = `
        <button class="lightbox-nav-btn lightbox-prev" id="ag-lightbox-prev">
            <svg viewBox="0 0 24 24"><path d="${SVG_PATHS.PREV}"/></svg>
        </button>
        <button class="lightbox-nav-btn lightbox-next" id="ag-lightbox-next">
            <svg viewBox="0 0 24 24"><path d="${SVG_PATHS.NEXT}"/></svg>
        </button>
        <div class="lightbox-content" id="ag-lightbox-content">
            <img class="lightbox-img" id="ag-lightbox-img" alt="preview" referrerpolicy="no-referrer">
        </div>
    `;
    shadow.appendChild(lightbox);

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

    const lightboxImg = shadow.getElementById('ag-lightbox-img');
    const lightboxContent = shadow.getElementById('ag-lightbox-content');
    const lightboxPrev = shadow.getElementById('ag-lightbox-prev');
    const lightboxNext = shadow.getElementById('ag-lightbox-next');

    let currentLightboxIndex = 0;
    let lightboxScale = 1;
    let lightboxTranslateX = 0;
    let lightboxTranslateY = 0;
    let isLightboxDragging = false;
    let lightboxStartX = 0;
    let lightboxStartY = 0;

    /* 更新大图缩放与平移变换样式 */
    function updateLightboxTransform() {
        if (lightboxImg) {
            lightboxImg.style.transform = `translate(${lightboxTranslateX}px, ${lightboxTranslateY}px) scale(${lightboxScale})`;
        }
    }

    /* 渲染当前灯箱大图及相关元数据 */
    function renderLightboxCurrent() {
        const list = getFilteredImages();
        if (!list || list.length === 0 || currentLightboxIndex < 0 || currentLightboxIndex >= list.length) {
            return;
        }
        const item = list[currentLightboxIndex];
        lightboxScale = 1;
        lightboxTranslateX = 0;
        lightboxTranslateY = 0;
        updateLightboxTransform();
        if (lightboxImg) {
            lightboxImg.src = item.hdUrl || item.url;
        }
    }

    /**
     * 打开全屏高清图片灯箱
     * 
     * @param {number} index 当前点击查看的图片索引
     */
    function openLightbox(index) {
        const list = getFilteredImages();
        if (!list || list.length === 0 || index < 0 || index >= list.length) {
            return;
        }
        currentLightboxIndex = index;
        lightbox.classList.add('active');
        renderLightboxCurrent();
        window.addEventListener('keydown', handleLightboxKeydown);
    }

    /* 关闭全屏高清图片灯箱 */
    function closeLightbox() {
        if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => { });
        }
        lightbox.classList.remove('active');
        if (lightboxImg) {
            lightboxImg.src = '';
        }
        window.removeEventListener('keydown', handleLightboxKeydown);
    }

    /* 显示上一张大图 */
    function showLightboxPrev() {
        const list = getFilteredImages();
        if (!list.length) {
            return;
        }
        currentLightboxIndex = (currentLightboxIndex - 1 + list.length) % list.length;
        renderLightboxCurrent();
    }

    /* 显示下一张大图 */
    function showLightboxNext() {
        const list = getFilteredImages();
        if (!list.length) {
            return;
        }
        currentLightboxIndex = (currentLightboxIndex + 1) % list.length;
        renderLightboxCurrent();
    }

    /**
     * 处理灯箱全局快捷键事件
     * 
     * @param {KeyboardEvent} e 键盘事件对象
     */
    function handleLightboxKeydown(e) {
        if (!lightbox.classList.contains('active')) {
            return;
        }
        if (e.key === 'Escape') {
            closeLightbox();
        } else if (e.key === 'ArrowLeft') {
            showLightboxPrev();
        } else if (e.key === 'ArrowRight') {
            showLightboxNext();
        }
    }

    let hasMovedSignificantly = false;
    let clickStartX = 0;
    let clickStartY = 0;

    lightboxPrev?.addEventListener('click', (e) => {
        e.stopPropagation();
        showLightboxPrev();
    });
    lightboxNext?.addEventListener('click', (e) => {
        e.stopPropagation();
        showLightboxNext();
    });
    lightboxContent?.addEventListener('click', () => {
        if (!hasMovedSignificantly) {
            closeLightbox();
        }
    });
    lightboxContent?.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        lightboxScale = Math.min(Math.max(0.5, lightboxScale + delta), 6);
        updateLightboxTransform();
    }, { passive: false });
    lightboxContent?.addEventListener('pointerdown', (e) => {
        isLightboxDragging = true;
        hasMovedSignificantly = false;
        clickStartX = e.clientX;
        clickStartY = e.clientY;
        lightboxStartX = e.clientX - lightboxTranslateX;
        lightboxStartY = e.clientY - lightboxTranslateY;
        lightboxContent.classList.add('grabbing');
    });
    window.addEventListener('pointermove', (e) => {
        if (!isLightboxDragging) {
            return;
        }
        const dx = e.clientX - clickStartX;
        const dy = e.clientY - clickStartY;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
            hasMovedSignificantly = true;
        }
        lightboxTranslateX = e.clientX - lightboxStartX;
        lightboxTranslateY = e.clientY - lightboxStartY;
        updateLightboxTransform();
    });
    window.addEventListener('pointerup', () => {
        if (isLightboxDragging) {
            isLightboxDragging = false;
            lightboxContent.classList.remove('grabbing');
        }
    });

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

    /* 统一刷新悬浮球角标数量统计 */
    function updateFloatingBadge() {
        const badge = shadow.getElementById('ag-badge');
        if (badge) {
            const imgCount = getFilteredImages().length;
            const audioCount = getFilteredAudios().length;
            const videoCount = getFilteredVideos().length;
            const total = imgCount + audioCount + videoCount;
            badge.textContent = String(total);
            badge.style.display = total > 0 ? 'inline-flex' : 'none';
        }
    }

    /* 刷新弹窗头部选项卡数量与选中计数 */
    function updateModalHeaderCounters() {
        const tabImg = shadow.getElementById('ag-tab-img');
        const tabAudio = shadow.getElementById('ag-tab-audio');
        const tabVideo = shadow.getElementById('ag-tab-video');
        const countSpan = shadow.getElementById('ag-selected-count');
        const toggleBtn = shadow.getElementById('ag-btn-toggle-select');
        const images = getFilteredImages();
        const audios = getFilteredAudios();
        const videos = getFilteredVideos();
        let selectedSet;
        let activeList;
        if (currentTab === 'IMAGE') {
            selectedSet = selectedImages;
            activeList = images;
        } else if (currentTab === 'AUDIO') {
            selectedSet = selectedAudios;
            activeList = audios;
        } else {
            selectedSet = selectedVideos;
            activeList = videos;
        }
        if (tabImg) {
            tabImg.textContent = `图片 (${images.length})`;
        }
        if (tabAudio) {
            tabAudio.textContent = `音频 (${audios.length})`;
        }
        if (tabVideo) {
            tabVideo.textContent = `视频 (${videos.length})`;
        }
        if (countSpan) {
            countSpan.textContent = `(已选中 ${selectedSet.size} 项)`;
        }
        if (toggleBtn) {
            const isAll = activeList.length > 0 && activeList.every(i => selectedSet.has(i.url));
            toggleBtn.textContent = isAll ? '取消全选' : '全选';
        }
        const deepCrawlBtn = shadow.getElementById('ag-btn-deep-crawl');
        if (deepCrawlBtn) {
            deepCrawlBtn.style.display = lastAListPath ? 'inline-flex' : 'none';
        }
    }

    /**
     * 渲染格式筛选复选框组并绑定联动事件
     * 
     * @param {HTMLElement} container 复选框容器元素
     * @param {Map<string, number>} formatCounts 格式数量统计映射
     * @param {Set<string>} checkedFormats 当前勾选的格式集合
     */
    function renderFormatCheckboxGroup(container, formatCounts, checkedFormats) {
        if (formatCounts.size === 0) {
            container.innerHTML = '';
            return;
        }
        let checkedCount = 0;
        formatCounts.forEach((_, fmt) => {
            if (checkedFormats.has(fmt)) {
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
        const searchInput = shadow.getElementById('ag-search-input');
        if (!container) {
            return;
        }
        const formatCounts = new Map();
        const isImg = currentTab === 'IMAGE';
        const isAudio = currentTab === 'AUDIO';
        if (dedupWrap) {
            dedupWrap.style.display = isImg ? 'inline-flex' : 'none';
        }
        if (searchWrap) {
            searchWrap.style.display = isImg ? 'none' : 'inline-flex';
            if (searchInput) {
                searchInput.placeholder = isAudio ? '搜索音频名称或作者' : '搜索视频名称或作者';
                searchInput.value = isAudio ? audioSearchKeyword : videoSearchKeyword;
                searchWrap.classList.toggle('has-value', searchInput.value.length > 0);
            }
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
            renderFormatCheckboxGroup(container, formatCounts, checkedImageFormats);
        } else if (isAudio) {
            const seenKeys = new Set();
            audioStore.forEach(item => {
                if (audioSearchKeyword && !`${item.name} ${item.author || ''} ${item.url}`.toLowerCase().includes(audioSearchKeyword)) {
                    return;
                }
                let decodedClean;
                try {
                    decodedClean = decodeURIComponent(item.url.split('?')[0]);
                } catch {
                    decodedClean = item.url.split('?')[0];
                }
                const signature = (item.name && !item.name.startsWith('audio_'))
                    ? `name_${item.name}__${item.author || ''}`.toLowerCase()
                    : `url_${decodedClean}`;
                if (seenKeys.has(signature) || seenKeys.has(decodedClean)) {
                    return;
                }
                seenKeys.add(signature);
                seenKeys.add(decodedClean);
                const fmt = item.format || 'AUDIO';
                formatCounts.set(fmt, (formatCounts.get(fmt) || 0) + 1);
            });
            renderFormatCheckboxGroup(container, formatCounts, checkedAudioFormats);
        } else {
            const seenKeys = new Set();
            videoStore.forEach(item => {
                if (videoSearchKeyword && !`${item.name} ${item.author || ''} ${item.url}`.toLowerCase().includes(videoSearchKeyword)) {
                    return;
                }
                let decodedClean;
                try {
                    decodedClean = decodeURIComponent(item.url.split('?')[0]);
                } catch {
                    decodedClean = item.url.split('?')[0];
                }
                const signature = (item.name && !item.name.startsWith('video_'))
                    ? `name_${item.name}__${item.author || ''}`.toLowerCase()
                    : `url_${decodedClean}`;
                if (seenKeys.has(signature) || seenKeys.has(decodedClean)) {
                    return;
                }
                seenKeys.add(signature);
                seenKeys.add(decodedClean);
                const fmt = item.format || 'VIDEO';
                formatCounts.set(fmt, (formatCounts.get(fmt) || 0) + 1);
            });
            renderFormatCheckboxGroup(container, formatCounts, checkedVideoFormats);
        }
    }

    const STORAGE_KEY_TAB_SORT_STATE = 'media_sniffer_tab_sort_state';

    // 存储图片音频视频各自独立的排序状态字典
    const tabSortState = {
        IMAGE: { field: 'DEFAULT', order: 'ASC' },
        AUDIO: { field: 'DEFAULT', order: 'ASC' },
        VIDEO: { field: 'DEFAULT', order: 'ASC' }
    };

    try {
        const savedSortStateStr = (typeof GM_getValue === 'function') ? GM_getValue(STORAGE_KEY_TAB_SORT_STATE, null) : null;
        if (savedSortStateStr) {
            const parsed = JSON.parse(savedSortStateStr);
            if (parsed && typeof parsed === 'object') {
                ['IMAGE', 'AUDIO', 'VIDEO'].forEach(tab => {
                    if (parsed[tab]) {
                        tabSortState[tab].field = parsed[tab].field || 'DEFAULT';
                        tabSortState[tab].order = parsed[tab].order || 'ASC';
                    }
                });
            }
        }
    } catch { }

    /**
     * 获取当前选项卡激活的排序字段
     * 
     * @returns {string} 排序字段标识
     */
    function getCurrentSortField() {
        return tabSortState[currentTab]?.field || 'DEFAULT';
    }

    /**
     * 获取当前选项卡激活的排序方向
     * 
     * @returns {string} 排序方向标识
     */
    function getCurrentSortOrder() {
        return tabSortState[currentTab]?.order || 'ASC';
    }

    /* 持久化保存所有选项卡各自独立的排序偏好 */
    function saveSortPreferences() {
        if (typeof GM_setValue === 'function') {
            GM_setValue(STORAGE_KEY_TAB_SORT_STATE, JSON.stringify(tabSortState));
        }
    }

    /* 刷新排序下拉菜单文案与升降序按钮图标 */
    function updateSortUI() {
        const orderBtn = shadow.getElementById('ag-btn-sort-order');
        const sortTrigger = shadow.getElementById('ag-sort-trigger');
        const sortMenu = shadow.getElementById('ag-sort-menu');
        const field = getCurrentSortField();
        const order = getCurrentSortOrder();
        if (sortTrigger) {
            const sortFieldLabels = { DEFAULT: '默认', NAME: '名称', SIZE: '大小', AUTHOR: '作者' };
            sortTrigger.textContent = sortFieldLabels[field] || '默认';
        }
        if (sortMenu) {
            sortMenu.querySelectorAll('.sort-menu-item').forEach(el => {
                el.classList.toggle('active', el.dataset.value === field);
                if (el.dataset.value === 'AUTHOR') {
                    el.style.display = currentTab === 'IMAGE' ? 'none' : 'block';
                }
            });
        }
        if (orderBtn) {
            orderBtn.style.display = 'inline-flex';
            if (order === 'ASC') {
                orderBtn.innerHTML = '<svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/></svg>';
            } else {
                orderBtn.innerHTML = '<svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z"/></svg>';
            }
        }
    }

    /**
     * 对当前选项卡过滤后的媒体列表执行独立的排序规则
     * 
     * @param {Array<Object>} list 待排序的媒体列表
     * @returns {Array<Object>} 排序完成后的媒体列表
     */
    function applyMediaSort(list) {
        if (!list || list.length <= 1) {
            return list;
        }
        const field = getCurrentSortField();
        const order = getCurrentSortOrder();
        if (field === 'DEFAULT') {
            return order === 'ASC' ? list : [...list].reverse();
        }
        const sorted = [...list];
        if (field === 'NAME') {
            if (order === 'ASC') {
                sorted.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
            } else {
                sorted.sort((a, b) => (b.name || '').localeCompare(a.name || '', undefined, { numeric: true, sensitivity: 'base' }));
            }
        } else if (field === 'SIZE') {
            if (order === 'DESC') {
                sorted.sort((a, b) => (b.size || (b.width ? b.width * b.height : 0) || 0) - (a.size || (a.width ? a.width * a.height : 0) || 0));
            } else {
                sorted.sort((a, b) => (a.size || (a.width ? a.width * a.height : 0) || 0) - (b.size || (b.width ? b.width * b.height : 0) || 0));
            }
        } else if (field === 'AUTHOR') {
            sorted.sort((a, b) => {
                const authorA = a.author || '';
                const authorB = b.author || '';
                if (!authorA && authorB) {
                    return 1;
                }
                if (authorA && !authorB) {
                    return -1;
                }
                const cmp = order === 'ASC'
                    ? authorA.localeCompare(authorB, undefined, { numeric: true, sensitivity: 'base' })
                    : authorB.localeCompare(authorA, undefined, { numeric: true, sensitivity: 'base' });
                if (cmp !== 0) {
                    return cmp;
                }
                return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
            });
        }
        return sorted;
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
        if (currentTab === 'IMAGE') {
            updateDeduplicationStat(dupCount);
        }
        return applyMediaSort(result);
    }

    /**
     * 获取经过筛选过滤后的音频列表
     * 
     * @returns {Array<Object>} 过滤后的音频数据对象数组
     */
    function getFilteredAudios() {
        const result = [];
        const seenKeys = new Set();
        let dupCount = 0;
        audioStore.forEach(item => {
            const fmt = item.format || 'AUDIO';
            if (knownAudioFormats.has(fmt) && !checkedAudioFormats.has(fmt)) {
                return;
            }
            if (audioSearchKeyword && !`${item.name} ${item.author || ''} ${item.url}`.toLowerCase().includes(audioSearchKeyword)) {
                return;
            }
            let decodedClean;
            try {
                decodedClean = decodeURIComponent(item.url.split('?')[0]);
            } catch {
                decodedClean = item.url.split('?')[0];
            }
            const signature = (item.name && !item.name.startsWith('audio_'))
                ? `name_${item.name}__${item.author || ''}`.toLowerCase()
                : `url_${decodedClean}`;
            if (seenKeys.has(signature) || seenKeys.has(decodedClean)) {
                dupCount++;
                return;
            }
            seenKeys.add(signature);
            seenKeys.add(decodedClean);
            result.push(item);
        });
        if (currentTab === 'AUDIO') {
            updateDeduplicationStat(dupCount);
        }
        return applyMediaSort(result);
    }

    /**
     * 获取经过筛选过滤后的视频列表
     * 
     * @returns {Array<Object>} 过滤后的视频数据对象数组
     */
    function getFilteredVideos() {
        const result = [];
        const seenKeys = new Set();
        let dupCount = 0;
        videoStore.forEach(item => {
            const fmt = item.format || 'VIDEO';
            if (knownVideoFormats.has(fmt) && !checkedVideoFormats.has(fmt)) {
                return;
            }
            if (videoSearchKeyword && !`${item.name} ${item.author || ''} ${item.url}`.toLowerCase().includes(videoSearchKeyword)) {
                return;
            }
            let decodedClean;
            try {
                decodedClean = decodeURIComponent(item.url.split('?')[0]);
            } catch {
                decodedClean = item.url.split('?')[0];
            }
            const signature = (item.name && !item.name.startsWith('video_'))
                ? `name_${item.name}__${item.author || ''}`.toLowerCase()
                : `url_${decodedClean}`;
            if (seenKeys.has(signature) || seenKeys.has(decodedClean)) {
                dupCount++;
                return;
            }
            seenKeys.add(signature);
            seenKeys.add(decodedClean);
            result.push(item);
        });
        if (currentTab === 'VIDEO') {
            updateDeduplicationStat(dupCount);
        }
        return applyMediaSort(result);
    }

    /**
     * 更新去重统计信息文字显示
     * 
     * @param {number} dupCount 当前识别出的重复项目总数
     */
    function updateDeduplicationStat(dupCount) {
        const el = shadow.getElementById('ag-dedup-stat');
        if (el) {
            if (dupCount > 0) {
                const unit = currentTab === 'IMAGE' ? '张' : '个';
                el.textContent = `(已智能去重 ${dupCount} ${unit})`;
            } else {
                el.textContent = '';
            }
        }
    }

    let videoObserver = null;

    /**
     * 初始化视口观察器实现可见视频卡片按需挂载与首帧加载
     * 
     * @param {HTMLElement} rootContainer 滚动视口容器
     */
    function initVideoObserver(rootContainer) {
        if (videoObserver) {
            videoObserver.disconnect();
        }
        videoObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const card = entry.target;
                const videoPlayer = card.querySelector('video');
                const url = card.dataset.url;
                const item = videoStore.get(url);
                if (entry.isIntersecting) {
                    if (item && videoPlayer && !card['_hls']) {
                        setupVideoPlayerSource(card, videoPlayer, item, true);
                    }
                } else {
                    if (card['_hls'] && videoPlayer && videoPlayer.paused && currentPlayingVideo !== videoPlayer) {
                        try {
                            card['_hls']['destroy']();
                        } catch { }
                        card['_hls'] = null;
                    }
                }
            });
        }, {
            root: rootContainer,
            rootMargin: '250px 0px 250px 0px'
        });
    }

    /**
     * 为视频元素配置播放源或挂载流媒体引擎
     * 
     * @param {HTMLElement} card 卡片容器元素
     * @param {HTMLVideoElement} videoEl 视频播放器元素
     * @param {Object} item 媒体数据对象
     * @param {boolean} autoStart 是否立即自动启动切片加载
     */
    function setupVideoPlayerSource(card, videoEl, item, autoStart = true) {
        const isM3U8 = (item.format === 'M3U8' || item.url.includes('.m3u8'));
        if (isM3U8) {
            getHlsClass().then((HlsClass) => {
                if (HlsClass && HlsClass.isSupported()) {
                    if (card['_hls']) {
                        try {
                            card['_hls']['destroy']();
                        } catch { }
                    }
                    const hlsInstance = new HlsClass({
                        loader: GMHlsLoader,
                        fLoader: GMHlsLoader,
                        pLoader: GMHlsLoader,
                        enableWorker: false,
                        autoStartLoad: autoStart
                    });
                    card['_hls'] = hlsInstance;
                    hlsInstance.loadSource(item.url);
                    hlsInstance.attachMedia(videoEl);
                    hlsInstance.on(HlsClass.Events.MANIFEST_PARSED, (evt, data) => {
                        console.log('[MediaSniffer] Manifest parsed successfully, levels:', data?.levels?.length);
                    });
                    hlsInstance.on(HlsClass.Events.ERROR, (evt, data) => {
                        if (data.fatal) {
                            console.error('[MediaSniffer] Fatal HLS error:', data.type, data.details, data);
                            if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR) {
                                console.log('[MediaSniffer] Recovering media error');
                                hlsInstance.recoverMediaError();
                            } else if (data.type === HlsClass.ErrorTypes.NETWORK_ERROR) {
                                console.log('[MediaSniffer] Recovering network error');
                                hlsInstance.startLoad();
                            } else {
                                showToast(`流媒体加载失败：${data.details}`);
                            }
                        }
                    });
                } else {
                    videoEl.src = item.url;
                }
            });
        } else {
            videoEl.src = item.url;
        }
    }

    /* 渲染当前选项卡下的媒体画廊或音频列表 */
    function renderGallery() {
        renderFormatFilters();
        updateSortUI();
        const imgGallery = shadow.getElementById('ag-gallery-image');
        const audioGallery = shadow.getElementById('ag-gallery-audio');
        const videoGallery = shadow.getElementById('ag-gallery-video');
        if (!imgGallery || !audioGallery || !videoGallery) {
            return;
        }
        if (currentTab === 'IMAGE') {
            imgGallery.style.display = 'grid';
            audioGallery.style.display = 'none';
            videoGallery.style.display = 'none';
            const filtered = getFilteredImages();
            imgGallery.innerHTML = '';
            filtered.forEach((item, index) => {
                const card = document.createElement('div');
                card.dataset.url = item.url;
                card.className = 'img-card' + (selectedImages.has(item.url) ? ' selected' : '');
                const displayName = item.name || `image_${index + 1}`;
                const dimText = (item.width && item.height) ? `${item.width} × ${item.height}` : '加载中';
                card.innerHTML = `
                    <div class="img-thumb-wrapper">
                        <img class="img-thumb" src="${item.hdUrl || item.url}" alt="thumb" referrerpolicy="no-referrer" loading="lazy">
                        <div class="img-select-overlay">
                            <svg class="img-select-check" viewBox="0 0 24 24"><path d="${SVG_PATHS.CHECK}"/></svg>
                        </div>
                        <span class="media-format-badge">${item.format}</span>
                    </div>
                    <div class="img-meta">
                        <div class="img-name">${displayName}</div>
                        <div class="img-dim-row">
                            <span class="img-dim">${dimText}</span>
                        </div>
                    </div>
                `;
                const imgEl = card.querySelector('.img-thumb');
                const dimSpan = card.querySelector('.img-dim');
                const selectOverlay = card.querySelector('.img-select-overlay');

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
                    if (imgEl && imgEl.src !== item.url) {
                        imgEl.src = item.url;
                        return;
                    }
                    selectedImages.delete(item.url);
                    imageStore.delete(item.url);
                    card.remove();
                    updateModalHeaderCounters();
                    updateFloatingBadge();
                }

                if (imgEl?.complete && imgEl?.naturalWidth) {
                    onThumbLoad();
                } else if (imgEl) {
                    imgEl.addEventListener('load', onThumbLoad);
                    imgEl.addEventListener('error', onThumbError);
                }
                selectOverlay?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isSelected = selectedImages.has(item.url);
                    selectedImages[isSelected ? 'delete' : 'add'](item.url);
                    card.classList.toggle('selected', !isSelected);
                    updateModalHeaderCounters();
                });
                const nameEl = card.querySelector('.img-name');
                if (nameEl) {
                    nameEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        copyToClipboard(displayName, '已复制图片名称到剪贴板');
                    });
                }
                card.addEventListener('click', () => {
                    const filteredList = getFilteredImages();
                    const idx = filteredList.findIndex(i => i.url === item.url);
                    if (idx !== -1) {
                        openLightbox(idx);
                    }
                });
                imgGallery.appendChild(card);
            });
        } else if (currentTab === 'AUDIO') {
            imgGallery.style.display = 'none';
            audioGallery.style.display = 'flex';
            videoGallery.style.display = 'none';
            const filtered = getFilteredAudios();
            const filteredUrlSet = new Set(filtered.map(item => item.url));
            const existingCards = new Map();
            audioGallery.querySelectorAll('.audio-card').forEach(card => {
                existingCards.set(card.dataset.url, card);
            });
            filtered.forEach(item => {
                let card = existingCards.get(item.url);
                if (card) {
                    card.style.display = '';
                    card.classList.toggle('selected', selectedAudios.has(item.url));
                    const audioPlayer = card.querySelector('audio');
                    if (audioPlayer && (!audioPlayer.duration || isNaN(audioPlayer.duration)) && audioPlayer.preload !== 'metadata' && audioPlayer.preload !== 'auto') {
                        if (!metadataQueue.includes(audioPlayer)) {
                            metadataQueue.push(audioPlayer);
                        }
                    }
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
                                <div class="audio-name">${item.name}</div>
                                <div class="audio-meta-row">
                                    <span class="audio-format-badge">${item.format}</span>
                                    ${item.author ? `<span class="audio-author-name">${item.author}</span>` : ''}
                                    ${sizeStr ? `<span>${sizeStr}</span>` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="audio-right">
                            <div class="audio-player-wrapper">
                                <audio controls preload="none" src="${item.url}"></audio>
                            </div>
                        </div>
                    `;
                    const audioNameEl = card.querySelector('.audio-name');
                    if (audioNameEl) {
                        audioNameEl.addEventListener('click', (e) => {
                            e.stopPropagation();
                            copyToClipboard(item.name, '已复制文件名');
                        });
                    }
                    const audioAuthorEl = card.querySelector('.audio-author-name');
                    if (audioAuthorEl) {
                        audioAuthorEl.addEventListener('click', (e) => {
                            e.stopPropagation();
                            copyToClipboard(item.author, '已复制作者名字');
                        });
                    }
                    const audioPlayer = card.querySelector('audio');
                    if (audioPlayer) {
                        audioPlayer.addEventListener('click', (e) => {
                            e.stopPropagation();
                        });
                        const handleActiveInteraction = () => {
                            notifyUserPlayback();
                            if (audioPlayer.preload !== 'auto') {
                                audioPlayer.preload = 'auto';
                            }
                        };
                        audioPlayer.addEventListener('pointerdown', handleActiveInteraction);
                        audioPlayer.addEventListener('play', () => {
                            handleActiveInteraction();
                            if (currentPlayingAudio && currentPlayingAudio !== audioPlayer) {
                                currentPlayingAudio.pause();
                            }
                            currentPlayingAudio = audioPlayer;
                            updateNowPlayingBar(item, card, 'AUDIO', true);
                        });
                        audioPlayer.addEventListener('pause', () => {
                            if (currentPlayingAudio === audioPlayer) {
                                updateNowPlayingBar(item, card, 'AUDIO', false);
                            }
                        });
                        audioPlayer.addEventListener('ended', () => {
                            if (currentPlayingAudio === audioPlayer) {
                                handleMediaEnded(card, 'AUDIO');
                            }
                        });
                        metadataQueue.push(audioPlayer);
                    }
                    card.addEventListener('click', () => {
                        const isSelected = selectedAudios.has(item.url);
                        selectedAudios[isSelected ? 'delete' : 'add'](item.url);
                        card.classList.toggle('selected', !isSelected);
                        updateModalHeaderCounters();
                    });
                }
                audioGallery.appendChild(card);
            });
            processMetadataQueue();
            existingCards.forEach((card, url) => {
                if (!filteredUrlSet.has(url)) {
                    card.style.display = 'none';
                }
            });
        } else {
            imgGallery.style.display = 'none';
            audioGallery.style.display = 'none';
            videoGallery.style.display = 'flex';
            const modalBody = shadow.querySelector('.modal-body');
            if (modalBody) {
                initVideoObserver(modalBody);
            }
            const filtered = getFilteredVideos();
            const filteredUrlSet = new Set(filtered.map(item => item.url));
            const existingCards = new Map();
            videoGallery.querySelectorAll('.video-card').forEach(card => {
                existingCards.set(card.dataset.url, card);
            });
            filtered.forEach(item => {
                let card = existingCards.get(item.url);
                if (card) {
                    card.style.display = '';
                    card.classList.toggle('selected', selectedVideos.has(item.url));
                    if (videoObserver) {
                        videoObserver.observe(card);
                    }
                } else {
                    card = document.createElement('div');
                    card.dataset.url = item.url;
                    card.className = 'video-card' + (selectedVideos.has(item.url) ? ' selected' : '');
                    const sizeStr = formatBytes(item.size);
                    card.innerHTML = `
                        <div class="audio-left">
                            <div class="select-checkbox-box">
                                <svg class="select-check-svg" viewBox="0 0 24 24"><path d="${SVG_PATHS.CHECK}"/></svg>
                            </div>
                            <div class="audio-icon-box" style="background: linear-gradient(135deg, #fef3c7, #fed7aa); color: #d97706;">
                                <svg viewBox="0 0 24 24"><path d="${SVG_PATHS.VIDEO}"/></svg>
                            </div>
                            <div class="audio-info">
                                <div class="audio-name">${item.name}</div>
                                <div class="audio-meta-row">
                                    <span class="video-format-badge">${item.format}</span>
                                    ${item.author ? `<span class="audio-author-name">${item.author}</span>` : ''}
                                    ${sizeStr ? `<span>${sizeStr}</span>` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="audio-right">
                            <div class="video-player-wrapper">
                                <video controls playsinline preload="metadata"></video>
                            </div>
                        </div>
                    `;
                    const videoNameEl = card.querySelector('.audio-name');
                    if (videoNameEl) {
                        videoNameEl.addEventListener('click', (e) => {
                            e.stopPropagation();
                            copyToClipboard(item.name, '已复制文件名');
                        });
                    }
                    const videoAuthorEl = card.querySelector('.audio-author-name');
                    if (videoAuthorEl) {
                        videoAuthorEl.addEventListener('click', (e) => {
                            e.stopPropagation();
                            copyToClipboard(item.author, '已复制作者名字');
                        });
                    }
                    const wrapper = card.querySelector('.video-player-wrapper');
                    if (wrapper) {
                        wrapper.addEventListener('click', (e) => {
                            e.stopPropagation();
                        });
                        wrapper.addEventListener('pointerdown', (e) => {
                            e.stopPropagation();
                        });
                    }
                    const videoPlayer = card.querySelector('video');
                    if (videoPlayer) {
                        const handleActiveInteraction = () => {
                            notifyUserPlayback();
                            if (!card['_hls']) {
                                setupVideoPlayerSource(card, videoPlayer, item, true);
                            }
                        };
                        videoPlayer.addEventListener('pointerdown', handleActiveInteraction);
                        videoPlayer.addEventListener('loadedmetadata', () => {
                            console.log('[MediaSniffer] Video metadata loaded, duration:', videoPlayer.duration);
                        });
                        videoPlayer.addEventListener('error', () => {
                            console.error('[MediaSniffer] Video element error:', videoPlayer.error?.code, videoPlayer.error?.message);
                        });
                        videoPlayer.addEventListener('play', () => {
                            handleActiveInteraction();
                            if (currentPlayingVideo && currentPlayingVideo !== videoPlayer) {
                                currentPlayingVideo.pause();
                            }
                            currentPlayingVideo = videoPlayer;
                            updateNowPlayingBar(item, card, 'VIDEO', true);
                        });
                        videoPlayer.addEventListener('pause', () => {
                            if (currentPlayingVideo === videoPlayer) {
                                updateNowPlayingBar(item, card, 'VIDEO', false);
                            }
                        });
                        videoPlayer.addEventListener('ended', () => {
                            if (currentPlayingVideo === videoPlayer) {
                                handleMediaEnded(card, 'VIDEO');
                            }
                        });
                    }
                    card.addEventListener('click', () => {
                        const isSelected = selectedVideos.has(item.url);
                        selectedVideos[isSelected ? 'delete' : 'add'](item.url);
                        card.classList.toggle('selected', !isSelected);
                        updateModalHeaderCounters();
                    });
                    if (videoObserver) {
                        videoObserver.observe(card);
                    }
                }
                videoGallery.appendChild(card);
            });
            existingCards.forEach((card, url) => {
                if (!filteredUrlSet.has(url)) {
                    card.style.display = 'none';
                    if (videoObserver) {
                        videoObserver.unobserve(card);
                    }
                }
            });
        }
        updateModalHeaderCounters();
        updateFloatingBadge();
        setTimeout(updateScrollNavState, 60);
        setTimeout(updateScrollNavState, 200);
    }

    /**
     * 使用原生WebCryptoAPI解密AES128切片二进制数据
     * 
     * @param {ArrayBuffer} encryptedBuffer 加密切片二进制流
     * @param {ArrayBuffer} keyBuffer 16字节密钥数据
     * @param {Uint8Array} iv 16字节初始向量
     * @returns {Promise<ArrayBuffer>} 解密后的明文二进制数据
     */
    async function decryptAes128Chunk(encryptedBuffer, keyBuffer, iv) {
        const cryptoKey = await window.crypto.subtle.importKey(
            'raw',
            keyBuffer,
            { name: 'AES-CBC' },
            false,
            ['decrypt']
        );
        return await window.crypto.subtle.decrypt(
            { name: 'AES-CBC', iv },
            cryptoKey,
            encryptedBuffer
        );
    }

    /**
     * 解析M3U8播放列表提取切片链接与加密密钥信息
     * 
     * @param {string} m3u8Text 播放列表文本内容
     * @param {string} baseUrl 当前播放列表基础链接
     * @param {string} prefix 任务序数标识前缀
     * @returns {Promise<Array<{url: string, key: ArrayBuffer|null, iv: Uint8Array|null}>>} 解析出的切片描述对象数组
     */
    async function parseM3u8Playlist(m3u8Text, baseUrl, prefix = '') {
        const lines = m3u8Text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const isMaster = lines.some(l => l.startsWith('#EXT-X-STREAM-INF'));
        if (isMaster) {
            let maxBandwidth = -1;
            let targetSubUrl = '';
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                    const bwMatch = lines[i].match(/BANDWIDTH=(\d+)/i);
                    const bw = bwMatch ? parseInt(bwMatch[1], 10) : 0;
                    const nextLine = lines[i + 1];
                    if (nextLine && !nextLine.startsWith('#') && bw >= maxBandwidth) {
                        maxBandwidth = bw;
                        targetSubUrl = new URL(nextLine, baseUrl).href;
                    }
                }
            }
            if (targetSubUrl) {
                const subText = await gmRequest(targetSubUrl, { responseType: 'text', prefix });
                return await parseM3u8Playlist(subText, targetSubUrl, prefix);
            }
        }

        const chunks = [];
        let currentKey = null;
        let currentIv = null;
        let mediaSequence = 0;
        const keyCache = new Map();

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
                mediaSequence = parseInt(line.split(':')[1], 10) || 0;
            } else if (line.startsWith('#EXT-X-KEY:')) {
                const methodMatch = line.match(/METHOD=([^,\s]+)/i);
                const method = methodMatch ? methodMatch[1].toUpperCase() : 'NONE';
                if (method === 'AES-128') {
                    const uriMatch = line.match(/URI=["']([^"']+)["']/i);
                    const ivMatch = line.match(/IV=(?:0x)?([a-fA-F0-9]+)/i);
                    if (uriMatch) {
                        const keyUrl = new URL(uriMatch[1], baseUrl).href;
                        if (!keyCache.has(keyUrl)) {
                            const keyBuffer = await gmRequest(keyUrl, { responseType: 'arraybuffer', prefix });
                            keyCache.set(keyUrl, keyBuffer);
                        }
                        currentKey = keyCache.get(keyUrl);
                    }
                    if (ivMatch) {
                        const hex = ivMatch[1].padStart(32, '0');
                        const ivBytes = new Uint8Array(16);
                        for (let b = 0; b < 16; b++) {
                            ivBytes[b] = parseInt(hex.slice(b * 2, b * 2 + 2), 16);
                        }
                        currentIv = ivBytes;
                    } else {
                        currentIv = null;
                    }
                } else if (method === 'NONE') {
                    currentKey = null;
                    currentIv = null;
                }
            } else if (line.startsWith('#EXTINF:')) {
                const nextLine = lines[i + 1];
                if (nextLine && !nextLine.startsWith('#')) {
                    const chunkUrl = new URL(nextLine, baseUrl).href;
                    let chunkIv = currentIv;
                    if (currentKey && !chunkIv) {
                        const seq = mediaSequence + chunks.length;
                        chunkIv = new Uint8Array(16);
                        const view = new DataView(chunkIv.buffer);
                        view.setUint32(12, seq, false);
                    }
                    chunks.push({
                        url: chunkUrl,
                        key: currentKey,
                        iv: chunkIv
                    });
                }
            }
        }
        return chunks;
    }

    /**
     * 并发拉取M3U8流媒体全量切片并无损合并为连续二进制流
     * 
     * @param {string} m3u8Url M3U8播放列表网络地址
     * @param {string} prefix 任务序数标识前缀
     * @returns {Promise<Object>} 包含合并后二进制数据Uint8Array的期约
     */
    async function fetchM3u8StreamBinary(m3u8Url, prefix = '') {
        const tag = prefix ? `${prefix} ` : '';
        showToast(`${tag}正在解析流媒体索引`, 60000, cancelDownload);
        const m3u8Text = await gmRequest(m3u8Url, { responseType: 'text', prefix });
        if (isDownloadCancelled) {
            throw new Error('Cancelled');
        }
        const chunks = await parseM3u8Playlist(m3u8Text, m3u8Url, prefix);
        if (isDownloadCancelled) {
            throw new Error('Cancelled');
        }
        const totalChunks = chunks.length;
        if (totalChunks === 0) {
            throw new Error('未解析到有效的音视频切片');
        }

        const chunkResults = new Array(totalChunks);
        let currentIndex = 0;
        let downloadedCount = 0;
        let totalBytesDownloaded = 0;
        const concurrency = Math.min(6, totalChunks);

        /**
         * 单个协程工作函数
         * 
         * @returns {Promise<void>} 协程执行期约
         */
        async function chunkWorker() {
            while (currentIndex < totalChunks && !isDownloadCancelled) {
                const idx = currentIndex;
                currentIndex++;
                const item = chunks[idx];
                const rawBuffer = await gmRequest(item.url, { responseType: 'arraybuffer', prefix: '', trackProgress: false });
                if (isDownloadCancelled) {
                    return;
                }
                let finalBuffer = rawBuffer;
                if (item.key) {
                    finalBuffer = await decryptAes128Chunk(rawBuffer, item.key, item.iv);
                }
                chunkResults[idx] = new Uint8Array(finalBuffer);
                downloadedCount++;
                totalBytesDownloaded += finalBuffer.byteLength;
                const percent = Math.round((downloadedCount / totalChunks) * 100);
                const sizeStr = formatBytes(totalBytesDownloaded);
                showToast(`${tag}正在下载切片 [${downloadedCount}/${totalChunks}] ${percent}% (${sizeStr})`, 60000, cancelDownload);
            }
        }

        const workers = [];
        for (let w = 0; w < concurrency; w++) {
            workers.push(chunkWorker());
        }
        await Promise.all(workers);

        if (isDownloadCancelled) {
            throw new Error('Cancelled');
        }

        const totalLength = chunkResults.reduce((acc, c) => acc + (c ? c.length : 0), 0);
        const mergedBytes = new Uint8Array(totalLength);
        let offset = 0;
        for (let i = 0; i < totalChunks; i++) {
            const chunk = chunkResults[i];
            if (chunk) {
                mergedBytes.set(chunk, offset);
                offset += chunk.length;
            }
        }
        return { data: mergedBytes };
    }

    /**
     * 单个媒体文件原生下载
     * 
     * @param {string} url 目标文件网络链接
     * @param {string} fileName 自定义保存文件名
     * @param {string} fallbackUrl 请求失败时的回退网络链接
     * @param {string} prefix 任务序数标识前缀
     * @returns {Promise<boolean>} 下载是否成功完成
     */
    async function downloadSingleItem(url, fileName = '', fallbackUrl = '', prefix = '') {
        if (isDownloadCancelled) {
            return false;
        }
        const isM3U8 = url.includes('.m3u8') || fileName.toLowerCase().endsWith('.m3u8') || fileName.toLowerCase().endsWith('.ts');
        const targetName = fileName || `media_${Date.now()}`;
        const tag = prefix ? `${prefix} ` : '';
        if (url.startsWith('data:')) {
            triggerAnchorDownload(url, targetName);
            return true;
        }
        if (isM3U8) {
            try {
                const videoBinary = await fetchM3u8StreamBinary(url, tag);
                if (isDownloadCancelled) {
                    return false;
                }
                const blob = new Blob([videoBinary.data], { type: 'video/mp2t' });
                const finalName = targetName.toLowerCase().endsWith('.ts') ? targetName : `${targetName.replace(/\.m3u8$/i, '')}.ts`;
                triggerAnchorDownload(URL.createObjectURL(blob), finalName);
                showToast(`${tag}下载完成`, 2000);
                return true;
            } catch (e) {
                if (isDownloadCancelled) {
                    return false;
                }
                console.error('[MediaSniffer] M3U8 download error:', e);
                showToast(`${tag}流媒体下载失败：${e.message || '网络错误'}`);
                return false;
            }
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
            triggerAnchorDownload(URL.createObjectURL(blob), targetName);
            showToast(`${tag}下载完成`, 2000);
            return true;
        } catch (e) {
            if (isDownloadCancelled) {
                return false;
            }
            if (fallbackUrl && fallbackUrl !== url) {
                return await downloadSingleItem(fallbackUrl, fileName, '', prefix);
            }
            if (e.message?.startsWith('HTTP ')) {
                showToast(`${tag}下载失败：${e.message}`);
                return false;
            }
            if (typeof GM_download === 'function') {
                GM_download({ url, name: targetName, saveAs: false });
                return true;
            }
            showToast(`${tag}下载失败：${e.message || '网络错误'}`);
            return false;
        }
    }

    /**
     * 获取当前激活选项卡的媒体数据上下文配置
     * 
     * @returns {Object} 包含存储集选中集类型名默认后缀与目录前缀的上下文对象
     */
    function getCurrentTabMediaContext() {
        if (currentTab === 'IMAGE') {
            return {
                store: imageStore,
                selected: selectedImages,
                typeName: '图片',
                defaultExt: 'jpg',
                prefix: 'image',
                folder: 'images'
            };
        }
        if (currentTab === 'AUDIO') {
            return {
                store: audioStore,
                selected: selectedAudios,
                typeName: '音频',
                defaultExt: 'mp3',
                prefix: 'audio',
                folder: 'audios'
            };
        }
        return {
            store: videoStore,
            selected: selectedVideos,
            typeName: '视频',
            defaultExt: 'mp4',
            prefix: 'video',
            folder: 'videos'
        };
    }

    /* 采用串行异步队列逐个下载选中的媒体文件 */
    async function downloadSelectedDirectly() {
        const ctx = getCurrentTabMediaContext();
        if (ctx.selected.size === 0) {
            showToast(`请先勾选需要下载的${ctx.typeName}`);
            return;
        }
        isDownloadCancelled = false;
        const list = Array.from(ctx.selected);
        showToast(`开始下载 (共 ${list.length} 个文件)`, 1500, cancelDownload);
        let successCount = 0;
        for (let idx = 0; idx < list.length; idx++) {
            if (isDownloadCancelled) {
                break;
            }
            const url = list[idx];
            const prefix = list.length > 1 ? `[${idx + 1}/${list.length}]` : '';
            const item = ctx.store.get(url);
            const fileName = getItemFileName(item, `${ctx.prefix}_${idx + 1}`, ctx.defaultExt);
            const downloadUrl = currentTab === 'IMAGE' ? (item?.hdUrl || url) : url;
            const fallbackUrl = currentTab === 'IMAGE' ? url : '';
            const success = await downloadSingleItem(downloadUrl, fileName, fallbackUrl, prefix);
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
        if (url.includes('.m3u8')) {
            return await fetchM3u8StreamBinary(url, prefix);
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
            view.setUint16(6, 2048, true);
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
            const centralHeader = new Uint8Array(46 + nameBytes.length);
            const cView = new DataView(centralHeader.buffer);
            cView.setUint32(0, 33639248, true);
            cView.setUint16(4, 20, true);
            cView.setUint16(6, 20, true);
            cView.setUint16(8, 2048, true);
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
            centralHeader.set(nameBytes, 46);
            centralEntries.push(centralHeader);
            offset += localHeader.length + dataBytes.length;
        }
        const centralDirOffset = offset;
        const centralDirSize = centralEntries.reduce((acc, c) => acc + c.length, 0);
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

    /* 将选中的全部图片音频或视频打包为压缩包下载 */
    async function downloadSelectedAsZip() {
        const ctx = getCurrentTabMediaContext();
        if (ctx.selected.size === 0) {
            showToast(`请先勾选需要下载的${ctx.typeName}`);
            return;
        }
        isDownloadCancelled = false;
        const selectedList = Array.from(ctx.selected);
        const fileNames = selectedList.map((url, idx) => {
            const item = ctx.store.get(url);
            const padIndex = currentTab === 'IMAGE' ? String(idx + 1).padStart(3, '0') : String(idx + 1);
            return getItemFileName(item, `${ctx.prefix}_${padIndex}`, ctx.defaultExt);
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
            const targetUrl = currentTab === 'IMAGE' ? (imageStore.get(url)?.hdUrl || url) : url;
            const fileName = `${ctx.folder}/${uniqueFileNames[idx]}`;
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
        showToast('正在生成压缩包', 60000);
        const zipBytes = createZipArchive(filesToZip);
        const zipBlob = new Blob([zipBytes], { type: 'application/zip' });
        const zipFileName = `${ctx.folder}_pack_${Date.now()}.zip`;
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
     * 在沙箱容器内执行安全静默锚点点击下载并阻断冒泡
     * 
     * @param {string} blobUrl 待下载的二进制对象链接
     * @param {string} fileName 保存的文件名
     */
    function performSafeAnchorClick(blobUrl, fileName) {
        const downloadLink = document.createElement('a');
        downloadLink.href = blobUrl;
        downloadLink.download = fileName;
        downloadLink.style.display = 'none';
        downloadLink.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') {
                e.stopImmediatePropagation();
            }
        });
        const mountTarget = shadow || container || document.body;
        mountTarget.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();
        setTimeout(() => {
            if (blobUrl.startsWith('blob:')) {
                URL.revokeObjectURL(blobUrl);
            }
        }, 30000);
    }

    /**
     * 安全触发文件保存与下载并阻断宿主页面路由劫持
     * 
     * @param {string} blobUrl 待下载的二进制对象链接
     * @param {string} fileName 保存的文件名
     */
    function triggerAnchorDownload(blobUrl, fileName) {
        if (typeof GM_download === 'function') {
            try {
                GM_download({
                    url: blobUrl,
                    name: fileName,
                    saveAs: false,
                    onload: () => {
                        setTimeout(() => {
                            if (blobUrl.startsWith('blob:')) {
                                URL.revokeObjectURL(blobUrl);
                            }
                        }, 30000);
                    },
                    onerror: () => {
                        performSafeAnchorClick(blobUrl, fileName);
                    }
                });
                return;
            } catch { }
        }
        performSafeAnchorClick(blobUrl, fileName);
    }

    /**
     * 安全在新标签页中打开媒体链接并阻断防盗链与事件冒泡
     * 
     * @param {string} url 目标资源网络链接
     */
    function openInNewTab(url) {
        if (!url) {
            return;
        }
        if (typeof GM_openInTab === 'function') {
            try {
                GM_openInTab(url, { active: false, insert: true, setParent: true });
                return;
            } catch { }
        }
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = ['no' + 'opener', 'no' + 'referrer'].join(' ');
        link.referrerPolicy = 'no-' + 'referrer';
        link.style.display = 'none';
        link.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') {
                e.stopImmediatePropagation();
            }
        });
        const mountTarget = shadow || container || document.body;
        mountTarget.appendChild(link);
        link.click();
        link.remove();
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
        const fabWidth = fab?.offsetWidth || 56;
        const fabHeight = fab?.offsetHeight || 56;
        const maxX = window.innerWidth - fabWidth - 8;
        const maxY = window.innerHeight - fabHeight - 8;
        return {
            x: Math.max(8, Math.min(x, maxX)),
            y: Math.max(8, Math.min(y, maxY))
        };
    }

    /* 校验并重新约束悬浮球在当前可视窗口内 */
    function reClampFab() {
        if (fab.style.left && fab.style.left !== 'auto') {
            const currentLeft = parseFloat(fab.style.left) || 0;
            const currentTop = parseFloat(fab.style.top) || 0;
            const { x, y } = clampFabPosition(currentLeft, currentTop);
            fab.style.left = `${x}px`;
            fab.style.top = `${y}px`;
        }
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

    window.addEventListener('resize', reClampFab);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', reClampFab, { once: true });
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
        scanAllPageMedia();
        renderGallery();
        setTimeout(updateScrollNavState, 80);
        setTimeout(updateScrollNavState, 300);
    });

    // 选项卡切换事件
    const tabImgBtn = shadow.getElementById('ag-tab-img');
    const tabAudioBtn = shadow.getElementById('ag-tab-audio');
    const tabVideoBtn = shadow.getElementById('ag-tab-video');

    /**
     * 切换当前激活的媒体选项卡
     * 
     * @param {string} tab 目标选项卡标识
     */
    function switchTab(tab) {
        if (currentTab === tab) {
            return;
        }
        stopAllMediaPlayback();
        currentTab = tab;
        if (tabImgBtn) {
            tabImgBtn.classList.toggle('active', tab === 'IMAGE');
        }
        if (tabAudioBtn) {
            tabAudioBtn.classList.toggle('active', tab === 'AUDIO');
        }
        if (tabVideoBtn) {
            tabVideoBtn.classList.toggle('active', tab === 'VIDEO');
        }
        renderGallery();
    }

    tabImgBtn?.addEventListener('click', () => switchTab('IMAGE'));
    tabAudioBtn?.addEventListener('click', () => switchTab('AUDIO'));
    tabVideoBtn?.addEventListener('click', () => switchTab('VIDEO'));

    shadow.getElementById('ag-btn-close').addEventListener('click', () => {
        stopAllMediaPlayback();
        closeLightbox();
        metadataQueue.length = 0;
        if (videoObserver) {
            videoObserver.disconnect();
            videoObserver = null;
        }
        isModalOpen = false;
        modal.classList.remove('active');
        document.body.style.overflow = savedBodyOverflow;
        fab.style.display = '';
    });

    /* 清空当前图片状态与缓存 */
    function clearImageState() {
        closeLightbox();
        imageStore.clear();
        selectedImages.clear();
        knownImageFormats.clear();
        checkedImageFormats.clear();
        const imgGallery = shadow.getElementById('ag-gallery-image');
        if (imgGallery) {
            imgGallery.innerHTML = '';
        }
    }

    /* 清空当前音频状态与队列 */
    function clearAudioState() {
        stopCurrentAudio();
        metadataQueue.length = 0;
        activeMetadataCount = 0;
        audioStore.clear();
        cleanAudioUrls.clear();
        selectedAudios.clear();
        knownAudioFormats.clear();
        checkedAudioFormats.clear();
        const audioGallery = shadow.getElementById('ag-gallery-audio');
        if (audioGallery) {
            audioGallery.innerHTML = '';
        }
    }

    /* 清空当前视频状态与播放实例 */
    function clearVideoState() {
        stopCurrentVideo();
        if (videoObserver) {
            videoObserver.disconnect();
            videoObserver = null;
        }
        const videoGallery = shadow.getElementById('ag-gallery-video');
        if (videoGallery) {
            videoGallery.querySelectorAll('.video-card').forEach(card => {
                if (card['_hls']) {
                    try {
                        card['_hls']['destroy']();
                    } catch { }
                    card['_hls'] = null;
                }
            });
            videoGallery.innerHTML = '';
        }
        videoStore.clear();
        cleanVideoUrls.clear();
        selectedVideos.clear();
        knownVideoFormats.clear();
        checkedVideoFormats.clear();
    }

    let isDeepCrawling = false;
    let cancelDeepCrawl = false;
    let activeDeepCrawlXhr = null;

    /* 立即终止正在进行的深度抓取任务 */
    function stopAListDeepCrawl() {
        cancelDeepCrawl = true;
        const deepCrawlBtn = shadow.getElementById('ag-btn-deep-crawl');
        if (deepCrawlBtn) {
            deepCrawlBtn.classList.remove('running');
            deepCrawlBtn.textContent = '深度抓取';
        }
        if (activeDeepCrawlXhr) {
            try {
                activeDeepCrawlXhr.abort?.();
            } catch { }
            activeDeepCrawlXhr = null;
        }
    }

    /**
     * 递归扫描当前网盘作者目录下的所有子文件夹与媒体资源
     */
    async function startAListDeepCrawl() {
        const deepCrawlBtn = shadow.getElementById('ag-btn-deep-crawl');
        if (isDeepCrawling) {
            stopAListDeepCrawl();
            return;
        }
        const rawCurrentPath = lastAListPath || (lastAListRawData?.json?.data?.path ? decodeURIComponent(lastAListRawData.json.data.path) : '');
        const rootPath = getAListAuthorBasePath(rawCurrentPath) || rawCurrentPath;
        if (!rootPath) {
            showToast('未检测到有效的网盘目录');
            return;
        }
        isDeepCrawling = true;
        cancelDeepCrawl = false;
        if (deepCrawlBtn) {
            deepCrawlBtn.classList.add('running');
            deepCrawlBtn.textContent = '停止抓取';
        }

        const queue = [rootPath];
        const visited = new Set();
        let foundMediaCount = 0;
        const authorName = rootPath.split('/').filter(Boolean).pop() || '';

        showToast(`开始深度抓取作者【${authorName}】的全部作品：${rootPath}`, 60000);

        try {
            while (queue.length > 0 && !cancelDeepCrawl) {
                const currentPath = queue.shift();
                if (!currentPath || visited.has(currentPath)) {
                    continue;
                }
                visited.add(currentPath);

                if (!cancelDeepCrawl) {
                    showToast(`深度抓取中 (已扫描 ${visited.size} 目录 / ${foundMediaCount} 作品)`, 60000);
                }

                let page = 1;
                let totalItems = 0;
                let loadedItems = 0;

                do {
                    if (cancelDeepCrawl) {
                        break;
                    }
                    try {
                        const payload = {
                            path: currentPath,
                            password: '',
                            page,
                            per_page: 0,
                            refresh: false
                        };
                        const res = await new Promise((resolve, reject) => {
                            if (cancelDeepCrawl) {
                                reject(new Error('Cancelled'));
                                return;
                            }
                            if (typeof GM_xmlhttpRequest === 'function') {
                                activeDeepCrawlXhr = GM_xmlhttpRequest({
                                    method: 'POST',
                                    url: `${window.location.origin}/api/fs/list`,
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Referer': window.location.href
                                    },
                                    timeout: 10000,
                                    data: JSON.stringify(payload),
                                    onload: (r) => {
                                        activeDeepCrawlXhr = null;
                                        try {
                                            resolve(JSON.parse(r.responseText));
                                        } catch (e) {
                                            reject(e);
                                        }
                                    },
                                    onerror: (err) => {
                                        activeDeepCrawlXhr = null;
                                        reject(err);
                                    },
                                    ['ontimeout']: () => {
                                        activeDeepCrawlXhr = null;
                                        reject(new Error('Timeout'));
                                    },
                                    ['onabort']: () => {
                                        activeDeepCrawlXhr = null;
                                        reject(new Error('Cancelled'));
                                    }
                                });
                            } else {
                                const controller = new AbortController();
                                const timeoutId = setTimeout(() => {
                                    controller.abort();
                                }, 10000);
                                fetch(`${window.location.origin}/api/fs/list`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(payload),
                                    signal: controller.signal
                                })
                                    .then(r => r.json())
                                    .then((data) => {
                                        clearTimeout(timeoutId);
                                        resolve(data);
                                    })
                                    .catch((err) => {
                                        clearTimeout(timeoutId);
                                        reject(err);
                                    });
                            }
                        });

                        if (!res || res.code !== 200 || !res.data || cancelDeepCrawl) {
                            break;
                        }

                        const rawContent = res.data.content;
                        const list = Array.isArray(rawContent) ? rawContent : (res.data.name ? [res.data] : []);
                        totalItems = res.data.total || list.length;
                        loadedItems += list.length;

                        for (const item of list) {
                            if (cancelDeepCrawl) {
                                break;
                            }
                            const itemFullPath = `${currentPath === '/' ? '' : currentPath}/${item.name}`;
                            if (item['is_dir']) {
                                if (!visited.has(itemFullPath) && !queue.includes(itemFullPath)) {
                                    queue.push(itemFullPath);
                                }
                            } else {
                                const finalUrl = `${window.location.origin}/d${encodeURI(itemFullPath)}?sign=${item.sign || ''}`;
                                const pathSegments = currentPath.split('/').filter(Boolean);
                                const authorName = pathSegments.length >= 2 ? pathSegments[1] : (pathSegments[0] || '');

                                if (IMAGE_EXT_REGEX.test(item.name)) {
                                    const cleanName = sanitizeFileName(item.name.replace(/\.[^.]+$/, ''));
                                    registerImage(finalUrl, 'ALIST_DEEP', { name: cleanName });
                                    foundMediaCount++;
                                } else if (AUDIO_EXT_REGEX.test(item.name)) {
                                    const format = item.name.split('.').pop().toUpperCase();
                                    registerAudio(finalUrl, 'ALIST_DEEP', {
                                        name: item.name,
                                        author: authorName,
                                        size: item.size || 0,
                                        format
                                    });
                                    foundMediaCount++;
                                } else if (VIDEO_EXT_REGEX.test(item.name) || item.type === 2) {
                                    const format = item.name.split('.').pop().toUpperCase();
                                    registerVideo(finalUrl, 'ALIST_DEEP', {
                                        name: item.name,
                                        author: authorName,
                                        size: item.size || 0,
                                        format
                                    });
                                    foundMediaCount++;
                                }
                            }
                        }

                        if (loadedItems < totalItems && list.length > 0 && !cancelDeepCrawl) {
                            page++;
                        } else {
                            break;
                        }
                    } catch {
                        break;
                    }
                } while (loadedItems < totalItems && !cancelDeepCrawl);

                if (queue.length > 0 && !cancelDeepCrawl) {
                    await new Promise(r => setTimeout(r, 40));
                }
            }
        } finally {
            const wasCancelled = cancelDeepCrawl;
            isDeepCrawling = false;
            cancelDeepCrawl = false;
            activeDeepCrawlXhr = null;
            if (deepCrawlBtn) {
                deepCrawlBtn.classList.remove('running');
                deepCrawlBtn.textContent = '深度抓取';
            }
            renderGallery();
            updateFloatingBadge();
            updateModalHeaderCounters();
            if (wasCancelled) {
                showToast(`已停止深度抓取 (已收录 ${foundMediaCount} 作品)`, 2500);
            } else {
                showToast(`深度抓取完成 (${visited.size} 目录 / ${foundMediaCount} 作品)`, 3500);
            }
        }
    }

    shadow.getElementById('ag-btn-deep-crawl')?.addEventListener('click', startAListDeepCrawl);

    shadow.getElementById('ag-btn-refresh')?.addEventListener('click', () => {
        if (currentTab === 'IMAGE') {
            isImagesManuallyCleared = false;
            clearImageState();
            scanPageImages();
            renderGallery();
            updateFloatingBadge();
            updateModalHeaderCounters();
            showToast('已重新扫描图片');
        } else if (currentTab === 'AUDIO') {
            clearAudioState();
            if (lastAListRawData) {
                handleAListResponse(lastAListRawData.json, lastAListRawData.reqUrl);
                showToast('已重新加载音频列表');
            } else {
                renderGallery();
                updateFloatingBadge();
                updateModalHeaderCounters();
                showToast('暂无历史音频数据');
            }
        } else {
            clearVideoState();
            scanPageVideos();
            if (lastAListRawData) {
                handleAListResponse(lastAListRawData.json, lastAListRawData.reqUrl);
                showToast('已重新加载视频列表');
            } else {
                renderGallery();
                updateFloatingBadge();
                updateModalHeaderCounters();
                showToast('已重新扫描视频');
            }
        }
    });

    shadow.getElementById('ag-btn-clear')?.addEventListener('click', () => {
        if (currentTab === 'IMAGE') {
            isImagesManuallyCleared = true;
            clearImageState();
            showToast('已清空图片列表');
        } else if (currentTab === 'AUDIO') {
            clearAudioState();
            showToast('已清空音频列表');
        } else {
            clearVideoState();
            showToast('已清空视频列表');
        }
        renderGallery();
        updateFloatingBadge();
        updateModalHeaderCounters();
    });

    shadow.getElementById('ag-btn-toggle-select').addEventListener('click', () => {
        const ctx = getCurrentTabMediaContext();
        let filtered;
        if (currentTab === 'IMAGE') {
            filtered = getFilteredImages();
        } else if (currentTab === 'AUDIO') {
            filtered = getFilteredAudios();
        } else {
            filtered = getFilteredVideos();
        }
        if (filtered.length === 0) {
            return;
        }
        const isAllSelected = filtered.every(item => ctx.selected.has(item.url));
        const action = isAllSelected ? 'delete' : 'add';
        filtered.forEach(item => ctx.selected[action](item.url));
        renderGallery();
    });

    shadow.getElementById('ag-btn-copy-links').addEventListener('click', () => {
        const ctx = getCurrentTabMediaContext();
        if (ctx.selected.size === 0) {
            showToast(`请先勾选需要复制的${ctx.typeName}`);
            return;
        }
        const links = (currentTab === 'IMAGE')
            ? Array.from(ctx.selected).map(u => imageStore.get(u)?.hdUrl || u)
            : Array.from(ctx.selected);
        copyToClipboard(links.join('\n'), `已复制 ${ctx.selected.size} 条${ctx.typeName}链接到剪贴板`);
    });

    shadow.getElementById('ag-btn-open-tabs').addEventListener('click', () => {
        const ctx = getCurrentTabMediaContext();
        if (ctx.selected.size === 0) {
            showToast(`请先勾选需要打开的${ctx.typeName}`);
            return;
        }
        const links = (currentTab === 'IMAGE')
            ? Array.from(ctx.selected).map(u => imageStore.get(u)?.hdUrl || u)
            : Array.from(ctx.selected);
        links.forEach(url => openInNewTab(url));
        showToast(`已在新标签页打开 ${links.length} 个${ctx.typeName}`);
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
            const val = searchInput.value.trim().toLowerCase();
            if (currentTab === 'AUDIO') {
                audioSearchKeyword = val;
            } else {
                videoSearchKeyword = val;
            }
            searchWrap.classList.toggle('has-value', searchInput.value.length > 0);
            renderGallery();
        });
        if (searchClear) {
            searchClear.addEventListener('click', () => {
                searchInput.value = '';
                if (currentTab === 'AUDIO') {
                    audioSearchKeyword = '';
                } else {
                    videoSearchKeyword = '';
                }
                searchWrap.classList.remove('has-value');
                renderGallery();
                searchInput.focus();
            });
        }
    }

    const sortGroup = shadow.getElementById('ag-sort-group');
    const sortTrigger = shadow.getElementById('ag-sort-trigger');
    const sortMenu = shadow.getElementById('ag-sort-menu');
    const sortOrderBtn = shadow.getElementById('ag-btn-sort-order');

    if (sortGroup && sortTrigger && sortMenu) {
        sortTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = sortMenu.style.display !== 'none';
            sortMenu.style.display = isOpen ? 'none' : 'flex';
            sortGroup.classList.toggle('open', !isOpen);
        });

        sortMenu.querySelectorAll('.sort-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = item.dataset.value;
                tabSortState[currentTab].field = val;
                if (val === 'SIZE') {
                    tabSortState[currentTab].order = 'DESC';
                } else {
                    tabSortState[currentTab].order = 'ASC';
                }
                saveSortPreferences();
                sortMenu.style.display = 'none';
                sortGroup.classList.remove('open');
                updateSortUI();
                renderGallery();
            });
        });
    }

    shadow.addEventListener('click', () => {
        if (sortMenu && sortMenu.style.display !== 'none') {
            sortMenu.style.display = 'none';
            if (sortGroup) {
                sortGroup.classList.remove('open');
            }
        }
    });

    if (sortOrderBtn) {
        sortOrderBtn.addEventListener('click', () => {
            const currentOrder = getCurrentSortOrder();
            tabSortState[currentTab].order = currentOrder === 'ASC' ? 'DESC' : 'ASC';
            saveSortPreferences();
            updateSortUI();
            renderGallery();
        });
    }

    updateSortUI();

    /**
     * 更新底部正在播放定位栏的状态与内容
     * 
     * @param {Object|null} item 正在播放或暂停的媒体对象
     * @param {HTMLElement|null} card 对应的 DOM 卡片节点
     * @param {string|null} type 媒体类型
     * @param {boolean} isPlaying 是否正在播放
     */
    function updateNowPlayingBar(item, card, type, isPlaying) {
        const bar = shadow.getElementById('ag-now-playing-bar');
        const titleEl = shadow.getElementById('ag-now-playing-title');
        const toggleBtn = shadow.getElementById('ag-btn-pause-playing');
        const modeBtn = shadow.getElementById('ag-btn-play-mode');
        if (!bar || !titleEl) {
            return;
        }
        if (currentPlayingCard && currentPlayingCard !== card) {
            currentPlayingCard.classList.remove('is-playing');
        }
        if (!item || !card) {
            bar.style.display = 'none';
            if (card) {
                card.classList.remove('is-playing');
            }
            currentPlayingCard = null;
            currentPlayingType = null;
            return;
        }
        currentPlayingCard = card;
        currentPlayingType = type;
        card.classList.toggle('is-playing', isPlaying);
        const innerSpan = shadow.getElementById('ag-now-playing-title-inner') || titleEl;
        innerSpan.textContent = item.name || '未知媒体';
        titleEl.title = `${item.name || ''} (点击定位)`;
        // 计算文本实际溢出尺寸并在确实超长截断时激活跑马灯
        requestAnimationFrame(() => {
            titleEl.classList.remove('has-marquee');
            titleEl.style.removeProperty('--marquee-distance');
            titleEl.style.removeProperty('--marquee-duration');
            const innerWidth = innerSpan.getBoundingClientRect().width;
            const containerWidth = titleEl.getBoundingClientRect().width;
            const diff = innerWidth - containerWidth;
            if (diff > 16) {
                const duration = Math.max(6, Math.min(18, diff / 18 + 3));
                titleEl.style.setProperty('--marquee-distance', `-${Math.ceil(diff) + 14}px`);
                titleEl.style.setProperty('--marquee-duration', `${duration.toFixed(1)}s`);
                titleEl.classList.add('has-marquee');
            }
        });
        if (toggleBtn) {
            toggleBtn.textContent = isPlaying ? '暂停' : '继续';
            toggleBtn.classList.toggle('btn-now-playing-resume', !isPlaying);
        }
        if (modeBtn) {
            const meta = getPlayModeMeta(currentPlayMode);
            modeBtn.textContent = meta.label;
            modeBtn.title = meta.title;
        }
        if (bar.style.display === 'none') {
            applyNowPlayingBarTransform(barCurrentTx, barCurrentTy);
            bar.style.display = 'flex';
        }
    }

    /**
     * 获取播放模式的中文文本与提示文案
     * 
     * @param {string} mode 播放模式枚举
     * @returns {Object} 包含简写文本与完整提示的对象
     */
    function getPlayModeMeta(mode) {
        if (mode === PLAY_MODES.LOOP) {
            return { label: '循环', title: '循环播放', toast: '已切换至循环播放' };
        }
        if (mode === PLAY_MODES.RANDOM) {
            return { label: '随机', title: '随机播放', toast: '已切换至随机播放' };
        }
        return { label: '顺序', title: '顺序播放', toast: '已切换至顺序播放' };
    }

    /**
     * 循环切换当前播放模式并持久化
     */
    function togglePlayMode() {
        playedRandomUrls.clear();
        if (currentPlayMode === PLAY_MODES.ORDER) {
            currentPlayMode = PLAY_MODES.LOOP;
        } else if (currentPlayMode === PLAY_MODES.LOOP) {
            currentPlayMode = PLAY_MODES.RANDOM;
        } else {
            currentPlayMode = PLAY_MODES.ORDER;
        }
        GM_setValue('ag_media_play_mode', currentPlayMode);
        const meta = getPlayModeMeta(currentPlayMode);
        const modeBtn = shadow.getElementById('ag-btn-play-mode');
        if (modeBtn) {
            modeBtn.textContent = meta.label;
            modeBtn.title = meta.title;
        }
        showToast(meta.toast);
    }

    /**
     * 激活并播放指定卡片的媒体资源
     * 
     * @param {HTMLElement} card 目标媒体卡片节点
     * @param {string} type 媒体类型
     */
    function playCardMedia(card, type) {
        if (!card) {
            return;
        }
        const isAudio = type === 'AUDIO';
        const url = card.dataset.url;
        const item = isAudio ? audioStore.get(url) : videoStore.get(url);
        if (!item) {
            return;
        }
        if (currentTab !== type) {
            switchTab(type);
        }
        if (isAudio) {
            stopCurrentVideo();
            const audioPlayer = card.querySelector('audio');
            if (audioPlayer) {
                if (currentPlayingAudio && currentPlayingAudio !== audioPlayer) {
                    currentPlayingAudio.pause();
                }
                currentPlayingAudio = audioPlayer;
                if (audioPlayer.preload !== 'auto') {
                    audioPlayer.preload = 'auto';
                }
                audioPlayer.play().catch(() => { });
                updateNowPlayingBar(item, card, 'AUDIO', true);
            }
        } else {
            stopCurrentAudio();
            const videoPlayer = card.querySelector('video');
            if (videoPlayer) {
                if (currentPlayingVideo && currentPlayingVideo !== videoPlayer) {
                    currentPlayingVideo.pause();
                }
                if (!card['_hls']) {
                    setupVideoPlayerSource(card, videoPlayer, item, true);
                }
                currentPlayingVideo = videoPlayer;
                videoPlayer.play().catch(() => { });
                updateNowPlayingBar(item, card, 'VIDEO', true);
            }
        }
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        updateScrollNavState();
        card.classList.remove('locate-pulse');
        void card.offsetWidth;
        card.classList.add('locate-pulse');
        setTimeout(() => {
            if (card) {
                card.classList.remove('locate-pulse');
            }
        }, 1500);
    }

    /**
     * 媒体播放结束时的自动切歌调度器
     * 
     * @param {HTMLElement} card 当前结束的媒体卡片
     * @param {string} type 媒体类型
     */
    function handleMediaEnded(card, type) {
        if (currentPlayMode === PLAY_MODES.LOOP) {
            const mediaEl = card.querySelector(type === 'AUDIO' ? 'audio' : 'video');
            if (mediaEl) {
                mediaEl.currentTime = 0;
                mediaEl.play().catch(() => { });
            }
            return;
        }
        const gallery = shadow.getElementById(type === 'AUDIO' ? 'ag-gallery-audio' : 'ag-gallery-video');
        if (!gallery) {
            updateNowPlayingBar(null, null, null, false);
            return;
        }
        const cards = Array.from(gallery.querySelectorAll(type === 'AUDIO' ? '.audio-card' : '.video-card'))
            .filter(c => c.style.display !== 'none');
        if (cards.length === 0) {
            updateNowPlayingBar(null, null, null, false);
            return;
        }
        const currentIndex = cards.indexOf(card);
        let targetCard = null;
        if (currentPlayMode === PLAY_MODES.RANDOM) {
            playedRandomUrls.add(card.dataset.url);
            let unplayedCards = cards.filter(c => !playedRandomUrls.has(c.dataset.url));
            if (unplayedCards.length === 0) {
                playedRandomUrls.clear();
                unplayedCards = cards.filter(c => c !== card);
                if (unplayedCards.length === 0) {
                    unplayedCards = cards;
                }
            }
            targetCard = unplayedCards[Math.floor(Math.random() * unplayedCards.length)];
            if (targetCard) {
                playedRandomUrls.add(targetCard.dataset.url);
            }
        } else {
            const nextIndex = (currentIndex + 1) % cards.length;
            targetCard = cards[nextIndex];
        }
        if (targetCard) {
            playCardMedia(targetCard, type);
        } else {
            updateNowPlayingBar(null, null, null, false);
        }
    }

    /**
     * 手动切换播放下一个媒体
     */
    function playNextMedia() {
        if (!currentPlayingCard || !currentPlayingType) {
            return;
        }
        const gallery = shadow.getElementById(currentPlayingType === 'AUDIO' ? 'ag-gallery-audio' : 'ag-gallery-video');
        if (!gallery) {
            return;
        }
        const cards = Array.from(gallery.querySelectorAll(currentPlayingType === 'AUDIO' ? '.audio-card' : '.video-card'))
            .filter(c => c.style.display !== 'none');
        if (cards.length === 0) {
            return;
        }
        const currentIndex = cards.indexOf(currentPlayingCard);
        let targetCard = null;
        if (currentPlayMode === PLAY_MODES.RANDOM) {
            playedRandomUrls.add(currentPlayingCard.dataset.url);
            let unplayedCards = cards.filter(c => !playedRandomUrls.has(c.dataset.url));
            if (unplayedCards.length === 0) {
                playedRandomUrls.clear();
                unplayedCards = cards.filter(c => c !== currentPlayingCard);
                if (unplayedCards.length === 0) {
                    unplayedCards = cards;
                }
            }
            targetCard = unplayedCards[Math.floor(Math.random() * unplayedCards.length)];
            if (targetCard) {
                playedRandomUrls.add(targetCard.dataset.url);
            }
        } else {
            const nextIndex = (currentIndex + 1) % cards.length;
            targetCard = cards[nextIndex];
        }
        if (targetCard) {
            playCardMedia(targetCard, currentPlayingType);
        }
    }

    /**
     * 手动切换播放上一个媒体
     */
    function playPrevMedia() {
        if (!currentPlayingCard || !currentPlayingType) {
            return;
        }
        const gallery = shadow.getElementById(currentPlayingType === 'AUDIO' ? 'ag-gallery-audio' : 'ag-gallery-video');
        if (!gallery) {
            return;
        }
        const cards = Array.from(gallery.querySelectorAll(currentPlayingType === 'AUDIO' ? '.audio-card' : '.video-card'))
            .filter(c => c.style.display !== 'none');
        if (cards.length === 0) {
            return;
        }
        const currentIndex = cards.indexOf(currentPlayingCard);
        let targetCard = null;
        if (currentPlayMode === PLAY_MODES.RANDOM) {
            playedRandomUrls.add(currentPlayingCard.dataset.url);
            let unplayedCards = cards.filter(c => !playedRandomUrls.has(c.dataset.url));
            if (unplayedCards.length === 0) {
                playedRandomUrls.clear();
                unplayedCards = cards.filter(c => c !== currentPlayingCard);
                if (unplayedCards.length === 0) {
                    unplayedCards = cards;
                }
            }
            targetCard = unplayedCards[Math.floor(Math.random() * unplayedCards.length)];
            if (targetCard) {
                playedRandomUrls.add(targetCard.dataset.url);
            }
        } else {
            const prevIndex = (currentIndex - 1 + cards.length) % cards.length;
            targetCard = cards[prevIndex];
        }
        if (targetCard) {
            playCardMedia(targetCard, currentPlayingType);
        }
    }

    /**
     * 定位并瞬间直达当前正在播放的媒体卡片
     */
    function locateCurrentPlaying() {
        if (!currentPlayingCard || !currentPlayingType) {
            return;
        }
        const bar = shadow.getElementById('ag-now-playing-bar');
        if (bar && bar.style.display === 'none') {
            bar.style.display = 'flex';
        }
        if (currentTab !== currentPlayingType) {
            switchTab(currentPlayingType);
        }
        currentPlayingCard.scrollIntoView({ behavior: 'instant', block: 'center' });
        updateScrollNavState();
        currentPlayingCard.classList.remove('locate-pulse');
        void currentPlayingCard.offsetWidth;
        currentPlayingCard.classList.add('locate-pulse');
        setTimeout(() => {
            if (currentPlayingCard) {
                currentPlayingCard.classList.remove('locate-pulse');
            }
        }, 1500);
    }

    /**
     * 切换当前媒体的播放与暂停状态
     */
    function togglePlayPauseCurrent() {
        if (!currentPlayingCard || !currentPlayingType) {
            return;
        }
        const mediaEl = currentPlayingCard.querySelector(currentPlayingType === 'AUDIO' ? 'audio' : 'video');
        if (!mediaEl) {
            return;
        }
        if (mediaEl.paused) {
            mediaEl.play().catch(() => { });
        } else {
            mediaEl.pause();
        }
    }

    let isBarDragging = false;
    let hasBarMoved = false;
    let barDragStartX = 0;
    let barDragStartY = 0;
    let barCurrentTx = (typeof GM_getValue === 'function') ? (parseFloat(GM_getValue('ag_now_playing_tx', 0)) || 0) : 0;
    let barCurrentTy = (typeof GM_getValue === 'function') ? (parseFloat(GM_getValue('ag_now_playing_ty', 0)) || 0) : 0;
    let barStartTx = 0;
    let barStartTy = 0;

    /**
     * 应用并约束正在播放条的位移变换
     * 
     * @param {number} tx 水平偏移量
     * @param {number} ty 垂直偏移量
     */
    function applyNowPlayingBarTransform(tx, ty) {
        const bar = shadow.getElementById('ag-now-playing-bar');
        const modal = shadow.querySelector('.modal-overlay');
        if (!bar) {
            return;
        }
        if (window.innerWidth <= 768) {
            bar.style.transform = 'none';
            bar.style.left = '10px';
            bar.style.right = '10px';
            bar.style.bottom = 'calc(12px + env(safe-area-inset-bottom, 0px))';
            bar.style.width = 'auto';
            return;
        }
        bar.style.right = 'auto';
        bar.style.bottom = '24px';
        bar.style.left = '50%';
        bar.style.width = 'max-content';
        const barRect = bar.getBoundingClientRect();
        const modalWidth = modal ? modal.clientWidth : window.innerWidth;
        const modalHeight = modal ? modal.clientHeight : window.innerHeight;
        const halfWidth = (barRect.width || 400) / 2;
        const barHeight = barRect.height || 42;
        const minTx = 12 + halfWidth - modalWidth / 2;
        const maxTx = modalWidth / 2 - halfWidth - 12;
        const minTy = -(modalHeight - 24 - 12 - barHeight);
        const maxTy = 24 - 12;
        let clampedTx;
        let clampedTy;
        if (minTx <= maxTx) {
            clampedTx = Math.max(minTx, Math.min(tx, maxTx));
        } else {
            clampedTx = 0;
        }
        if (minTy <= maxTy) {
            clampedTy = Math.max(minTy, Math.min(ty, maxTy));
        } else {
            clampedTy = 0;
        }
        barCurrentTx = clampedTx;
        barCurrentTy = clampedTy;
        bar.style.transform = `translate(calc(-50% + ${clampedTx}px), ${clampedTy}px)`;
    }

    window.addEventListener('resize', () => {
        applyNowPlayingBarTransform(barCurrentTx, barCurrentTy);
    });

    /**
     * 处理正在播放条全局指针拖拽位移
     * 
     * @param {PointerEvent} e 指针移动事件对象
     */
    function onBarPointerMove(e) {
        if (!isBarDragging) {
            return;
        }
        const dx = e.clientX - barDragStartX;
        const dy = e.clientY - barDragStartY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            hasBarMoved = true;
        }
        applyNowPlayingBarTransform(barStartTx + dx, barStartTy + dy);
    }

    /* 处理正在播放条拖拽释放并持久化保存位置坐标 */
    function onBarPointerUp() {
        if (!isBarDragging) {
            return;
        }
        isBarDragging = false;
        const bar = shadow.getElementById('ag-now-playing-bar');
        if (bar) {
            bar.classList.remove('dragging');
            if (hasBarMoved && typeof GM_setValue === 'function') {
                GM_setValue('ag_now_playing_tx', barCurrentTx);
                GM_setValue('ag_now_playing_ty', barCurrentTy);
            }
        }
        window.removeEventListener('pointermove', onBarPointerMove);
        window.removeEventListener('pointerup', onBarPointerUp);
    }

    const prevPlayingBtn = shadow.getElementById('ag-btn-prev-playing');
    const nextPlayingBtn = shadow.getElementById('ag-btn-next-playing');
    const modePlayingBtn = shadow.getElementById('ag-btn-play-mode');
    const locatePlayingBtn = shadow.getElementById('ag-btn-locate-playing');
    const locatePlayingTitle = shadow.getElementById('ag-now-playing-title');
    const pausePlayingBtn = shadow.getElementById('ag-btn-pause-playing');
    const closePlayingBtn = shadow.getElementById('ag-btn-close-playing');
    const nowPlayingBar = shadow.getElementById('ag-now-playing-bar');
    const scrollTopBtn = shadow.getElementById('ag-btn-scroll-top');
    const scrollBottomBtn = shadow.getElementById('ag-btn-scroll-bottom');
    const modalBody = shadow.querySelector('.modal-body');

    if (nowPlayingBar) {
        nowPlayingBar.addEventListener('pointerdown', (e) => {
            if (window.innerWidth <= 768 || e.target.closest('button, .btn-now-playing, .btn-now-playing-close')) {
                return;
            }
            isBarDragging = true;
            hasBarMoved = false;
            barDragStartX = e.clientX;
            barDragStartY = e.clientY;
            barStartTx = barCurrentTx;
            barStartTy = barCurrentTy;
            nowPlayingBar.classList.add('dragging');
            window.addEventListener('pointermove', onBarPointerMove);
            window.addEventListener('pointerup', onBarPointerUp);
        });
    }

    if (prevPlayingBtn) {
        prevPlayingBtn.addEventListener('click', playPrevMedia);
    }
    if (nextPlayingBtn) {
        nextPlayingBtn.addEventListener('click', playNextMedia);
    }
    if (modePlayingBtn) {
        modePlayingBtn.addEventListener('click', togglePlayMode);
    }
    if (locatePlayingBtn) {
        locatePlayingBtn.addEventListener('click', locateCurrentPlaying);
    }
    if (locatePlayingTitle) {
        locatePlayingTitle.addEventListener('click', () => {
            if (hasBarMoved) {
                return;
            }
            locateCurrentPlaying();
        });
    }
    if (pausePlayingBtn) {
        pausePlayingBtn.addEventListener('click', togglePlayPauseCurrent);
    }
    if (closePlayingBtn) {
        closePlayingBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const bar = shadow.getElementById('ag-now-playing-bar');
            if (bar) {
                bar.style.display = 'none';
            }
            if (currentPlayingCard) {
                showToast('按 L 键可重新定位播放');
            }
        });
    }
    /**
     * 根据当前内容区的滚动位置动态更新上下导航按钮与分割线的显隐
     */
    function updateScrollNavState() {
        const capsule = shadow.getElementById('ag-scroll-capsule');
        const topBtn = shadow.getElementById('ag-btn-scroll-top');
        const bottomBtn = shadow.getElementById('ag-btn-scroll-bottom');
        const divider = shadow.getElementById('ag-scroll-nav-divider');
        const modalBody = shadow.querySelector('.modal-body');
        if (!capsule || !topBtn || !bottomBtn || !divider || !modalBody) {
            return;
        }
        const { scrollTop, scrollHeight, clientHeight } = modalBody;
        const maxScroll = scrollHeight - clientHeight;
        if (maxScroll <= 20) {
            capsule.style.display = 'none';
            return;
        }
        const isAtTop = scrollTop <= 20;
        const isAtBottom = scrollTop >= maxScroll - 20;
        topBtn.style.display = isAtTop ? 'none' : 'flex';
        bottomBtn.style.display = isAtBottom ? 'none' : 'flex';
        divider.style.display = (!isAtTop && !isAtBottom) ? 'block' : 'none';
        capsule.style.display = (isAtTop && isAtBottom) ? 'none' : 'flex';
        reClampScrollCapsule();
    }

    let isCapsuleDragging = false;
    let hasCapsuleMoved = false;
    let capsuleDragStartX = 0;
    let capsuleDragStartY = 0;
    let capsuleInitialLeft = 0;
    let capsuleInitialTop = 0;

    /**
     * 校验并约束滚动导航胶囊在当前可视窗口内
     * 
     * @param {number} x 水平坐标
     * @param {number} y 垂直坐标
     * @returns {{x: number, y: number}} 约束后的位置坐标
     */
    function clampScrollCapsulePosition(x, y) {
        const capsule = shadow.getElementById('ag-scroll-capsule');
        const capsuleWidth = capsule?.offsetWidth || 38;
        const capsuleHeight = capsule?.offsetHeight || 38;
        const maxX = Math.max(0, window.innerWidth - capsuleWidth - 8);
        const maxY = Math.max(0, window.innerHeight - capsuleHeight - 8);
        return {
            x: Math.max(8, Math.min(x, maxX)),
            y: Math.max(8, Math.min(y, maxY))
        };
    }

    /* 校验并重新约束滚动导航胶囊在当前可视窗口内 */
    function reClampScrollCapsule() {
        const capsule = shadow.getElementById('ag-scroll-capsule');
        if (capsule && capsule.style.left && capsule.style.left !== 'auto') {
            const currentLeft = parseFloat(capsule.style.left) || 0;
            const currentTop = parseFloat(capsule.style.top) || 0;
            const { x, y } = clampScrollCapsulePosition(currentLeft, currentTop);
            capsule.style.left = `${x}px`;
            capsule.style.top = `${y}px`;
        }
    }

    const savedCapsulePos = (typeof GM_getValue === 'function') ? GM_getValue('ag_scroll_capsule_pos', null) : null;
    const scrollCapsuleEl = shadow.getElementById('ag-scroll-capsule');
    if (scrollCapsuleEl && savedCapsulePos?.x !== undefined && savedCapsulePos?.y !== undefined) {
        const { x, y } = clampScrollCapsulePosition(savedCapsulePos.x, savedCapsulePos.y);
        scrollCapsuleEl.style.left = `${x}px`;
        scrollCapsuleEl.style.top = `${y}px`;
        scrollCapsuleEl.style.right = 'auto';
        scrollCapsuleEl.style.bottom = 'auto';
    }

    window.addEventListener('resize', reClampScrollCapsule);

    /**
     * 处理滚动导航胶囊全局指针拖拽位移
     * 
     * @param {PointerEvent} e 指针移动事件对象
     */
    function onCapsulePointerMove(e) {
        if (!isCapsuleDragging) {
            return;
        }
        const dx = e.clientX - capsuleDragStartX;
        const dy = e.clientY - capsuleDragStartY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            hasCapsuleMoved = true;
        }
        const capsule = shadow.getElementById('ag-scroll-capsule');
        if (capsule) {
            const { x, y } = clampScrollCapsulePosition(capsuleInitialLeft + dx, capsuleInitialTop + dy);
            capsule.style.left = `${x}px`;
            capsule.style.top = `${y}px`;
            capsule.style.right = 'auto';
            capsule.style.bottom = 'auto';
        }
    }

    /* 处理滚动导航胶囊拖拽释放并持久化保存位置坐标 */
    function onCapsulePointerUp() {
        if (!isCapsuleDragging) {
            return;
        }
        isCapsuleDragging = false;
        const capsule = shadow.getElementById('ag-scroll-capsule');
        if (capsule) {
            capsule.classList.remove('dragging');
            if (hasCapsuleMoved) {
                const rect = capsule.getBoundingClientRect();
                if (typeof GM_setValue === 'function') {
                    GM_setValue('ag_scroll_capsule_pos', { x: rect.left, y: rect.top });
                }
            }
        }
        window.removeEventListener('pointermove', onCapsulePointerMove);
        window.removeEventListener('pointerup', onCapsulePointerUp);
    }

    if (scrollCapsuleEl) {
        scrollCapsuleEl.addEventListener('pointerdown', (e) => {
            isCapsuleDragging = true;
            hasCapsuleMoved = false;
            capsuleDragStartX = e.clientX;
            capsuleDragStartY = e.clientY;
            const rect = scrollCapsuleEl.getBoundingClientRect();
            capsuleInitialLeft = rect.left;
            capsuleInitialTop = rect.top;
            scrollCapsuleEl.style.left = `${capsuleInitialLeft}px`;
            scrollCapsuleEl.style.top = `${capsuleInitialTop}px`;
            scrollCapsuleEl.style.right = 'auto';
            scrollCapsuleEl.style.bottom = 'auto';
            scrollCapsuleEl.classList.add('dragging');
            window.addEventListener('pointermove', onCapsulePointerMove);
            window.addEventListener('pointerup', onCapsulePointerUp);
        });
    }

    if (scrollTopBtn && modalBody) {
        scrollTopBtn.addEventListener('click', (e) => {
            if (hasCapsuleMoved) {
                e.stopPropagation();
                return;
            }
            modalBody.scrollTop = 0;
            updateScrollNavState();
        });
    }
    if (scrollBottomBtn && modalBody) {
        scrollBottomBtn.addEventListener('click', (e) => {
            if (hasCapsuleMoved) {
                e.stopPropagation();
                return;
            }
            modalBody.scrollTop = modalBody.scrollHeight;
            updateScrollNavState();
        });
    }
    if (modalBody) {
        modalBody.addEventListener('scroll', updateScrollNavState, { passive: true });
        window.addEventListener('resize', updateScrollNavState, { passive: true });
    }

    document.addEventListener('keydown', (e) => {
        if (!isModalOpen) {
            return;
        }
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) {
            return;
        }
        if (e.key === 'l' || e.key === 'L') {
            if (currentPlayingCard) {
                e.preventDefault();
                locateCurrentPlaying();
            }
        }
    });

    /* 初始启动扫描与动态监听 */
    function init() {
        scanAllPageMedia();
        setupDynamicObserver();
        setupUrlChangeListener();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 300);
    }

})();
