# Tampermonkey 汉化脚本

## 📖 项目介绍
这是一个基于 Tampermonkey 的用户脚本，主要功能是将多个英文 AI 平台和开发工具网站的界面翻译成中文，帮助中文用户更流畅地使用这些工具。

## 🌐 支持的网站
- **Google AI Studio** - `https://aistudio.google.com/*`
- **Yupp AI** - `https://yupp.ai/*`
- **LM Arena** - `https://arena.ai/*`
- **JetBrains Plugins** - `https://plugins.jetbrains.com/*`
- **OpenRouter AI** - `https://openrouter.ai/*`
- **Stack Overflow** - `https://stackoverflow.com/*`
- **Hugging Face** - `https://huggingface.co/*`
- **GitHub** - `https://github.com/*`

## 🚀 安装方法

### 方式一：直接安装
1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击 [汉化脚本.js](汉化脚本.js) 文件
3. 复制全部代码
4. 点击 Tampermonkey 图标 → "添加新脚本"
5. 粘贴代码并保存（Ctrl+S）
6. 访问支持的网站即可看到中文界面

### 方式二：从文件安装
1. 下载 `汉化脚本.js` 文件
2. 打开 Tampermonkey 管理面板
3. 点击"实用工具"标签
4. 选择文件并导入

## ✨ 核心特性

### ⚡ 高性能加载
- **极速启动**：不等待 DOMContentLoaded，body 存在即开始翻译
- **高频操作批处理**：利用 `requestAnimationFrame` 把同一帧内产生的多次 DOM 改动合并处理
- **高效遍历**：使用 `TreeWalker API` 高效遍历 DOM 树
- **预编译优化**：正则表达式和选择器字符串提升为模块级常量，避免重复创建

### 🎯 无闪烁翻译
- 页面加载时先隐藏内容，翻译完成后再显示
- 避免用户看到英文到中文的切换过程
- 提供流畅的视觉体验

### 🧠 智能翻译机制
- **文本节点翻译**：自动识别并翻译页面上的所有文本内容
- **属性翻译**：翻译 `aria-label`、`placeholder`、`title`、`mattooltip` 等属性
- **属性变化监听**：实时监听属性变化，解决 Angular/React 等框架重新渲染后翻译丢失的问题
- **动态内容支持**：使用 MutationObserver 监听 DOM 变化，实时翻译新加载的内容
- **高效遍历**：使用 TreeWalker API 高效遍历 DOM 树
- **增量更新**：只翻译新增节点，避免重复处理
- **智能跳过**：自动跳过 `aria-hidden="true"` 的隐藏元素，避免无效翻译

### 🔧 技术实现
```javascript
// 1. 页面加载前注入 CSS 阻止闪烁
style.textContent = `html.translating { visibility: hidden !important; }`;
document.documentElement.appendChild(style);

// 2. 预编译选择器字符串和正则表达式(避免每次函数调用重建)
const codeSelectorsStr = ['pre', 'code', '.blob-code' /* ... */].join(', ');
const timeRegex = /^(\d+)\s+(year|month|week|day|hour|minute|second)s?\s+ago$/i;

// 3. TreeWalker 高效遍历 DOM 树
const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);

// 4. MutationObserver + requestAnimationFrame 异步批处理
const observer = new MutationObserver(mutations => {
    pendingMutations.push(...mutations);
    if (!rafScheduled) {
        rafScheduled = true;
        requestAnimationFrame(processPendingMutations);
    }
});
```

## 📝 翻译词条

脚本内置了 **700+** 常用界面术语的翻译，包括：
- AI 模型相关：Model（模型）、Chat（聊天）、Prompt（提示）
- 竞技场相关：Arena（竞技场）、Rank（排名）、Votes（投票）
- 设置选项：Settings（设置）、Temperature（温度）、Token count（令牌计数）
- 操作按钮：Run（运行）、Save（保存）、Share（分享）
- 更多...

## 🔧 自定义翻译
如需添加新的翻译词条，编辑脚本中的 `translations` 对象：

```javascript
const translations = {
    "English Text": "中文翻译",
    "Another Text": "另一个翻译",
    // 添加你的翻译...
};
```

## 📊 版本信息

- **当前版本**：1.3
- **运行时机**：document-start（页面开始加载时）
- **权限要求**：none（无需特殊权限）
- **许可证**：Apache-2.0

## 🐛 常见问题

**Q: 为什么有些文本没有被翻译？**  
A: 可能是该文本不在翻译映射表中，你可以手动添加到 `translations` 对象。

**Q: 页面加载时会闪一下吗？**  
A: 不会。脚本使用了防闪烁机制，页面会在翻译完成后才显示。

**Q: 会影响页面加载速度吗？**  
A: 基本不会。脚本利用 `TreeWalker API` 在底层高效遍历，并通过 `requestAnimationFrame` 将动态渲染时的海量 DOM
修改进行批处理与去重合并。核心代码预编译了正则，采用了纯净的字典极致查询，大大减轻了重绘压力。

**Q: 翻译需要多久完成？**  
A: 通常都是毫秒级无缝完成。

**Q: 支持其他网站吗？**  
A: 可以。在脚本头部的 `@match` 部分添加新的网站 URL 即可。

## ⚙️ 性能优化

脚本采用了多项性能优化技术：

1. **提前执行**：不等待 DOMContentLoaded，只要 body 存在就开始翻译
2. **批处理节流**：使用 `requestAnimationFrame` 将 `MutationObserver` 高频触发的 DOM 更新合并到一帧中集中处理
3. **预编译常量**：正则表达式、选择器字符串等提升为模块级常量，避免在高频函数中重复创建
4. **高效遍历**：使用 TreeWalker API 而非递归，性能更优
5. **智能跳过**：自动跳过代码块、编辑器、语法高亮等区域，避免无效翻译
6. **SPA 支持**：延迟翻译机制确保 React/Vue 等框架动态渲染的内容也能被翻译

## 🤝 贡献指南
欢迎提交 Issue 和 Pull Request！

- 发现翻译错误或不准确
- 建议添加新的网站支持
- 优化代码性能
- 添加新的翻译词条

## 📄 许可证

本项目采用 [Apache-2.0](LICENSE) 许可证开源

## 📮 联系方式
如有问题或建议，欢迎通过 Issue 反馈