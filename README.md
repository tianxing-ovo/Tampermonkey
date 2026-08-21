# Tampermonkey 实用脚本集合

包含网页自动汉化助手与媒体嗅探器的高效实用油猴脚本仓库

## 脚本清单

### 网页自动汉化助手

- 脚本文件：`translate.user.js`
- 词典文件：`translations.json`
- 脚本图标：`translate-icon.png`
- 开发加载器：`translate.dev.js`
- 在线安装：[安装汉化脚本](https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/translate.user.js)

### 媒体嗅探器

- 脚本文件：`media-sniffer.user.js`
- 脚本图标：`media-sniffer-icon.png`
- 开发加载器：`media-sniffer.dev.js`
- 在线安装：[安装媒体嗅探器](https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/media-sniffer.user.js)

## 功能概览

### 网页自动汉化助手

- 支持普通文本及常用元素属性的多维度翻译
- 仅翻译按钮类表单值以避免误改用户输入数据
- 自动把英文相对时间文本汉化为中文格式
- 支持被数字或符号包裹的短语智能匹配
- 穿透 Shadow DOM 内部并翻译其封闭节点内容
- 智能识别交互组件与 Tooltip 提示框并深入遍历 Modal 弹窗
- 自动跳过代码和路径等结构化区域以降低误翻概率
- 使用 TreeWalker 遍历与 requestAnimationFrame 合并渲染

### 媒体嗅探器

- 自动嗅探页面中的各类图片与音频及视频资源
- 支持解析 img 标签与 CSS 背景图及 Canvas 图像
- 拦截 fetch 与 XHR 实时捕获音视频媒体网络流
- 深度扫描 API 响应载荷中潜藏的媒体地址
- 适配 AList 站点签名直链与无签名源链换取
- 支持嗅探 M3U8 流媒体并内置 Hls 引擎即时预览播放
- 支持并发切片拉取与 Web Crypto 原生 AES 自动解密合并下载
- 内置差异哈希与魔数检测实现智能去重和真实格式探测
- 提供自适应格式筛选栏并与悬浮雷达图标联动
- 音视频选项卡支持关键字实时搜索与一键清空
- 音视频列表内嵌原生播放器并在加载时显示转圈反馈
- 悬浮球支持全屏幕自由拖拽并持久保存位置坐标
- 在 SPA 页面路由切换后自动重新挂载悬浮球
- 画廊弹窗采用 Shadow DOM 隔离与现代化流式排版
- 模态展开时锁定背景页面滚动
- 支持多选与全选以及一键批量复制全部真实链接
- 内置纯原生轻量零依赖 ZIP 引擎实现秒级打包下载

## 本地开发

克隆仓库后在 Tampermonkey 扩展设置中开启文件访问权限然后新建脚本将对应 Dev 加载器的内容粘贴保存即可实现修改源文件后刷新浏览器立即生效

|       加载器文件       |      对应正式脚本       |
|:----------------------:|:-----------------------:|
| `media-sniffer.dev.js` | `media-sniffer.user.js` |
|   `translate.dev.js`   |   `translate.user.js`   |

## 贡献

欢迎在以下方向提交 Issue 或 Pull Request

- 补充或修正汉化词条与翻译规则
- 提交媒体嗅探的兼容性改进与新格式支持
- 优化运行性能与界面交互体验

## 许可证

本项目基于 [Apache-2.0](LICENSE) 开源
