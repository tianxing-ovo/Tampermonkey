# Tampermonkey 实用脚本集合

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

### 语雀文档助手

- 脚本文件：`yuque-plus.user.js`
- 脚本图标：`yuque-plus-icon.png`
- 开发加载器：`yuque-plus.dev.js`
- 在线安装：[安装语雀文档助手](https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/yuque-plus.user.js)

## 功能概览

### 网页自动汉化助手

- 自动把网页英文界面文本与表单按钮常用属性翻译为中文
- 支持通过上下文规则消除多义词歧义并动态查词
- 自动把英文相对时间转换为规范中文时间格式
- 支持剥离符号与数字后的短语智能匹配翻译
- 穿透 Shadow DOM 内部并实时监听封闭节点变化
- 自动跳过代码块与输入框及路径区域以保护原始内容
- 专门适配 GitHub 平台的 Turbo 与 PJAX 局部跳转

### 媒体嗅探器

- 自动拦截网络请求并深度嗅探页面图片音频视频及 M3U8 流媒体
- 支持 AList 网盘目录深度递归抓取与无签名源链换取
- 内置画廊弹窗并集成 Hls 和 mpegts 播放引擎实现即时预览
- 提供全局悬浮播放条并支持顺序循环随机切歌与卡片快速定位
- 支持按格式筛选与关键字搜索以及多维度排序并记忆偏好
- 支持多选全选与一键批量复制全部真实媒体链接到剪贴板
- 内置轻量零依赖 ZIP 引擎支持将选中资源一键打包下载
- 支持 M3U8 流媒体多线程并发分片拉取与 AES 自动解密合并
- 悬浮雷达图标与滚动导航胶囊支持全屏幕自由拖拽并持久保存坐标

### 语雀文档助手

- 进入语雀文档阅读页自动触发大纲目录全部折叠
- 监听单页应用路由跳转并在文档切换后自动重新执行折叠

## 本地开发

克隆仓库后在 Tampermonkey 扩展设置中开启文件访问权限然后新建脚本将对应 Dev 加载器的内容粘贴保存即可实现修改源文件后刷新浏览器立即生效

|        加载器文件        |       对应正式脚本       |
| :----------------------: | :-----------------------: |
| `media-sniffer.dev.js` | `media-sniffer.user.js` |
|   `translate.dev.js`   |   `translate.user.js`   |
|  `yuque-plus.dev.js`  |  `yuque-plus.user.js`  |

## 贡献

欢迎在以下方向提交 Issue 或 Pull Request

- 补充或修正汉化词条与翻译规则
- 提交媒体嗅探的兼容性改进与新格式支持
- 优化运行性能与界面交互体验

## 许可证

本项目基于 [Apache-2.0](LICENSE) 开源
