# Tampermonkey 网页自动汉化助手

无感翻译英文网站常用 UI 的 Tampermonkey 汉化脚本

[![Greasy Fork Installs](https://img.shields.io/greasyfork/dt/558446?label=%E6%80%BB%E5%AE%89%E8%A3%85%E9%87%8F)](https://greasyfork.org/zh-CN/scripts/558446-%E7%BD%91%E9%A1%B5%E8%87%AA%E5%8A%A8%E6%B1%89%E5%8C%96%E5%8A%A9%E6%89%8B) [![Greasy Fork Daily](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fgreasyfork.org%2Fscripts%2F558446.json&query=%24.daily_installs&label=%E6%97%A5%E5%AE%89%E8%A3%85%E9%87%8F&color=blue)](https://greasyfork.org/zh-CN/scripts/558446-%E7%BD%91%E9%A1%B5%E8%87%AA%E5%8A%A8%E6%B1%89%E5%8C%96%E5%8A%A9%E6%89%8B) [![Greasy Fork Version](https://img.shields.io/greasyfork/v/558446?label=%E7%89%88%E6%9C%AC)](https://greasyfork.org/zh-CN/scripts/558446-%E7%BD%91%E9%A1%B5%E8%87%AA%E5%8A%A8%E6%B1%89%E5%8C%96%E5%8A%A9%E6%89%8B) [![License](https://img.shields.io/github/license/tianxing-ovo/Tampermonkey?label=%E8%AE%B8%E5%8F%AF%E8%AF%81)](LICENSE)

## 项目结构

- `translate.user.js`：用户脚本主体
- `translations.json`：独立维护的翻译词典
- `translate-icon.png`：脚本图标

## 功能概览

### 核心翻译
- 支持普通文本及常用元素属性的多维度翻译
- 仅翻译按钮类表单值以避免误改用户输入数据
- 自动将英文相对时间文本汉化为中文格式
- 支持被数字或符号包裹的短语智能匹配

### 动态与高级渲染
- 动态监听 DOM 变化并实时适配主流框架页面
- 穿透 Shadow DOM 内部并翻译其封闭节点内容
- 智能识别交互组件与 Tooltip 提示框并破解 aria-hidden 盲目过滤
- 采用 FILTER_SKIP 深入遍历 Modal 弹窗及容器内部节点
- 智能补扫粘性头部以防止元素滚动后复原为英文

### 深度兼容与防误翻
- 自动跳过代码和路径等 GitHub 结构化内容
- 精准识别语法高亮并规避布局样式类误判
- 自动跳过编辑器和样式区域以降低误翻概率

## 性能设计

- 使用 Map 结构存储词典以降低高频查找成本
- 使用 TreeWalker 机制直接裁剪不可翻译子树
- 使用 MutationObserver 监听 DOM 树动态变更
- 使用 requestAnimationFrame 合并单帧内的多次更新
- 使用 Set 集合对同一批次待翻节点进行去重
- 利用延迟扫描兜底慢加载及局部导航漏翻

## 安装

### 在线安装

安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展后点击 [安装汉化脚本](https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/translate.user.js) 链接即可一键导入

### 本地调试

克隆仓库后将 `translate.user.js` 内容粘贴至新建的 Tampermonkey 脚本中保存运行即可进行本地调试

## 自定义翻译

通过 [translations.json](translations.json) 维护翻译词典


```json
{
  "mappings": {
    "English Text": "中文翻译",
    "Another Text": "另一个翻译"
  },
  "contextRules": [
    {
      "text": "save",
      "selector": "[class*=\"price\"]",
      "translation": "节省"
    }
  ]
}
```

### 维护规范

- 优先补充完整界面短语以规避高歧义单词翻译带来的排版或语义错误
- 保持字典内英文键按字母顺序排列以减少代码合并冲突及重复键值
- 修改本地词典后需重新安装脚本或更新版本号以清理缓存并生效

## 常见问题

**Q: 为什么有些英文文本没有被翻译？**

未收录在字典中的词汇以及脚本主动忽略的代码和编辑器区域均不处理翻译

**Q: 脚本会影响网页加载性能吗？**

脚本内置多重性能优化策略通常不会影响加载但遇到复杂网页建议配置排除规则

**Q: 为什么中文网站也会运行该脚本？**

脚本采用全站注入模式以保证最大兼容性若不需要可在管理面板中添加排除规则

## 贡献

欢迎在以下方向提交 Issue 或 Pull Request

- 补充或修正翻译词条
- 反馈或提交误翻案例
- 优化运行性能与防误翻逻辑
- 提升特定站点的兼容性

## 许可证

本项目基于 [Apache-2.0](LICENSE) 开源
