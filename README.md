# Tampermonkey 汉化脚本集合

## 项目介绍
这是一个基于 Tampermonkey 的用户脚本集合，主要功能是将多个英文 AI 平台和开发工具网站的界面翻译成中文，帮助中文用户更流畅地使用这些工具。

## 支持的网站
- Google AI Studio (`https://aistudio.google.com/*`)
- Yupp AI (`https://yupp.ai/*`)
- LM Arena (`https://lmarena.ai/*`)
- JetBrains Plugins 市场 (`https://plugins.jetbrains.com/*`)
- OpenRouter AI (`https://openrouter.ai/*`)

## 安装和使用方法
1. 首先安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击 Tampermonkey 扩展图标，选择 "添加新脚本"
3. 复制 [汉化脚本.js](汉化脚本.js) 文件中的全部代码，粘贴到编辑器中
4. 点击 "文件" -> "保存" 或使用快捷键 `Ctrl+S` 保存脚本
5. 打开支持的网站，脚本会自动运行并翻译界面

## 脚本功能和原理
1. **翻译映射表**：脚本内置了一个英文到中文的翻译映射表，包含了常见的界面元素文本
2. **DOM 遍历翻译**：使用 TreeWalker 高效遍历页面上的所有元素和文本节点
3. **动态内容处理**：通过 MutationObserver 监听 DOM 变化，对动态加载的内容也能进行翻译
4. **属性翻译**：不仅翻译可见文本，还会翻译 `aria-label`、`placeholder`、`title` 等属性

## 许可证
本项目采用 Apache-2.0 许可证 - 详见 [LICENSE](LICENSE) 文件

## 贡献指南
如果您发现翻译不准确或有其他改进建议，欢迎提交 issue 或直接修改代码。

## 更新日志
- v1.0: 初始版本，支持 5 个常用 AI 相关网站的基本界面汉化

## 注意事项
- 脚本在 `document-idle` 阶段运行，不会影响页面加载性能
- 部分动态生成的内容可能需要等待一小段时间才能完成翻译
- 如果某些文本没有被翻译，可能是因为它不在翻译映射表中