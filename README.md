# Tampermonkey 网页自动汉化助手

面向英文网站的 Tampermonkey 汉化脚本，在动态渲染中自动翻译常用 UI 且不影响交互体验。

## 项目结构

- `translate.user.js`：用户脚本主体
- `translations.json`：独立维护的翻译词典
- `translate-icon.png`：脚本图标

## 当前版本

- 版本：`1.9.7`
- 匹配范围：`*://*/*`
- 运行时机：`document-start`
- 权限：`GM_getResourceText`
- 许可证：`Apache-2.0`

## 功能概览

- 翻译普通文本节点
- 翻译常见属性：`aria-label`、`placeholder`、`title`、`mattooltip`
- 仅对按钮类 `input` 翻译 `value`，避免误改表单数据
- 支持相对时间文本，例如 `2 months ago -> 2 个月前`
- 支持带前后符号的短语匹配，例如数字、空白、标点包裹的按钮文案
- 监听 DOM 变化，适配 React、Vue、Angular 等动态页面
- 支持 Shadow DOM 内部内容翻译
- 对 GitHub 做了额外兼容，跳过 README、代码区、文件名、路径面包屑、搜索构建器、提交信息等结构化内容
- 识别 GitHub 语法高亮 `pl-*` 类并跳过对应内容，同时避开 `pl-sm-*`、`pl-md-*` 等布局类误判
- 自动跳过代码块、编辑器、脚本样式节点、图标字体区域，降低误翻概率

## 性能设计

- 使用 `Map` 存储词典，降低高频查找成本
- 使用 `TreeWalker + NodeFilter` 直接裁剪不可翻译子树
- 使用 `MutationObserver` 监听变更
- 使用 `requestAnimationFrame` 合并一帧内的多次更新
- 使用 `Set` 对同一批次节点去重
- 通过延迟补扫兜底慢加载内容和局部导航后的漏翻

## 安装

### 方式一：一键安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展。
2. 打开脚本直链：
   [安装汉化脚本](https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/translate.user.js)
3. 在 Tampermonkey 弹窗中确认安装。

### 方式二：从本地文件导入

1. 下载 `translate.user.js`。
2. 打开 Tampermonkey 管理面板。
3. 通过“实用工具”导入脚本文件。

### 方式三：本地调试

1. 克隆当前仓库。
2. 在 Tampermonkey 中新建脚本并粘贴 `translate.user.js` 内容。
3. 如果只调试脚本逻辑，保存后直接刷新目标页面即可。
4. 如果要联调 `translations.json`，需要把脚本头部的 `@resource translations ...` 改成你自己的可访问 JSON 地址，然后重新安装或更新脚本。

## 使用建议

- 脚本默认对所有 `http/https` 页面生效。
- 对中文站点、后台系统、支付页、邮箱等不希望翻译的网站，建议在 Tampermonkey 中添加排除规则。
- GitHub、通用 SPA、带 Shadow DOM 的前端页面是当前重点兼容场景。

## 自定义翻译

翻译词典维护在 [translations.json](translations.json)。

格式示例：

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

维护建议：

- 优先补充完整界面短语，不要只翻单个高歧义单词
- 尽量保持英文键按字母顺序排列，减少无意义 diff
- 修改本地词典后，需要重新安装脚本或更新 `@resource` 指向的资源才能生效

## 1.9.7 更新内容

- **修复剥离查词时的上下文匹配失效问题**：重构了 `translateStripped` 函数，使其能正确透传 DOM 元素上下文参数。解决了类似 `50% off` / `75% off` 这种带有数值和百分比前缀的词汇在剥离符号查词时直接绕过 `contextRules` 匹配、错误地翻译为全局 `关闭` 的问题。
- **优化优惠场景汉化规则**：在 `contextRules` 中引入了基于 `td .text-success` 和 `[role="cell"] .text-success` 的复合限定选择器，使得价格表格/卡片数据中的 `off` 能够被精准汉化为“优惠”，同时避免对常规全局开关中“关闭”选项的误伤。
- **词典扩展与字母排序维护**：新增 OpenRouter 模型列表中常见的 `"Weekly Tokens"` 翻译并译为 `"周令牌数"`，且保持字典的 case-insensitive 字母排序规则。

## 1.9.6 更新内容

- **修复 `<textarea>` 属性无法翻译的问题**：优化了 `TreeWalker` 的节点过滤逻辑，使 `textarea` 标签本身能被正常访问以汉化其属性（如 `placeholder` 等），同时仍能完全隔离和拒绝对其内部子节点（如用户输入内容、默认文本等）的汉化，确保输入数据不被污染。
- **扩展汉化词典**：补充了 “Create new issue”、“Add a description”、“No one assigned”、“Create more” 以及 “Add a title” 等常用 UI 翻译映射。

## 1.9.5 更新内容

- **代码结构整合与精简**：合并并统一屏蔽规则与节点过滤逻辑，整合 `codeSelectors` 和 `githubSkipSelectors`，优化 `TreeWalker` 树过滤器，消除冗余的 DOM 遍历与匹配开销。
- **过滤规则精细化**：精细化 GitHub 域名判定边界（`isGitHub`），更精准地识别代码高亮类 `pl-*`，避免对普通响应式布局类的干扰；统一屏蔽标签为 `skipTags`。
- **性能与消抖优化**：在 DOM 监听中移除子节点变动时多余的全量扫描，改为精准增量翻译；将首屏加载时的多次定时器扫描合并为单次 `scheduleFullPass(1500)` 延迟扫描，显著降低复杂页面初期的 CPU 占用。
- **代码现代化重构**：使用 `Object.entries().map` 更优雅地构建词典查找 Map；精炼并合并 `MutationObserver` 注册与注销等逻辑，提升代码可读性与执行效率。

## 常见问题

**为什么有些文本没有被翻译？**

可能原因有两类：

- 该文本还不在词典中
- 该区域被脚本主动跳过，例如代码块、编辑器、GitHub README、文件名、路径面包屑等结构化内容

前者可以直接补充 `translations.json`，后者通常不建议强行翻译。

**会明显影响页面性能吗？**

通常不会。脚本做了子树裁剪、批处理、去重和延迟补扫；但如果你长期访问大型中文站或复杂后台页面，仍建议配置排除规则。

**支持哪些网站？**

当前为全站注入模式，即 `*://*/*`。只要页面里存在可匹配的英文 UI 文案，脚本就会尝试翻译。

**为什么中文网站也会执行脚本？**

因为当前版本没有按站点白名单运行，而是默认全站注入。对不需要翻译的站点，直接在 Tampermonkey 中添加排除规则即可。

## 贡献

欢迎提交 Issue 或 Pull Request，尤其是以下方向：

- 补充或修正翻译词条
- 提交误翻案例
- 改进性能或误翻过滤逻辑
- 增强对特定站点的兼容性

## 许可证

本项目基于 [Apache-2.0](LICENSE) 开源。
