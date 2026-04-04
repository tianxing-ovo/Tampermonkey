# Tampermonkey 汉化脚本

## 📖 项目介绍

这是一个基于 Tampermonkey 的用户脚本，主要功能是将网页中的英文界面文案翻译成中文，帮助中文用户更流畅地浏览和使用各类英文网站

当前仓库包含：

- `汉化脚本.js`：用户脚本主体，负责页面监听、文本匹配与 DOM 翻译
- `translations.json`：独立维护的翻译词典，当前已包含 **1000+** 条界面文案
- `translate-icon.png`：脚本图标资源

项目主体逻辑位于 `汉化脚本.js`，翻译词典位于 `translations.json`，并通过 `@resource` 机制在脚本初始化时加载

## 🌐 支持范围

脚本当前默认匹配所有常见网页：

- `*://*/*`

也就是说，理论上绝大多数 `http` / `https` 网站都会注入脚本并尝试翻译页面中的英文界面文案

### 推荐使用方式

- 英文网站：默认直接使用即可
- 中文网站或不希望翻译的网站：在 Tampermonkey 中自行添加排除规则
- 如果你经常访问大量中文网站：建议优先排除常用中文域名，减少不必要的扫描和监听
- 结构复杂的网站：如有误翻，可按域名精细排除

当前版本默认全站注入，尚未内置“检测到中文页后立即退出”的自动跳过逻辑

### 当前已重点适配的网站类型

虽然脚本已改为默认全站可用，但目前仍针对以下站点或场景做了专门兼容：

- **GitHub**：额外跳过 README、路径面包屑、文件名、搜索构建器、提交信息等结构化内容
- **通用前端应用**：支持 React / Vue / Angular 等动态渲染页面
- **Shadow DOM 页面**：支持组件内部内容翻译与监听

## 🚀 安装方法

