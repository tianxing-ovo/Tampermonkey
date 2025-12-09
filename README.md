# Tampermonkey 汉化脚本

## 📖 项目介绍
这是一个基于 Tampermonkey 的用户脚本，主要功能是将多个英文 AI 平台和开发工具网站的界面翻译成中文，帮助中文用户更流畅地使用这些工具。

## 🌐 支持的网站
- **Google AI Studio** - `https://aistudio.google.com/*`
- **Yupp AI** - `https://yupp.ai/*`
- **LM Arena** - `https://lmarena.ai/*`
- **JetBrains Plugins** - `https://plugins.jetbrains.com/*`
- **OpenRouter AI** - `https://openrouter.ai/*`
- **Stack Overflow** - `https://stackoverflow.com/*`
- **Hugging Face** - `https://huggingface.co/*`

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
- **非阻塞渲染**：使用 `requestIdleCallback` 在浏览器空闲时翻译
- **快速显示**：页面加载速度不受影响，用户体验流畅
- **智能调度**：100ms 超时保证翻译及时完成

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
// 1. 页面加载时立即隐藏内容（防闪烁）
document.documentElement.classList.add('translating');

// 2. body 存在即开始（不等待 DOMContentLoaded）
if (document.body) {
    initTranslation();
}

// 3. 使用 requestIdleCallback 非阻塞翻译
requestIdleCallback(() => {
    walkAndTranslate(document.body);
    document.documentElement.classList.remove('translating');
}, { timeout: 100 });

// 4. 立即监听 DOM 变化（不等翻译完成）
observer.observe(document.body, {...});

// 5. 延迟翻译（处理 SPA 框架动态渲染的内容）
setTimeout(() => walkAndTranslate(document.body), 300);
setTimeout(() => walkAndTranslate(document.body), 1000);
```

## 📝 翻译词条
脚本内置了 **350+** 常用界面术语的翻译，包括：
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
- **当前版本**：v1.1
- **运行时机**：document-start（页面开始加载时）
- **权限要求**：none（无需特殊权限）
- **许可证**：Apache-2.0

## 🐛 常见问题

**Q: 为什么有些文本没有被翻译？**  
A: 可能是该文本不在翻译映射表中，你可以手动添加到 `translations` 对象。

**Q: 页面加载时会闪一下吗？**  
A: 不会。脚本使用了防闪烁机制，页面会在翻译完成后才显示。

**Q: 会影响页面加载速度吗？**  
A: 不会。脚本使用了 `requestIdleCallback` 在浏览器空闲时执行翻译，不会阻塞页面渲染和交互，加载速度几乎不受影响。

**Q: 翻译需要多久完成？**  
A: 通常在 100ms 内完成，用户几乎感觉不到延迟。

**Q: 支持其他网站吗？**  
A: 可以。在脚本头部的 `@match` 部分添加新的网站 URL 即可。

## ⚙️ 性能优化

脚本采用了多项性能优化技术：

1. **提前执行**：不等待 DOMContentLoaded，只要 body 存在就开始翻译
2. **空闲调度**：使用 `requestIdleCallback` 在浏览器空闲时执行，不阻塞主线程
3. **增量翻译**：MutationObserver 只处理新增节点，避免重复遍历
4. **高效遍历**：使用 TreeWalker API 而非递归，性能更优
5. **并行监听**：翻译和 DOM 监听同时进行，不漏掉动态内容
6. **SPA 支持**：延迟翻译机制确保 React/Vue 等框架动态渲染的内容也能被翻译

## 🤝 贡献指南
欢迎提交 Issue 和 Pull Request！

- 发现翻译错误或不准确
- 建议添加新的网站支持
- 优化代码性能
- 添加新的翻译词条

## 📄 许可证
本项目采用 Apache-2.0 许可证开源

## 📮 联系方式
如有问题或建议，欢迎通过 Issue 反馈