### 方式一：推荐的一键安装
1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 打开脚本直链：  
   [安装汉化脚本](https://raw.githubusercontent.com/tianxing-ovo/Tampermonkey/master/%E6%B1%89%E5%8C%96%E8%84%9A%E6%9C%AC.js)
3. 在 Tampermonkey 弹出的安装页面中确认安装
4. 打开英文网站即可看到中文界面；若某些中文网站不希望生效，可在 Tampermonkey 中自行排除

### 方式二：从文件安装
1. 下载 `汉化脚本.js` 文件
2. 打开 Tampermonkey 管理面板
3. 点击"实用工具"标签
4. 选择文件并导入

### 方式三：手动开发/调试

1. 克隆或下载当前仓库
2. 在 Tampermonkey 中新建脚本并粘贴 `汉化脚本.js` 内容
3. 若只调试脚本逻辑，可直接保存脚本并刷新目标页面
4. 若要联调 `translations.json`，需要同时修改脚本头部的 `@resource translations ...` 地址，使其指向你自己的可访问 JSON
   资源，再重新安装或更新脚本

## ✨ 核心特性

### ⚡ 高性能加载
- **极速启动**：不等待 DOMContentLoaded，body 存在即开始翻译
- **高频操作批处理**：利用 `requestAnimationFrame` 把同一帧内产生的多次 DOM 改动合并处理
- **Set 去重**：同一帧内相同节点的重复变更只处理一次，避免高频渲染风暴
- **高效遍历**：使用 `TreeWalker API` 配合 `NodeFilter` 直接裁剪整个不可翻译子树
- **预编译优化**：正则表达式、选择器字符串、属性名数组、标签集合等全部提升为模块级常量
- **高性能数据结构**：翻译字典使用 `Map`（O(1) 哈希查找），统计关键词使用 `Set`（O(1) 成员检测）
- **常量提升**：域名判断 `isGitHub` 等运行时不变量只计算一次，避免高频字符串匹配
- **局部导航回补**：监听页面生命周期以及 GitHub 的 Turbo/PJAX 事件，减少单页导航后的漏翻

### 🧠 智能翻译机制
- **文本节点翻译**：自动识别并翻译页面上的所有文本内容
- **属性翻译**：翻译 `aria-label`、`placeholder`、`title`、`mattooltip` 等属性，并仅对按钮类 `input` 翻译 `value`
- **属性变化监听**：实时监听属性变化，解决 Angular/React 等框架重新渲染后翻译丢失的问题
- **动态内容支持**：使用 MutationObserver 监听 DOM 变化，实时翻译新加载的内容，并补偿慢加载内容
- **规范化查词**：查词前统一大小写、压缩空白并移除零宽字符，提升命中率
- **模式翻译**：除静态词典外，额外支持相对时间和统计信息等文本模式
- **变更值校验**：翻译前对比新旧值，仅在内容实际变化时才修改 DOM，防止与框架产生无限循环
- **增量更新**：只翻译新增节点，避免重复处理
- **Shadow DOM 支持**：自动处理组件内部的 Shadow Root，并为其建立独立监听
- **智能跳过**：自动跳过代码块、编辑器、语法高亮区域、`script`/`style`/`noscript`/`textarea`；GitHub 场景还会额外跳过
  README/Markdown 正文、路径面包屑、文件名、搜索构建器与提交信息等结构化内容

### 🔧 技术实现
```javascript
// 1. 高性能数据结构(Map 哈希查找 + Set 成员检测)
const lowerCaseTranslations = new Map();
const statKeys = new Set(['follower', 'following', 'stars', 'watching', 'forks']);
const skipTags = new Set(['textarea', 'script', 'style', 'noscript']);

// 2. 预编译选择器字符串和正则表达式(避免每次函数调用重建)
const codeSelectorsStr = ['pre', 'code', '.blob-code' /* ... */].join(', ');
const timeRegex = /^(\d+)\s+(year|month|week|day|hour|minute|second)s?\s+ago$/i;
const plClassRegex = /(?:^|\s)pl-[a-z]/;
const zeroWidthRegex = /[\u200B-\u200D\uFEFF]/g;
const whitespaceRegex = /\s+/g;

// 3. 规范化查词(统一空白/大小写/零宽字符)
function normalizeLookupText(text) {
    return text.replace(zeroWidthRegex, '').replace(whitespaceRegex, ' ').trim().toLowerCase();
}

// 4. TreeWalker + NodeFilter 高效遍历(直接裁剪不可翻译子树)
const filter = function (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
        if (skipTags.has(node.tagName.toLowerCase())) {
            return NodeFilter.FILTER_REJECT; // 跳过整个子树
        }
    }
    return NodeFilter.FILTER_ACCEPT;
};
const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, filter);

// 5. MutationObserver + requestAnimationFrame + Set 去重批处理
const observer = new MutationObserver(mutations => {
    pendingMutations.push(...mutations);
    if (!rafScheduled) {
        rafScheduled = true;
        requestAnimationFrame(processPendingMutations);
    }
});
// processPendingMutations 内部使用 Set 确保同一节点每帧只处理一次
```

## 📝 翻译词条

当前词典已包含 **1000+** 常用界面短语与术语翻译，包括：
- AI 模型相关：Model（模型）、Chat（聊天）、Prompt（提示）
- 竞技场相关：Arena（竞技场）、Rank（排名）、Votes（投票）
- 设置选项：Settings（设置）、Temperature（温度）、Token count（令牌计数）
- 操作按钮：Run（运行）、Save（保存）、Share（分享）
- 更多

## 🔧 自定义翻译

翻译映射表已被提取到独立的 `translations.json` 文件中，并通过 `@resource` 机制进行加载
如需添加或修改翻译词条，可以在 [translations.json](translations.json) 文件中进行编辑：

```json
{
    "English Text": "中文翻译",
    "Another Text": "另一个翻译"
}
```

维护词典时建议优先补充完整界面短语，并保持英文键按字母顺序排序，减少误翻和无意义 diff

`translations.json` 会随脚本版本一起通过 `@resource` 分发。也就是说：

- 在线安装用户会在 Tampermonkey 检查并更新脚本版本时同步拿到最新词典
- 本地手动导入用户在修改词典后，需要重新导入或更新脚本才能看到最新效果

## 📊 版本信息

- **当前版本**：1.7
- **运行时机**：document-start（页面开始加载时）
- **权限要求**：GM_getResourceText（读取外部资源）
- **许可证**：Apache-2.0

## 🐛 常见问题

**Q: 为什么有些文本没有被翻译？**  
A: 可能是该文本不在翻译映射表中，或者该区域属于脚本刻意保护的结构化内容（如代码块、编辑器、GitHub
README、路径面包屑、文件名等）；前者可以通过编辑 `translations.json` 补充，后者通常不建议直接翻译

**Q: 页面加载时会闪一下吗？**  
A: 几乎不会，得益于 TreeWalker 子树裁剪和 Map 哈希查找等深度优化，翻译在毫秒级内完成，无需隐藏页面即可实现无感切换

**Q: 会影响页面加载速度吗？**  
A: 基本不会，脚本利用 `TreeWalker API` 在底层高效遍历，并通过 `requestAnimationFrame` 将动态渲染时的海量 DOM
修改进行批处理与去重合并；核心代码预编译了正则，采用了纯净的字典极致查询，大大减轻了重绘压力

**Q: 翻译需要多久完成？**  
A: 通常都是毫秒级无缝完成

**Q: 现在支持哪些网站？**  
A: 当前脚本默认匹配 `*://*/*`，会在绝大多数网页上生效，不再需要手动维护站点白名单

**Q: 中文网站也会被匹配，怎么办？**  
A: 可以直接在 Tampermonkey 中为不希望翻译的域名添加排除规则，推荐把常用中文站、后台系统、支付页面、邮箱等站点加入排除列表

**Q: 中文网站加载这个脚本，会影响性能吗？**  
A: 会有一定额外开销，因为脚本当前会在所有匹配页面执行词典加载、DOM 遍历和变更监听；普通中文站通常影响较小，但对超大页面、复杂
SPA、后台系统或频繁更新的应用页面，仍建议尽早加入排除列表

## ⚙️ 性能优化

脚本采用了多项性能优化技术：

1. **提前执行**：不等待 DOMContentLoaded，只要 body 存在就开始翻译
2. **批处理节流**：使用 `requestAnimationFrame` 将 `MutationObserver` 高频触发的 DOM 更新合并到一帧中集中处理
3. **Set 去重**：`processPendingMutations` 内使用 `Set` 确保同一节点在每帧内只处理一次，消除高频交互时的重复翻译
4. **预编译常量**：正则表达式、选择器字符串、属性名数组、标签跳过集合等全部提升为模块级常量，避免高频函数中反复创建临时对象
5. **高性能数据结构**：翻译字典使用 `Map`（O(1) 哈希查找），统计关键词和跳过标签使用 `Set`（O(1) 成员检测）
6. **TreeWalker + NodeFilter 子树裁剪**：使用 `FILTER_REJECT` 直接跳过 `script`/`style`/代码块等整个子树，避免遍历成千上万个无用节点
7. **常量提升**：域名判断（`isGitHub`）等运行时不变量只计算一次，避免逐节点重复字符串匹配
8. **智能跳过**：自动跳过代码块、编辑器、语法高亮等区域，GitHub 场景下使用 `closest` 预过滤 + 正则精确匹配的两级策略
9. **变更值校验**：DOM 写入前对比新旧值，仅在实际变化时才触发修改，防止与框架的无限循环冲突
10. **SPA / Shadow DOM 支持**：延迟翻译与 Shadow Root 监听机制确保 React/Vue 等框架动态渲染内容也能被翻译

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request

- 发现翻译错误或不准确
- 建议添加新的网站支持
- 优化代码性能
- 补充翻译词条

## 📄 许可证

本项目采用 [Apache-2.0](LICENSE) 许可证开源

## 📮 联系方式
如有问题或建议，欢迎通过 Issue 反馈
