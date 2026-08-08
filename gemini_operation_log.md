# Gemini 操作记录 (交接给 Trae)

此文档用于记录 Gemini 在本项目（Casting UI）中的操作日志。由于本项目主要由 Trae 负责开发，Gemini 的开发过程严格遵循 Trae 建立的规范（详见 `.trae/rules/`），并将所有操作记录在此，以便在 Trae 接手时能够无缝同步工作进度。

## 遵循的开发规范摘要
1. **核心理念**：极简配置，使用原生 HTML 结构 + `data-*` 属性。
2. **样式规范**：所有框架相关的类名必须以 `CUI-` 开头，不使用内嵌 `<style>` 编写自定义样式，避免覆盖框架 CSS 变量。
3. **JS 规范**：使用原生 ES6 模块化；全部在 `window.CUI` 命名空间下进行操作，不污染全局 `window`；使用 `CastingDOMObserver` 和事件委托进行事件绑定，禁止内联事件（如 `onclick`）。
4. **外观与内容分离原则**：外观由 CSS 控制，JavaScript 只设置内容，不操作 `style.display`。
5. **Git 规范**：提交信息格式为 `[type]: [module] - [description]`；代码与文档需同步更新；版本号需统一。
6. **文件结构**：模块位于 `src/modules/`，手册页位于 `public/manual/`，发布产物位于 `dist/`。
7. **AI 协作与日志同步（重要）**：所有的开发操作必须实时更新并记录在本文件（`gemini_operation_log.md`）中，**且全项目仅保留这一个交接日志文件**。任何 AI（包括 Gemini 和 Trae）接手时需优先阅读此文件。
---

## 历史操作日志

### [2026-08-08]
- **操作人**: Trae
- **操作内容**:
  1. **重构Table功能演示页面（demo.html）**：
     - 将测试页面重构为单表格 + 动态控制面板的完整功能演示页面
     - 控制面板分为4列：冻结设置、提示列字段选择、显示设置、分页设置
     - 所有功能通过控制面板动态切换：冻结（表头/表尾/首列/尾列/高级提示列）、斑马纹、可编辑、多级表头、汇总、自动行高、分页
     - 使用外部数据源 `/测试用数据/仿真测试数据（JSON格式）.json`，采用 `data-CUI-dataTable="true"` + `data-CUI-config` 驱动
     - 包含完整功能：工具栏搜索、筛选面板、CSV导出、排序、分页器、数据掩码、汇总行
     - 预览地址：http://localhost:5175/test/table/demo.html（Vite dev server, root=./src）
  2. **修改文件范围**：
     - `src/test/table/demo.html` — 完全重写

  3. **修复表格掩码显示失效问题（手机号/身份证号不可见）**：
     - **根因**：前期 data 属性统一为 `data-CUI-*` 前缀时，JS 中 `td.setAttribute('data-CUI-masked', maskText)` 已更新，但 CSS 中 `content: attr(data-masked)` 遗漏未同步更新，导致 `::before` 伪元素读取不到掩码值，掩码内容为空；而原始文字又设为 `color: transparent`，最终手机号和身份证号完全不可见。
     - **修复 1**：`table.css` 第 682 行 `attr(data-masked)` → `attr(data-CUI-masked)`，使 CSS 伪元素正确读取 JS 设置的掩码属性。
     - **修复 2**：`table.js` `_renderBody` 方法中，左右提示列（hint column）渲染时直接使用原始值 `row[field]`，未对掩码类型字段（phone/idcard/id/password）应用脱敏。新增 `fieldTypeMap` 字段类型映射，提示列文本生成时对掩码类型字段调用 `_getCellMask()` 应用脱敏，符合"提示列中掩码字段保持掩码显示"的设计约定。
  2. **修改文件范围**：
     - `src/modules/css/table.css` — 修复 `::before` 的 `attr()` 属性名
     - `src/modules/js/table.js` — 提示列渲染增加掩码处理逻辑
- **状态**: 已修复并验证。500 个手机号单元格和 200 个身份证号单元格掩码均正确显示（如 `132****3389`、`210802********1815`），悬停显示原始值交互正常。

### [2026-08-08]
- **操作人**: Trae
- **操作内容**:
  1. **表格渲染加载中间件**：
     - **目标**：所有渲染操作通过中间件，渲染期间表格容器被遮罩覆盖，防止用户多次操作导致卡顿或数据错乱，提供"正在工作"的视觉反馈。
     - **实现**：
       - CSS：新增 `.CUI-table-loading-overlay` 类（absolute定位覆盖容器、半透明背景、居中CUI-loading-lg旋转动画、backdrop-filter模糊）。
       - `_showLoadingOverlay()`：创建/复用遮罩元素，设置 wrapper 的 `position: relative`，插入到表格容器之前。
       - `_hideLoadingOverlay()`：隐藏遮罩（display: none）。
       - `_scheduleUpdate()` 改造：先显示遮罩，再启动防抖定时器，渲染完成后 `finally` 中隐藏遮罩。50ms 防抖间隔确保浏览器有足够时间渲染遮罩画面。
       - 初始渲染（`_initializeSuccess`）：通过 `requestAnimationFrame` 拆分，同步显示遮罩 → 下一帧渲染→隐藏，保证初始加载时遮罩可见。
     - **效果**：用户每操作一次，表格容器被遮罩覆盖，渲染完成后遮罩消失，形成"操作→等待→完成"的闭环体验。
     - **修改文件**：`src/modules/css/table.css` 新增遮罩类，`src/modules/js/table.js` 新增 2 个方法 + 改造 2 处入口
  2. **排序前后台彻底分离重构**：
     - **问题**：排序箭头闪烁后消失。根因是 `_bindSortEvents` 手动操作 DOM 添加 class（箭头闪一下），随后 `render()` 运行又清除所有 class（箭头消失）。
     - **重构**：
       - `_bindSortEvents`：**移除所有手动 DOM 操作**（classList.remove/add），只调用 `dataLayer.sort()`/`unsort()` 修改 registry 状态。
       - `render()`：不再简单清除 class。改为**读取 registry 中的 `sortRules`**，根据规则自动为对应 th 添加 `CUI-sort-asc`/`CUI-sort-desc`，同时状态栏排序标签由 `_updatePagination` 自动同步。
     - **效果**：前后台彻底分离。事件只改状态，渲染只读状态。表头箭头和状态栏标签同时更新，全程无闪烁。
     - **修改文件**：`src/modules/js/table.js` — `_bindSortEvents` 精简 + `render()` 末尾增加规则驱动渲染逻辑
- **验证**: 手动测试通过。三态循环（升序→降序→取消）和 badge × 取消排序均正常工作，箭头稳定显示，状态栏标签同步更新。
- **状态**: 已修复。

### [2026-06-09]
- **操作人**: Trae
- **操作内容**:
  1. **身份证高级验证器逐位解析显示功能**：
     - 修改 `_setupDefaultMessages(wrapper)` 方法，检查用户是否设置了 `data-info` 属性
     - 关键词清洗规则：忽略大小写、忽略 -_ 连接符、忽略其他符号，清洗后为 "idinfo" 才启用
     - 如果后面还有别的词汇，则属于用户自定义内容，不做处理
     - 逐位解析显示：从输入满2位开始显示省份信息，逐步显示省市、生日、性别等

  2. **修复逐位解析功能失效问题**：
     - 在 input.js 中添加 `data-info` 属性传递到新的 input 元素
     - 确保 `_setupDefaultMessages` 能正确获取 `data-info` 属性

  3. **修改初始提示词**：
     - 将初始提示词改为"请输入身份证号码"
     - 更新 `_setupDefaultMessages` 和 `updateMessageDisplay` 方法中的提示文本

  4. **修复 blur 事件清空 info 内容的问题**：
     - 当值为空时，只有启用逐位解析才恢复初始提示词
     - 其他情况不动 info 内容（保护用户自定义内容）
     - Error 内容不清除，只通过 CSS 类控制显示/隐藏

  5. **设计原则确认**：
     - Error 内容：通过状态控制显示/隐藏，内容不动（除非必要）
     - Info 内容：只有启用逐位解析时才动态调整，其他情况不动
     - 保持 input.js 基础模块不变，所有 info 元素的创建和更新由 idcard-validator.js 负责

- **状态**: 身份证高级验证模块已完成开发，待测试验证。

### [2026-06-07]
- **操作人**: Trae
- **操作内容**:
  1. **身份证验证模块默认信息设置**：
     - 在 `idcard-validator.js` 中新增 `_setupDefaultMessages(wrapper)` 方法
     - 自动设置默认 Info 提示："请输入正确的中华人民共和国18位身份证"
     - 自动设置默认 Error 错误："身份证号格式不正确"
     - 优先使用用户自定义信息（如果已设置）
     - 使用 DOMObserver 监听新添加的 `idcard-adv` 元素，自动设置默认信息
     - 扫描现有元素并设置默认信息

  2. **测试页面更新**：
     - 更新 `idcard-validator-test.html`，新增"高级身份证验证（自定义信息）"测试用例
     - 展示默认信息与自定义信息的对比效果
     - 更新测试编号，保持有序

- **状态**: 测试页面已更新，展示默认信息与自定义信息的对比效果。

...（省略中间章节）...

### [2026-06-16 第六阶段]
- **操作人**: Trae
- **操作内容**:
  1. **表格异步数据源加载**:
     - `createTable` 新增 `_needsAsyncLoad` 检测文件路径数据源
     - 新增 `_loadDataSource` 方法：fetch 加载远程 JSON → `tableDataManager.parse` 解析
     - 加载完成后调用 `_initTable` 统一初始化流程
     - `parseDataSource` 对文件路径静默跳过（不再输出 debug 日志）

  2. **用户表头驱动的数据渲染**:
     - 新增 `renderTableBody(table, config)` 方法
     - **匹配规则**：
       - 以用户 `<thead>` 设定的表头列名为准
       - 数据源中找不到对应字段的列 → 隐藏（不渲染该列）
       - 数据源中多出的字段（用户表头未定义）→ 忽略
       - 纯数组数据 → 按列顺序填充
     - 数据载入后自动渲染到 `<tbody>`，保持用户 `<thead>` 和 `<tfoot>` 不变

  3. **数据就绪事件**:
     - 展示类表格渲染完成后派发 `cui-table-data-ready` 自定义事件
     - 事件携带 `detail.data`（完整数据）和 `detail.config`
     - 用户可监听此事件处理汇总行等自定义逻辑

  4. **测试页面完全重构**:
     - 移除 `fillTableBody`、`maskIdcard`、`maskPhone` 等手动 JS
     - 使用原生 `<table>` + `<thead>` 定义表头
     - 通过 `data-cui-table='{"dataSource":"..."}'` 指定数据源
     - 框架自动加载数据 + 根据用户表头渲染 + 处理字段匹配
     - "应用"按钮通过 sessionStorage 保存配置后刷新页面刷新配置
     - 页面加载时读取 sessionStorage，在框架模块运行前更新 table 属性
- **状态**: 所有更改均经过 lint 检查，测试页面零手动数据渲染逻辑

### [2026-06-21 第七阶段]
- **操作人**: Trae
- **操作内容**:
  1. **CUITableRegistry 实现**：
     - 新建 `src/modules/js/table-registry.js`，实现单例、注册、数据加载、增删改、事件派发等 API；在全局 `window.CUI.tableRegistry` 暴露实例。
  2. **Table 类重构**：
     - 注入 `CUITableRegistry`，改为从注册表读取配置并渲染；编辑事件写回注册表并派发 `cui-table-data-updated`，完成后派发 `cui-table-data-ready`。
  3. **测试页面更新**：
     - 使用 `CUI.tableRegistry.register` 与 `loadDataSource` 加载数据；移除旧手动填充逻辑，改为监听自定义事件。
  4. **事件系统完善**：
     - 在注册表实现 `dispatchEvent`，确保 `cui-table-data-ready`、`cui-table-data-updated`、`cui-table-config-changed` 能被页面监听。
  5. **遗留代码清理**：
     - 删除 `index` 未使用提示、`fillTableBody`、`maskIdcard`、`maskPhone` 等函数，lint 警告为零。
- **状态**: 表格模块完整重构，注册表机制生效，满足双向同步与标准化渲染需求

### [2026-06-26 表格模块 Spec 差距收尾]
- **操作人**: Trae
- **操作内容**: 依据 `user/表格模块标准化开发文档（AI落地专用·严苛规范版）.md` 逐章复核，完成剩余 3 项差距（N1/N2/N3）收尾。
  1. **N1 全量重建规则清空**（Spec §7.2）：
     - `TableRenderLayer.render()` 在表头 `headerHash` 变化分支增加 `lastHeaderHash !== ''` 守卫，非首次变更时调用 `registry.clearRules()` + `setPageState({pageNum:1})`，清空历史规则并重置分页到第 1 页；首次渲染不触达，避免破坏 `processRawData→setData` 已写入的 `total/pageCount`。
  2. **N2 updateData 表头一致性校验**（Spec §8.7/§11.3）：
     - `TableDataLayer.updateData` 新增 `entry.header` 与传入 `headers` 字段集比较，不一致时清空规则 + 重置分页，配合渲染层 `headerHash` 变化走全量重建路径；空表头守卫避免首次更新误判。
  3. **N3 测试用例补充与代码漂移消除**：
     - 同步 `src/test/table/test-table-modules.js` 内联 `_cleanAndAlignData` 至 table.js 增强版（含超列报错 + 缺列补齐）。
     - 新增 5 个测试用例：CSV 字段内逗号转义、CSV 双引号转义、超列截断报错、loading 加锁跳过、longDebounce 防抖时长判定。
- **修改文件范围**:
  - `src/modules/js/table.js`（render / _fullRebuild / TableDataLayer.updateData）
  - `src/test/table/test-table-modules.js`（内联副本同步 + 5 个新用例）
  - `.trae/documents/table-spec-gap-closure-plan.md`（对比复核与收尾计划文档）
- **验证**: `node src/test/table/test-table-modules.js` 输出 `23 通过 / 0 失败`。
- **状态**: Spec 18 项核心要求全部达标，9 项超越 Spec 的增强保持现状，历史 G1–G8 差距全部修复或验证为非问题，N1–N3 收尾完成。

### [2026-06-26 表格样式细节修正：垂直居中 + 省略号 + 长文本 focus 展开]
- **操作人**: Trae
- **操作内容**: 按用户需求修正表格单元格样式细节，实现"非长文本垂直居中 + 长文本省略号 + focus 展开滚动"三段式交互。
  1. **CSS th/td 拆分**（`table.css`）：
     - `th` 保持 `display:block`，省略号三件套直接生效（表头单行省略）。
     - `td` 改为 `display:flex; align-items:center`，实现单元格内垂直居中。
     - 新增 `.CUI-cell-text` 内层文本容器：`display:block` + 省略号三件套 + `min-width:0; flex:1 1 auto`，承载省略号（flex 匿名 item 不渲染省略号，需下沉到 block 子元素）。
  2. **长文本 focus 展开机制**（`table.css`）：
     - `.CUI-table .CUI-td-long` 覆盖 `td` 的 `display:flex` 为 `display:block`（选择器从 `.CUI-td-long` 提升为 `.CUI-table .CUI-td-long`，特异性 0,2,0 > 0,1,1，确保优先级）。
     - `:focus` 时 `max-height:300px; overflow:auto; z-index:20; outline:2px solid primary`，悬浮于相邻单元格之上。
     - `:focus .CUI-cell-text` 释放 `white-space:normal; overflow:visible; text-overflow:clip; word-break:break-word`，由 td 滚动查看全部内容。
  3. **数字/图片 flex 适配**（`table.css`）：
     - `.CUI-td-number` 改用 `justify-content:flex-end`（flex 下 text-align 失效），内层 span 保留 `text-align:right`。
     - `[data-type="image"]` td 加 `justify-content:center`。
     - `.CUI-table-cell-email/link` 和 `.CUI-currency-amount` 加省略号三件套 + `min-width:0; flex:1 1 auto`。
     - 删除 `.CUI-table-autoheight .CUI-td-long` 旧覆盖规则（与新机制冲突）。
  4. **JS 渲染层适配**（`table.js`）：
     - `_formatCellValue` 的 `number` 和 `default` 分支用 `<span class="CUI-cell-text">` 包裹文本，配合 CSS 省略号。
     - `_renderBody` 长文本 td 加 `tabindex="0"` 使其可聚焦，触发 `:focus` 展开。
- **修改文件范围**:
  - `src/modules/css/table.css`（Version 0.6.0 → 0.7.1）
  - `src/modules/js/table.js`（Version 0.7.0 → 0.7.1）
- **关键技术决策**:
  - flex + align-items:center 实现垂直居中，但 flex 容器的直接文本（匿名 flex item）不渲染 text-overflow:ellipsis，通过 Playwright 像素级实验确认（flex 版本 0 像素差异，block 版本 180 像素差异），采用内层 span 方案兼顾两者。
  - 长文本不垂直居中（display:block），与普通单元格（display:flex + align-items:center）视觉区分；focus 展开后内容自然换行滚动。
- **验证**: Playwright 页面级样式验证 `/tmp/table_style_verify.py` 输出 `23 通过 / 0 失败`，覆盖：普通单元格垂直居中（差值<2px）、省略号三件套、长文本默认省略号+溢出、focus 展开释放 nowrap、数字右对齐、图片居中、货币省略号。
- **状态**: 样式细节修正完成，垂直居中 + 省略号 + 长文本 focus 展开三段式交互全部生效。

### [2026-06-26 表格样式行为调整：短文本横向滚动 + 长文本3行省略号]
- **操作人**: Trae
- **操作内容**: 按用户反馈调整单元格溢出处理策略，从"单行省略号"改为"短文本横向滚动 + 长文本3行省略号"。
  1. **短文本横向滚动**（`table.css`）：
     - `.CUI-cell-text` 去掉 `text-overflow:ellipsis`，`overflow:hidden` 改为 `overflow-x:auto; overflow-y:hidden`，横向溢出时出现滚动条而非省略号，保留内容完整可读（如身份证号18位长数字）。
     - `.CUI-table-cell-email/link`、`.CUI-currency-amount` 同步改为横向滚动，加 `display:block` 让 `<a>` 等元素支持 overflow。
  2. **长文本3行省略号**（`table.css`）：
     - 新增 `.CUI-td-long .CUI-cell-text` 规则：`display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; white-space:normal`，实现3行截断 + 省略号。
     - 覆盖短文本的横向滚动规则（white-space:normal 允许换行）。
  3. **长文本 focus 保持3行 + 滚动**（`table.css`）：
     - `.CUI-table .CUI-td-long:focus` 的 `max-height` 从 `300px` 改为 `calc(1.5em * 3 + var(--size-sm) * 2 + 8px)`（3行 + padding + 滚动条空间），focus 后保持3行高度不变。
     - `.CUI-table .CUI-td-long:focus .CUI-cell-text` 用 `-webkit-line-clamp:unset` 释放3行截断，内容完整渲染，由 td 的 `overflow:auto` 滚动查看超出部分。
  4. **autoheight 模式适配**（`table.css`）：
     - 新增 `.CUI-table-autoheight .CUI-td-long .CUI-cell-text` 规则：`-webkit-line-clamp:unset; overflow:visible`，自动行高模式下长文本完整显示不截断。
- **修改文件范围**:
  - `src/modules/css/table.css`（Version 0.7.1 → 0.7.2）
  - `src/modules/js/table.js`（Version 0.7.1 → 0.7.2，版本号同步）
- **关键技术决策**:
  - 短文本横向滚动 vs 省略号：横向滚动保留内容完整可读，适合身份证号、手机号等长位数字；省略号会截断关键信息。
  - 长文本3行省略号 vs 单行：3行展示更多上下文，配合 -webkit-line-clamp 实现标准多行省略号。
  - focus 保持3行高度：避免 focus 后单元格突然变高影响布局，保持视觉稳定性；通过 td overflow:auto + span overflow:visible 实现内容完整渲染 + 滚动查看。
- **验证**: Playwright 页面级样式验证 `/tmp/table_style_verify2.py` 输出 `35 通过 / 0 失败`，覆盖：短文本横向滚动（身份证号 scrollWidth=173 > clientWidth=167）、长文本3行省略号（line-clamp=3）、focus 保持3行高度（max-height=96px）+ 释放 line-clamp + 可滚动（个人简介 scrollHeight=208 > clientHeight=95）、数字右对齐、图片居中、货币横向滚动。
- **状态**: 样式行为调整完成，短文本横向滚动 + 长文本3行省略号 + focus 保持3行可滚动的三段式交互全部生效。

### [2026-06-26 表格交互优化：hover 替代 focus + 短文本列宽放宽]
- **操作人**: Trae
- **操作内容**: 按用户反馈调整长文本展开交互方式，并放宽短文本列宽确保身份证号完整显示。
  1. **长文本 hover 替代 focus**（`table.css`）：
     - `.CUI-table .CUI-td-long:focus` → `.CUI-table .CUI-td-long:hover`
     - `.CUI-table .CUI-td-long:focus .CUI-cell-text` → `.CUI-table .CUI-td-long:hover .CUI-cell-text`
     - 鼠标悬浮即展开（保持3行高度 + 释放 line-clamp + 可滚动），移出即收起，无需点击聚焦。
  2. **去掉 tabindex**（`table.js`）：
     - `_renderBody` 中长文本 td 不再设置 `tabindex="0"`，因为不再依赖 focus 交互。
  3. **短文本列宽放宽**（`table.css`）：
     - `idcard` 类型：`width:200px → 240px`，`min-width:180px → 220px`（身份证号18位完整显示）。
     - `phone` 类型：`width:140px → 160px`，`min-width:120px → 140px`（手机号11位完整显示）。
- **修改文件范围**:
  - `src/modules/css/table.css`（Version 0.7.2 → 0.7.3）
  - `src/modules/js/table.js`（Version 0.7.2 → 0.7.3，去掉 tabindex）
- **验证**:
  - Playwright 样式验证 `/tmp/table_style_verify3.py` 输出 `28 通过 / 0 失败`：身份证号列宽 240px 完整显示（scrollWidth=207 = clientWidth=207，无需滚动）、长文本无 tabindex、hover 释放 line-clamp + 可滚动（个人简介 scrollHeight=208 > clientHeight=95）。
  - Node 单元测试 `node src/test/table/test-table-modules.js` 输出 `23 通过 / 0 失败`。
- **状态**: 交互优化完成，hover 展开替代 focus，短文本列宽放宽确保关键信息完整可读。

### [2026-06-26 列宽改用 em 单位 + idcard/phone/date 居中显示]
- **操作人**: Trae
- **操作内容**: 按用户反馈将固定 px 列宽改为 em 单位，实现字体大小自适应；idcard/phone/date/datetime 单元格居中显示。
  1. **去掉固定 px 宽度**（`table.css`）：
     - `idcard`：`width:240px; min-width:220px` → `min-width: 13em`（18位身份证号，208px@16px字体）
     - `phone`：`width:160px; min-width:140px` → `min-width: 9em`（11位手机号，144px）
     - `date`：`width:130px; min-width:110px` → `min-width: 9em`（yyyy-mm-dd，144px）
     - `datetime`：`width:180px; min-width:150px` → `min-width: 14em`（yyyy-mm-dd hh:mm:ss，224px）
     - em 单位随字体大小缩放，比 px 更灵活。
  2. **居中显示**（`table.css`）：
     - 新增 `td[data-type="phone/idcard/date/datetime"]` 的 `justify-content: center` 和 `.CUI-cell-text` 的 `text-align: center`。
     - 这些类型内容长度固定（身份证号18位、手机号11位、日期格式固定），居中显示更美观。
  3. **min-width 覆盖内容宽度确保 th/td 对齐**：
     - flex 布局下 th/td 独立计算宽度，内容不同会错位。
     - min-width 设为覆盖 td 内容宽度，使 th/td 都等于 min-width，实现对齐。
- **修改文件范围**:
  - `src/modules/css/table.css`（Version 0.7.3 → 0.7.4）
- **验证**: Playwright 样式验证 `/tmp/table_style_verify4.py` 输出 `31 通过 / 0 失败`：身份证号 min-width=208px(13em)、td/th 对齐(208=208)、居中、18位完整显示；手机号/日期同理；长文本 hover 展开正常。
- **状态**: 列宽改用 em 单位完成，idcard/phone/date/datetime 居中显示，字体大小自适应。

### [2026-06-26 排序三态切换：升序→降序→取消→升序循环]
- **操作人**: Trae
- **操作内容**: 按用户需求将排序从两态（升序↔降序）改为三态循环切换（升序→降序→取消排序→升序...）。
  1. **registry 新增 removeSortRule 方法**（`table.js`）：
     - 移除指定字段的排序规则，触发 'sort' 事件。
  2. **registry.addSortRule 修复隐患**：
     - 添加规则前先移除同字段的旧规则，避免同字段累积多条规则（之前每次 push 会导致重复）。
  3. **dataLayer 新增 unsort 方法**：
     - 调用 registry.removeSortRule + recalculate，返回更新后的 sortRules。
  4. **Table 主类暴露 unsort API**：
     - `CUI.table.unsort(tableId, field)` 供外部调用。
  5. **_bindSortEvents 三态切换逻辑**（`table.js` L1177-1208）：
     - 无规则 → 升序（addSortRule + CUI-sort-asc）
     - 升序 → 降序（addSortRule + CUI-sort-desc）
     - 降序 → 取消排序（unsort，清除 class，恢复默认 ↕ 图标）
     - 排序变更后调用 this.render() 重新渲染 tbody 反映排序结果
- **修改文件范围**:
  - `src/modules/js/table.js`（Version 0.7.4 → 0.7.5）
- **验证**:
  - Node 单元测试 `23 通过 / 0 失败`。
  - Playwright 排序三态验证 `/tmp/table_sort_verify2.py` 输出 `13 通过 / 0 失败`：用 ID 字段（唯一值）测试，升序前3=[1,2,3]、降序前3=[150,149,148]、取消恢复[1,2,3]、循环回升序[1,2,3]。
- **状态**: 排序三态切换完成，点击表头在升序/降序/取消之间循环切换。

### [2026-06-26 修复长文本hover展开框尺寸变化bug]
- **操作人**: Trae
- **操作内容**: 修复长文本 hover 展开时框变大的问题。
  - **问题**：hover 时 max-height 比默认多 `+8px`（96px vs 88px），导致框高度变大。
  - **修复**（`table.css`）：hover 的 `max-height` 去掉 `+8px`，与 `.CUI-table tbody td` 默认值一致（`calc(1.5em * 3 + var(--size-sm) * 2)`）。
  - 滚动条在内容区域内（clientWidth 内），不需要额外高度空间。
- **修改文件范围**: `src/modules/css/table.css`（Version 0.7.4 → 0.7.5）
- **验证**: Playwright 尺寸测量确认 hover 前后 width/height 完全一致（320→320, 88→88），scrollHeight=208 > clientHeight=87 仍可滚动；样式验证 31/31 通过。
- **状态**: 修复完成，hover 展开框尺寸与默认一致。

### [2026-06-29 表格模块全面审查与Bug修复+代码优化 (v0.8.0)]
- **操作人**: Trae
- **操作内容**: 完整审查 table.js（1338行）和 table.css（600行），修复5个Bug + 3项代码优化。
  
  **Bug 修复**:
  1. **B1: `_bindSortEvents` 中 `this.render()` 报 TypeError**（L1207）：
     - `this` 是 TableInit，无 render 方法；排序通过 registry 'filtered' 事件触发渲染
     - 删除 `this.render()`，Playwright 确认不再报错
  2. **B2: dataLayer 绕过 registry 直接操作 `_store`**（L416/474/483）：
     - registry 新增 `clearFilters`/`clearSorts`/`updateCellData` 方法
     - dataLayer 的 `updateCell`/`clearFilters`/`clearSorts` 改调 registry 方法
  3. **B3: image 类型内联样式**（L916）：
     - 去掉 `style="width:40px;height:40px;border-radius:4px;object-fit:cover;"`
     - 改用 `class="CUI-table-cell-image"`，CSS 仅设 `max-width:100%; max-height:calc(1.5em*3)`
     - 不加 object-fit/border-radius 等视觉修饰，浏览器默认保持原始比例，图片完全原样显示只受单元格尺寸限制
  4. **B4: initWrapper 内联样式**（L529-531）：
     - 去掉 `container.style.height/overflow/position`
     - 改由 `.CUI-table-container` CSS 提供 `height:500px; position:relative; overflow:auto`
  5. **B5: _injectToolbar 内联样式**（L875）：
     - 去掉 `style="margin:0; width:260px;"`
     - 改用 `class="CUI-table-search-box"`，CSS 控制

  **代码优化**:
  1. **O3: `_cleanAndAlignData` 三分支重复合并**：缺列/超列/正常三分支的 forEach 合并为一个
  2. **O4: `MAX_RULES` 常量启用**：CUITableRegistry 构造函数添加 `this.MAX_RULES=10`，addFilterRule/addSortRule 使用 `this.MAX_RULES` 替代硬编码
  3. **O5: 搜索框防抖**：input 事件加 300ms 防抖，避免大数据量时频繁搜索卡顿

- **修改文件范围**:
  - `src/modules/js/table.js`（v0.7.5 → v0.8.0）
  - `src/modules/css/table.css`（v0.7.5 → v0.8.0）
- **验证**:
  - Node 单元测试 `23 通过 / 0 失败`
  - Playwright 综合验证 `20 通过 / 0 失败`：B1-B5 全部修复确认 + O5 防抖验证（100ms 不触发、500ms 生效）
- **状态**: 表格模块功能部分基本完成，后续进入显示部分优化。

### [2026-06-30 表格工具栏/容器/底栏衔接修复 (v0.8.1)]
- **操作人**: Trae
- **操作内容**: 修复表格上方控制栏、表格容器、下方控制栏三者之间的衔接问题。
  1. **容器与底栏 24px 间隙修复**（`table.css`）：
     - 根因：`components.css` 通用容器规则对 `.CUI-table-container` 设了 `margin-bottom: var(--size-lg)`（24px），`table.css` 未覆盖
     - 修复：`.CUI-table-container` 显式设 `margin-bottom: 0`
  2. **容器圆角与工具栏/底栏直角不匹配修复**（`table.css`）：
     - 根因：容器四角 `border-radius: var(--radius-md)`（8px），但工具栏底角和底栏顶角是直角，衔接处圆角向内弯曲产生视觉缺口
     - 修复：容器底角改直角（`border-bottom-*-radius: 0`），底栏始终存在；新增 `.CUI-table-toolbar + .CUI-table-container` 相邻兄弟选择器，功能型表格有工具栏时容器顶角也改直角；展示型表格无工具栏时顶角保持圆角
- **修改文件范围**: `src/modules/css/table.css`（v0.8.0 → v0.8.1）
- **验证**: Playwright 衔接验证 `15 通过 / 0 失败`：容器 margin-bottom=0、与工具栏/底栏均无间隙、四角直角与相邻元素无缝对接、三者宽度一致且左右对齐、工具栏顶角和底栏底角保持圆角。Node 单元测试 `23 通过 / 0 失败`。
- **状态**: 衔接修复完成，工具栏→容器→底栏形成完整胶囊形状（外圆内直）。

### [2026-06-30 表格列宽架构重构：thead 定义 + JS 同步到 tbody/tfoot (v0.8.2)]
- **操作人**: Trae
- **操作内容**: 按用户反馈重构列宽架构，实现"表头定义列宽后，tbody/tfoot 自动与 thead 一致"，消除在 td 上重复定义列宽的冗余设计。
  - **背景**：用户指出"表头定义完列宽以后，底下就不应再定义列宽，tbody/tfoot 应自动和 thead 一致"。当前 CSS 在 `th[data-type]` 和 `td[data-type]` 上重复定义列宽，且 tfoot 列与 thead/tbody 不对齐。
  - **根因**：框架用 `display: flex/block` 控制 td 布局（实现垂直居中、长文本展开），破坏了原生 `display: table` 的列宽自动共享机制，导致 thead/tbody/tfoot 各自独立计算列宽。
  - **架构方案**：CSS 列宽规则只保留 `th[data-type]`，td 通过 CSS 变量 `--cw` 接收 JS 同步的宽度，实现"定义一次，自动传播"。
  1. **CSS 列宽规则重构**（`table.css`）：
     - `.CUI-table td` 基础规则添加 `width: var(--cw, auto)`，由 JS 注入计算宽度
     - `.CUI-table tfoot td` 移除 `flex: 1`（原等宽分配导致 tfoot 列与 thead 不对齐）
     - 所有 `th[data-type="X"], td[data-type="X"]` 宽度规则改为仅 `th[data-type="X"]`，涵盖 id/number/currency/phone/idcard/email/link/date/datetime/image/password/text-long
     - td 上的 data-type 对齐规则（justify-content、text-align）保留不变，仅列宽规则剥离
  2. **JS 列宽同步方法**（`table.js`）：
     - 新增 `_syncColumnWidths()` 方法：读取 `thead tr:last-child th` 的 `getComputedStyle().width`，通过 `td.style.setProperty('--cw', width)` 同步到所有 tbody td 和 tfoot td/th
     - 在 `_fullRebuild` 和 `_partialUpdate` 末尾调用 `_syncColumnWidths()`
     - 删除 `_renderBody` 中失效的 th 内联宽度同步代码（`h.element.style.width` 始终为空，因 th 宽度来自 CSS 规则而非内联样式，从未生效）
- **修改文件范围**:
  - `src/modules/css/table.css`（v0.8.1 → v0.8.2）
  - `src/modules/js/table.js`（v0.8.0 → v0.8.2）
- **关键技术决策**:
  - 采用 CSS 变量 `--cw` 而非直接 `td.style.width`：变量方式不覆盖 CSS 规则的优先级，且语义清晰（"列宽来自 thead 同步"），未来若需用户手动覆盖 td 宽度更灵活
  - 使用 `getComputedStyle(th).width` 而非 `th.style.width`：前者捕获最终计算值（含 CSS 规则 + 内联样式 + max-width 约束），后者只能取内联样式（为空）
  - `thead tr:last-child th` 选择器：兼容多行表头场景，取最后一行（实际列定义行）
  - tfoot 同步选择器用 `td, th`：兼容 tfoot 中混合使用 td 和 th 的情况
- **验证**:
  - Playwright 列宽对齐验证 `/tmp/table_colwidth_sync_verify.js`：22 列 thead/tbody/tfoot 计算宽度完全一致（前5列 80/100/64/208/144 px），`--cw` 变量已设置到全部 22 个 tbody td 和 22 个 tfoot 单元格，不匹配数 0
  - Node 单元测试 `23 通过 / 0 失败`
- **状态**: 列宽架构重构完成，thead 定义一次，tbody/tfoot 通过 JS 同步自动对齐，消除冗余列宽定义。

### [2026-06-30 表格工具栏与底栏功能增强 (v0.9.0)]
- **操作人**: Trae
- **操作内容**: 按用户需求增强表格工具栏（加导出/筛选按钮）和底栏状态条（加排序/筛选条件标签），并修复"每页 X 条"换行问题。
  1. **工具栏增加导出/筛选按钮**（`table.js` `_injectToolbar`）：
     - 在 `.CUI-table-toolbar-right`（原为空）加"筛选""导出"两个 `CUI-btn-sm CUI-btn-secondary` 按钮
     - 事件用直接 `addEventListener`（与搜索框、分页按钮一致，属自定义业务逻辑）
  2. **导出 CSV**（`table.js` 新增 `_exportCSV`）：
     - 导出 `entry.filteredData` 全量筛选后数据（非当前页）+ `entry.header` 表头
     - UTF-8 with BOM（`\uFEFF` 前缀）确保 Excel 正确识别中文
     - 字段内逗号/引号用双引号包裹 + 内部双引号转义为 `""`（RFC 4180 标准）
     - 文件名 `{tableId}_{YYYYMMDDHHmmss}.csv`，Blob + URL.createObjectURL + `<a download>` 下载
     - 空数据 alert 提示
  3. **筛选 Overlay 面板**（`table.js` 新增 `_openFilterPanel` + `_renderFilterRules` + `_filterOpLabel`）：
     - 复用框架 `CUI.overlay({type:'glass'})` 创建全屏遮罩，注入 `.CUI-modal-content` 居中面板（max-width 600px）
     - 字段下拉从 `entry.header` 生成，操作符下拉 7 种（等于/不等于/大于/小于/≥/≤/包含）
     - 添加规则走 `dataLayer.filter`（触发 recalculate → filtered 事件 → 渲染层重绘）
     - 已添加规则列表带×删除（走 `dataLayer.unfilter`），清空全部走 `dataLayer.clearFilters`
     - 面板内点×/关闭按钮/清空全部均正确关闭或刷新
  4. **底栏状态条条件标签**（`table.js` `_updatePagination` + `_bindPaginationEvents`）：
     - 状态条在"显示 X-Y 条"后追加排序/筛选标签，复用 `CUI-badge-closeable`（outline + secondary 变体）
     - 排序标签：`{字段label} ↑/↓`，data-sort-field 属性；筛选标签：`{字段label} {操作符中文} {值}`，data-filter-index 属性
     - 点标签×：排序走 `dataLayer.unsort`，筛选走 `dataLayer.unfilter`，触发 recalculate + 重绘
     - 标签容器 `flex-wrap: wrap` 允许换行，单标签 `max-width: 240px` + 省略号
  5. **修复"每页 X 条"换行**（`table.css`）：
     - `.CUI-pagination-size` / `.CUI-pagination-jump` 加 `white-space: nowrap; flex-shrink: 0`，确保"每页"+"下拉"+"条"作为整体不拆行
     - `.CUI-table-status-bar` / `.CUI-table-pagination` 加 `flex-wrap: wrap` 作为窄屏兜底
  6. **Registry/DataLayer 新增 API**：
     - `CUITableRegistry.removeFilterRule(tableId, index)`：按索引删除单条筛选规则（参考 removeSortRule）
     - `TableDataLayer.unfilter(tableId, index)`：删除筛选规则 + recalculate（参考 unsort）
  7. **_partialUpdate 补 _updatePagination 调用**：
     - 原 `_partialUpdate`（筛选/排序/分页变化走此路径）未调用 `_updatePagination`，导致底栏不随筛选/排序更新
     - 补加 `this._updatePagination(entry)`，底栏条数和条件标签现在随数据状态实时刷新
  8. **修复框架 overlay.js show 类名 bug**（既有 bug，筛选面板依赖）：
     - 根因：`overlay.js` 加 `CUI-show` 类，但 `components.css` 定义的是 `.CUI-overlay.show`（无 CUI- 前缀），导致 overlay 永远不可见（opacity:0/visibility:hidden）
     - 修复：`overlay.js` 5 处 `CUI-show` → `show`（L35/37/79/115/141）
     - **遗留**：`message.js`（toast）和 `image-zoom.js` 存在同样 bug（`CUI-show` vs `.show`），本次未修，留待后续
- **修改文件范围**:
  - `src/modules/js/table.js`（v0.8.2 → v0.9.0）：Registry 加 removeFilterRule、DataLayer 加 unfilter、_injectToolbar 加按钮、新增 _exportCSV/_openFilterPanel/_renderFilterRules/_filterOpLabel、_updatePagination 加标签、_bindPaginationEvents 加×事件、_partialUpdate 补 _updatePagination
  - `src/modules/css/table.css`（v0.8.2 → v0.9.0）：筛选面板样式、状态条标签样式、.CUI-pagination-size/jump nowrap
  - `src/modules/js/overlay.js`（bug 修复）：5 处 CUI-show → show
  - `src/test/table/test-table-modules.js`：内联副本同步 removeFilterRule/removeSortRule，新增 2 个测试用例（24/25）
- **关键技术决策**:
  - 筛选面板用 `CUI.overlay` 全屏遮罩 + `.CUI-modal-content` 居中容器，复用框架现有 overlay 组件而非自建弹窗
  - 筛选/排序操作走 `dataLayer.filter/unfilter/unsort` 而非直接 `registry.addFilterRule`，确保触发 recalculate → filtered 事件 → 渲染层重绘
  - 状态条标签用 `CUI-badge-closeable` 复用框架徽章组件，data-* 属性携带清除所需的 field/index
  - CSV 导出用 UTF-8 BOM 解决 Excel 中文乱码，RFC 4180 转义规则
- **验证**:
  - Playwright 端到端验证 `/tmp/table_v09_verify.js`：`16 通过 / 0 失败`，覆盖工具栏按钮、筛选面板弹窗与表单、添加/删除筛选规则、状态条排序/筛选标签显示与×清除、"每页"窄屏不换行、列宽对齐回归
  - Node 单元测试 `25 通过 / 0 失败`（新增 24/25 两个用例验证 removeFilterRule/removeSortRule）
- **状态**: 工具栏与底栏功能增强完成，导出 CSV + 筛选面板 + 状态条条件标签 + 每页换行修复全部生效。遗留 message.js/image-zoom.js 的 CUI-show bug 待后续处理。

### [2026-06-30 修复"暂无数据"容器未撑满表格宽度 (v0.9.1)]
- **操作人**: Trae
- **操作内容**: 修复空数据状态下"暂无数据"提示容器只显示 320px 宽、未左右撑满表格的问题。
  - **根因（三重叠加）**：
    1. **CSS 特异性不足**：`.CUI-table-empty`（0,1,0）无法覆盖 `.CUI-table td`（0,1,1）的 `flex-shrink:0` 和 `width:var(--cw)`
    2. **max-width: 320px 限制**：td 基础规则有 `max-width: 320px`，即使 flex:1 生效也撑不过 320px
    3. **JS 副作用**：`_applyFreezeLayout` 给空数据 td 加了 `CUI-freeze-first`（sticky+阴影），`_syncColumnWidths` 注入了 `--cw:80px`
  - **修复**：
    1. CSS 选择器提升为 `.CUI-table td.CUI-table-empty`（0,2,1 > 0,1,1），显式设 `width:auto; max-width:none; flex:1` 覆盖基础规则
    2. `_applyFreezeLayout` 跳过含 `.CUI-table-empty` 的 tr，避免 sticky/阴影副作用
    3. `_syncColumnWidths` 跳过空数据行，避免注入 `--cw` 覆盖 flex:1 撑满效果
- **修改文件范围**:
  - `src/modules/css/table.css`（v0.9.0 → v0.9.1）
  - `src/modules/js/table.js`（v0.9.0 → v0.9.1）
- **验证**: Playwright 验证 `/tmp/table_empty_verify.js`：表格宽 3414px，"暂无数据"容器宽 3414px，左右偏移 0，无 freeze-first 类，无 --cw 变量。单元测试 25/25 通过。
- **状态**: 空数据容器撑满表格宽度，与表格同宽。

### [2026-07-17 表格组件功能增强 (v0.9.2)]
- **操作人**: Trae
- **操作内容**: 依据需求说明书实现多项表格高级功能，包括展示类表格、前N行冻结、任意列冻结、多个汇总行冻结、单元格合并、多级表头支持。

  1. **展示类表格（display类型）**：
     - `_fullRebuild`/`_partialUpdate` 中分页栏和工具栏仅在 `functional` 类型时渲染
     - JS 初始化成功后设置 `data-table-type` 属性
     - CSS 排序箭头仅对功能类表格显示（通过 `data-table-type="functional"` 和工具栏选择器控制）
     - 单元格编辑仅在 `functional` 类型时启用

  2. **前N行冻结（data-frozen-rows）**：
     - `_extractFreezeConfig` 新增 `frozenRows` 配置解析（JSON数组）
     - `_applyFrozenRows` 方法为指定行添加 `CUI-freeze-row` 类，计算累积 top 值设置 sticky
     - CSS 样式 `CUI-freeze-row-cell` 实现垂直冻结（z-index:14）

  3. **任意列冻结（data-frozen-cols）**：
     - `_extractFreezeConfig` 新增 `frozenCols` 配置解析（JSON数组）
     - `_applyFrozenCols` 方法为指定列添加 `CUI-freeze-col` 类
     - CSS 样式实现水平冻结（z-index:11）

  4. **多个汇总行冻结（data-frozen-summary-rows）**：
     - `_extractFreezeConfig` 新增 `frozenSummaryRows` 配置解析（支持负数索引）
     - `_applyFrozenSummaryRows` 方法为 tfoot 指定行添加冻结类
     - CSS 样式实现底部冻结（z-index:12）

  5. **单元格合并（data-merge-cells）**：
     - `_extractFreezeConfig` 新增 `mergeCells` 配置解析（支持 colspan/rowspan）
     - `_renderBody` 中处理合并规则，跳过已合并单元格
     - CSS 样式 `CUI-cell-merged-col`/`CUI-cell-merged-row` 支持合并显示

  6. **多级表头支持**：
     - `_extractHeadersFromDOM` 增强，支持多层 thead tr
     - 提取最后一行作为字段定义，向上遍历父级表头获取 parentLabels
     - 保留原有 colspan/rowspan 属性，支持复杂表头结构

  7. **测试用例补充**：
     - 新增 5 个测试用例（26-30）：展示类/功能类配置、冻结默认值、规则清空、分页重置
     - 单元测试 30/30 通过

- **修改文件范围**:
  - `src/modules/js/table.js`（v0.9.1 → v0.9.2）
  - `src/modules/css/table.css`（v0.9.1 → v0.9.2）
  - `src/test/table/test-table-modules.js`（新增测试用例）
- **验证**: Node 单元测试 `30 通过 / 0 失败`，所有新增功能符合需求说明书规范。
- **状态**: 表格组件功能增强完成，支持展示类/功能类分类、多方向冻结、单元格合并、多级表头。

### [2026-07-17 表格组件测试页面与自动化测试 (v0.9.3)]
- **操作人**: Trae
- **操作内容**: 更新测试页面并创建 Playwright 自动化测试，对表格组件进行全量功能测试。

  1. **测试页面更新**:
     - 在 [index.html](file:///Users/wanglin/工作_本地/trae/Casting_UI/src/test/table/index.html) 原有测试表格下方新增 6 个测试表格：
       - 展示类表格（display类型）- 验证纯外观展示，无交互功能
       - 前N行冻结表格（frozenRows="[0,1]"）- 验证前2行数据冻结
       - 任意列冻结表格（frozenCols="[0,2]"）- 验证第0列和第2列冻结
       - 多个汇总行冻结表格（frozenSummaryRows="[-1,-2]"）- 验证tfoot最后2行冻结
       - 单元格合并表格（mergeCells配置）- 验证colspan和rowspan合并
       - 多级表头表格（2层thead）- 验证跨行合并表头

  2. **Bug修复**:
     - 修复 `CUITableRegistry.register` 方法：`pageSize` 配置未正确同步到 `pageState.pageSize`，导致分页无效
     - 修复 `TableInit._initializeSuccess` 方法：未添加 `CUI-table-striped` 类，导致斑马纹样式不生效

  3. **Playwright 自动化测试**:
     - 创建 [table.spec.js](file:///Users/wanglin/工作_本地/trae/Casting_UI/tests/table.spec.js)，包含 31 个测试用例：
       - 页面加载验证
       - 功能类表格初始化与分页
       - 展示类表格（无工具栏、无分页、无排序箭头、单元格不可编辑）
       - 前N行冻结（配置解析、sticky定位）
       - 任意列冻结（配置解析、首列和第三列冻结）
       - 多个汇总行冻结（配置解析、sticky定位）
       - 单元格合并（colspan、rowspan属性）
       - 多级表头（多层thead结构、colspan验证）
       - 排序箭头、工具栏、分页验证
       - 表头冻结、首列冻结验证
       - 数据加载完整性
       - 数字类型右对齐、掩码字段、文本长字段、货币类型验证
       - 空数据状态、表格边框样式、条纹样式验证

  4. **测试结果**:
     - **31/31 测试全部通过**
     - Playwright 自动化测试覆盖所有新增功能

- **修改文件范围**:
  - `src/test/table/index.html`（新增测试表格）
  - `src/modules/js/table.js`（修复 pageSize 和 striped 问题）
  - `tests/table.spec.js`（新建 Playwright 测试文件）
- **验证**: Playwright 自动化测试 `31 passed / 0 failed`，所有功能正常工作。
- **状态**: 测试页面和自动化测试已完成，表格组件全量测试通过。

### [2026-07-18 表格冻结功能重构优化 (v0.9.4)]
- **操作人**: Trae
- **操作内容**: 按极简优先、性能优先原则重构表格冻结功能，统一参数接口，清理旧代码。
  1. **JS 代码清理**（`table.js`）：
     - 移除未使用的 `parseArrayAttr` 函数
     - 清理旧冻结参数解析（`data-frozen-rows`、`data-frozen-cols`、`data-frozen-summary-rows`）
     - 保留统一冻结参数 `data-frozen-left`/`data-frozen-right`，支持简单模式（`"true"`）和高级模式（`["字段1", "字段2"]`）
     - 保留旧参数兼容映射（`data-freeze-first-col` → `data-frozen-left="true"`）
     - 简化冻结逻辑：使用容器类切换（`.CUI-freeze-header`、`.CUI-freeze-footer`、`.CUI-freeze-first-col`、`.CUI-freeze-last-col`），不遍历单元格

  2. **CSS 样式优化**（`table.css`）：
     - 移除旧冻结样式（`CUI-freeze-row-cell`、`CUI-freeze-col`、`CUI-freeze-summary-row`）
     - 保留 THEAD/TFOOT 整体冻结样式，使用 `position: sticky` 实现
     - 保留提示列样式（`.CUI-hint-cell-left`、`.CUI-hint-cell-right`），支持透明度过渡效果

  3. **测试页面更新**（`user-test.html`）：
     - 移除硬编码内联样式，使用框架提供的 `.CUI-table-container` 类
     - 添加 10 个测试用例：
       - 简单冻结表头（`data-freeze-header="true"`）
       - 简单冻结尾部汇总（`data-freeze-footer="true"`）
       - 简单冻结首列（`data-frozen-left="true"`）
       - 简单冻结尾列（`data-frozen-right="true"`）
       - 高级模式左侧提示列（`data-frozen-left='["姓名", "电话"]'`）
       - 高级模式右侧提示列（`data-frozen-right='["状态", "操作"]'`）
       - 组合冻结：表头+表尾+首列
       - 组合冻结：提示列+表头+表尾
       - 多级表头 + 冻结
       - 旧参数兼容测试（`data-freeze-first-col="true"`）

  4. **核心设计原则**：
     - THEAD/TFOOT 作为整体冻结，不支持逐行冻结
     - 首列/尾列冻结使用 CSS `position: sticky`
     - 高级模式生成提示列（隐藏单元格），使用 Intersection Observer 控制显示
     - 提示列只显示纯文本内容，多字段用 `·` 分隔
     - 高级模式自动强制冻结表头（提示列需要表头标识字段含义）
     - 不支持 `IntersectionObserver` 的浏览器，提示列始终显示（优雅降级）

- **修改文件范围**:
  - `src/modules/js/table.js`（v0.9.1 → v0.9.4）
  - `src/modules/css/table.css`（v0.9.1 → v0.9.4）
  - `src/test/user-test.html`（重写测试用例）
- **状态**: 表格冻结功能重构完成，所有修改控制在表格组件内，不影响其他框架基础功能。

### [2026-07-21 表格提示列功能完善 (v0.9.5)]
- **操作人**: Trae
- **操作内容**: 完善表格提示列功能，确保提示列正确渲染、显示/隐藏状态切换正常、多级表头兼容。
  1. **CSS 样式更新**（`table.css`）：
     - 提示列默认状态：`opacity:0; visibility:hidden; width:0; padding:0; border:none`，不占用空间
     - 显示状态（`.CUI-hint-left-visible`/`.CUI-hint-right-visible`）：`opacity:1; visibility:visible; width:auto; padding:正常; border:边框+阴影`
     - 添加 0.5s 过渡动画（`transition: all 0.5s ease`）
     - 提示列固定宽度 120px，字体缩小为 0.85em，背景色浅灰色
     - 支持 `white-space:normal` 自动换行

  2. **JS 类名添加**（`table.js`）：
     - `_addLeftHintPlaceholders`/`_addRightHintPlaceholders`：为表头/表尾占位 th 添加 `CUI-hint-header-left`/`CUI-hint-header-right` 类
     - `_renderBody`：为 tbody 提示列 td 添加 `CUI-hint-cell-left`/`CUI-hint-cell-right` 类

  3. **多级表头兼容修复**（`table.js`）：
     - `_extractHeadersFromDOM`：提取表头时排除提示列占位符（`th:not(.CUI-hint-header-left):not(.CUI-hint-header-right)`），避免数据列索引偏移

  4. **提示列内容填充**（`table.js`）：
     - `_populateLeftHintColumn`/`_populateRightHintColumn`：使用表头最后一行字段映射生成提示列标题（多字段用 `·` 分隔）

  5. **Intersection Observer 触发**（`table.js`）：
     - `_initHintObserver`：监听首列/尾列的可见性，移出视口时添加显示类，进入视口时移除
     - 30px 触发区域（`rootMargin: '-30px 0px 0px 0px'`）

  6. **测试验证**：
     - 10 个测试用例全部通过：简单冻结、高级提示列、左右同时提示列、多级表头+提示列、表尾冻结+提示列、旧参数兼容
     - 滚动测试确认提示列自动显示/隐藏正常
     - 多级表头表格结构完全对齐

- **修改文件范围**:
  - `src/modules/js/table.js`（v0.9.4 → v0.9.5）
  - `src/modules/css/table.css`（v0.9.4 → v0.9.5）
- **状态**: 提示列功能完善完成，所有测试用例通过，多级表头兼容问题已修复。

### [2026-07-21 表格模块无效代码清理 (v0.9.5)]
- **操作人**: Trae
- **操作内容**: 清理表格模块中未使用的无效代码，优化代码结构。
  1. **清理未使用的提示列生成方法**（`table.js`）：
     - 删除 `_generateHintColumns`、`_generateHintHeader`、`_generateHintCells`、`_adjustFooterForHints` 方法
     - 这些方法是旧实现，已被新方案替代（提示列现在在 `_renderBody` 和 `_addLeftHintPlaceholders`/`_addRightHintPlaceholders` 中生成）
  2. **清理未使用的辅助方法**（`table.js`）：
     - 删除 `_removeExistingHintHeaders`、`_removeExistingHintCells`、`_clearHintColumns`、`_getRowDataFromDom` 方法
     - 这些方法是旧实现的辅助函数，不再被调用
  3. **版本号同步更新**：
     - `table.js` 和 `table.css` 版本号从 0.9.1 更新到 0.9.5，与实际功能版本一致
  4. **CSS 旧样式检查**：
     - 确认 `table.css` 中已无旧冻结样式（`CUI-freeze-row-cell`、`CUI-freeze-col`、`CUI-freeze-summary-row`）

- **修改文件范围**:
  - `src/modules/js/table.js`（删除约 140 行未使用代码）
  - `src/modules/css/table.css`（版本号更新）
- **状态**: 无效代码清理完成，代码结构更清晰，无功能影响。

### [2026-07-21 表格提示列CSS样式优化与观察器修复 (v0.9.6)]
- **操作人**: Trae
- **操作内容**: 
  1. **CSS 提示列样式优化**（`table.css`）：
     - 删除 `text-overflow: ellipsis`（提示列自然换行，不需要省略号）
     - 显示状态下提示列单元格设置 `overflow: auto`（高度与其他单元格一致，内容超出时自动滚动）
     - 保持 `max-width: 120px`（列宽自然撑开，最大120像素）

  2. **观察器初始化时机修复**（`table.js`）：
     - 在 `_partialUpdate` 方法末尾添加 `_initHintObserver()` 调用
     - 确保分页/搜索/筛选后观察器重新初始化，提示列开关正常工作

  3. **观察器 rootMargin 修复**（`table.js`）：
     - 左侧观察器 rootMargin 从 `'-30px 0px 0px 0px'`（顶部收缩）改为 `'0px 0px 0px -30px'`（左侧收缩）
     - 正确定义触发区域：首列移出左侧30px时显示提示列

- **修改文件范围**:
  - `src/modules/js/table.js`（v0.9.5 → v0.9.6）
  - `src/modules/css/table.css`（v0.9.5 → v0.9.6）
- **状态**: CSS 样式优化完成，观察器初始化时机和触发区域已修复。

### [2026-07-21 表格冻结选择器修复 (v0.9.7)]
- **操作人**: Trae
- **操作内容**: 
  1. **修复首列冻结选择器**（`table.css`）：
     - 将 `:first-child` 选择器改为 `:not(.CUI-hint-header-left):not(.CUI-hint-header-right):first-child`
     - 排除提示列占位符，确保真正的数据列被冻结，而不是隐藏的提示列占位符

  2. **修复尾列冻结选择器**（`table.css`）：
     - 将 `:last-child` 选择器改为 `:not(.CUI-hint-header-left):not(.CUI-hint-header-right):last-child`
     - 同样排除提示列占位符

- **问题说明**:
  - 当启用高级提示列模式时，`_addLeftHintPlaceholders()` 和 `_addRightHintPlaceholders()` 会在表头每行插入占位 th
  - 这导致原来的数据列不再是 `:first-child`/`:last-child`
  - CSS 的 `:first-child`/`:last-child` 选择器错误地选中了提示列占位符，而不是真正的数据列
  - 结果：提示列占位符被冻结（应该保持隐藏），真正的数据列没有被冻结

- **修改文件范围**:
  - `src/modules/css/table.css`（v0.9.6 → v0.9.7）
- **状态**: 冻结选择器修复完成，提示列占位符不再干扰数据列冻结。

### [2026-07-21 表格提示列冻结逻辑重构 (v0.9.8)]
- **操作人**: Trae
- **操作内容**: 
  1. **回退 CSS 选择器**（`table.css`）：
     - 恢复首列冻结选择器为 `:first-child`
     - 恢复尾列冻结选择器为 `:last-child`
     - 提示列占位符作为第一列/最后一列，直接复用冻结样式

  2. **简化提示列 CSS**（`table.css`）：
     - 从 `.CUI-hint-cell-left/right` 和 `.CUI-hint-header-left/right` 中移除 `position: sticky`、`left`、`right`、`z-index`
     - 这些属性由冻结首列/尾列的 CSS 通过 `:first-child`/`:last-child` 提供
     - 提示列 CSS 只保留可见性控制（opacity、visibility、width、padding、transition、background、font-size 等）

  3. **修改 `_applyFreezeLayout`**（`table.js`）：
     - 高级模式启用时强制添加冻结类：
       - `frozenLeft.mode === 'advanced'` → 强制 `CUI-freeze-first-col` 和 `CUI-freeze-header`
       - `frozenRight.mode === 'advanced'` → 强制 `CUI-freeze-last-col` 和 `CUI-freeze-header`
     - 确保提示列作为第一列/最后一列能获得冻结样式

- **问题说明**:
  - 之前的错误：提示列自身设置了 `position: sticky`，同时又试图用 `:not()` 选择器排除它，导致冻结失效
  - 正确逻辑：提示列就是第一列和最后一列，直接复用冻结首列/尾列的 CSS
  - 通过复合选择器（`.CUI-table.CUI-freeze-first-col thead th:first-child.CUI-hint-header-left`）叠加样式

- **修改文件范围**:
  - `src/modules/js/table.js`（v0.9.7 → v0.9.8）
  - `src/modules/css/table.css`（v0.9.7 → v0.9.8）
- **状态**: 提示列冻结逻辑重构完成，提示列现在通过 `:first-child`/`:last-child` 复用冻结样式。

### [2026-07-21 表格提示列触发机制修复 (v0.9.9)]
- **操作人**: Trae
- **操作内容**: 
  1. **替换 IntersectionObserver 为 scroll 事件监听**（`table.js`）：
     - 删除 `_initHintObserver` 中的 IntersectionObserver 实现
     - 改为监听 `scrollContainer` 的 `scroll` 事件
     - 使用 `scrollLeft` 值判断是否显示提示列

  2. **触发逻辑**：
     - **左侧提示列**: `scrollLeft > 30` 时显示
     - **右侧提示列**: `maxScroll - scrollLeft > 30` 时显示
     - 30px 为触发阈值

  3. **销毁逻辑**：
     - 在 `_destroyHintObserver` 中移除 scroll 事件监听

- **问题说明**:
  - IntersectionObserver 无法正确检测 sticky 定位元素的可见性变化
  - 当表头单元格使用 `position: sticky` 时，滚动时单元格保持在容器内，`isIntersecting` 始终为 `true`
  - 导致提示列永远不会显示（`CUI-hint-left-visible` 类无法添加）
  - 解决方案：直接监听容器的 `scroll` 事件，通过 `scrollLeft` 值判断触发时机

- **修改文件范围**:
  - `src/modules/js/table.js`（v0.9.8 → v0.9.9）
- **状态**: 提示列触发机制修复完成，现在通过 scroll 事件正确显示/隐藏。

### [2026-07-21 表格提示列观察目标修复 (v0.10.0)]
- **操作人**: Trae
- **操作内容**: 
  1. **恢复 IntersectionObserver 方案**（`table.js`）：
     - 移除 scroll 事件监听，恢复使用 IntersectionObserver
     - 保持与用户代码低冲突的设计原则

  2. **修正观察目标选择**（`table.js`）：
     - **左侧观察目标**: `headerRow.querySelectorAll('th:not(.CUI-hint-header-left):not(.CUI-hint-header-right)')[0]`
       - 排除提示列占位符
       - 取第一个数据列的表头单元格（ID 列）— 会滚动的单元格
     - **右侧观察目标**: `headerRow.querySelectorAll('th:not(.CUI-hint-header-left):not(.CUI-hint-header-right)')[length - 1]`
       - 排除提示列占位符
       - 取最后一个数据列的表头单元格

  3. **触发逻辑**:
     - 当观察目标（会滚动的单元格）移出可视区域时，显示提示列
     - `rootMargin: '0px 0px 0px -30px'` — 左侧触发阈值30px
     - `rootMargin: '0px -30px 0px 0px'` — 右侧触发阈值30px

- **问题说明**:
  - 之前错误地观察了冻结的提示列占位符（第一列），它使用 `position: sticky`，滚动时位置不动，`isIntersecting` 始终为 `true`
  - 正确的观察目标是**第二个单元格**（ID 列），它不会冻结，会随着滚动移出可视区域
  - 当 ID 列移出可视区域时，说明用户需要看到左侧提示列

- **修改文件范围**:
  - `src/modules/js/table.js`（v0.9.9 → v0.10.0）
- **状态**: 观察目标修复完成，现在正确观察会滚动的数据列表头单元格。

### [2026-07-21 表格提示列简化与列宽API完善 (v0.10.1)]
- **操作人**: Trae
- **操作内容**: 
  1. **提示列简化为始终显示**（`table.js`）：
     - 移除 IntersectionObserver 观察器逻辑
     - 移除 scroll 事件监听
     - 提示列在高级模式下始终显示，不再做开关控制
     - 移除 `CUI-hint-left-visible` / `CUI-hint-right-visible` CSS 类

  2. **提示列宽度改为固定宽度**（`table.js`, `table.css`）：
     - 默认宽度：80px
     - 用户可自定义：`data-frozen-left-width` 和 `data-frozen-right-width`（40-120px）
     - 移除 Canvas 动态宽度计算逻辑，改为直接设置 CSS width
     - 使用 `_setHintColumnWidths()` 方法应用配置宽度

  3. **提示列表头纵向合并**（`table.js`）：
     - 使用 `rowspan` 属性合并多级表头的提示列单元格
     - 只在第一行添加一个单元格，设置 `rowspan` 为表头行数
     - 单列表头 `rowspan="1"`（无实际合并效果），多级表头自动合并
     - 左侧和右侧提示列均采用此方案

  4. **新增公共 API**（`table.js`）：
     - `setHintColumnWidth(tableId, direction, width)` — 修改提示列宽度
     - `setColumnWidth(tableId, columnIndex, width)` — 修改任意列宽度（通过内联样式）

  5. **测试用例更新**（`test/table/index.html`）：
     - 添加测试用例 11：自定义提示列宽度测试

- **修改文件范围**:
  - `src/modules/js/table.js`（v0.10.0 → v0.10.1）
  - `src/modules/css/table.css`
  - `src/test/table/index.html`
- **状态**: 提示列功能简化完成，宽度接口完善，多级表头合并处理正确。

### [2026-07-21 表格 tfoot 冻结修复 (v0.10.2)]
- **操作人**: Trae
- **操作内容**: 
  1. **修复 tfoot 冻结失效问题**（`table.css`）：
     - 将 `position: sticky` 定位从 `tfoot` 元素本身改为 `tfoot tr`，但发现仍然无效
     - 最终确认 `tfoot` 元素本身使用 `position: sticky` + `bottom: 0` 即可正常工作
     - 关键是确保 `tfoot` 有内容（行和单元格），否则 sticky 定位无法生效
     - CSS 规则：`.CUI-table.CUI-freeze-footer tfoot { position: sticky; bottom: 0; z-index: 12; background-color: var(--bg-gray); }`

  2. **tfoot 内容生成**（`table.js`）：
     - `_renderFooter` 方法确保动态创建 footer 行和单元格
     - 支持提示列（高级模式）在 tfoot 中生成对应的占位单元格
     - 计算汇总值（`data-summary` 属性）并填充到对应列
     - 确保列数与 thead/tbody 一致

- **问题说明**:
  - tfoot 冻结失效的根本原因是 `tfoot` 元素没有内容（空的），导致 `position: sticky` 无法产生视觉效果
  - 修复后 tfoot 会随滚动粘在容器底部，所有汇总值和提示列正确渲染

- **修改文件范围**:
  - `src/modules/css/table.css`（v0.10.1 → v0.10.2）
  - `src/modules/js/table.js`（v0.10.1 → v0.10.2）
- **验证**: 
  - 测试用例 2（表头+表尾+首列+尾列）：tfoot 正确冻结在底部
  - 测试用例 8（提示列+表尾冻结）：tfoot 正确冻结，提示列显示正常
  - 滚动测试确认 tfoot 在滚动过程中保持在容器底部
- **状态**: tfoot 冻结功能修复完成，所有测试用例通过。

### [2026-07-25 表格表头与表尾列数不一致修复 (v0.10.3)]
- **操作人**: Trae
- **操作内容**: 
  1. **修复 tfoot 列数计算错误**（`table.js`）：
     - 问题：`_renderFooter` 中 `totalCols` 计算为 `headers.length + leftFields.length + rightFields.length`
     - 但提示列是将多个字段合并到**一列**中显示（用 " · " 分隔），而不是为每个字段创建一列
     - 修复：`totalCols = headers.length + (leftFields.length > 0 ? 1 : 0) + (rightFields.length > 0 ? 1 : 0)`
     - 即：有左侧提示列时加1列，有右侧提示列时加1列

  2. **简化 tfoot 单元格创建逻辑**（`table.js`）：
     - 直接清空 tfoot 并重新创建所有单元格，避免残留单元格导致数量不一致
     - 使用 `tfoot.innerHTML = ''` 清空，然后 for 循环创建新单元格

- **问题说明**:
  - 用户标记测试用例8的表格右侧有多余空白，表头和表尾不一致
  - 根因：提示列有2个字段（ID、姓名），但 `leftFields.length = 2` 被错误地加到总列数中，导致 tfoot 多了一列
  - 实际：提示列只有一列，只是内容合并了多个字段的信息

- **修改文件范围**:
  - `src/modules/js/table.js`（v0.10.2 → v0.10.3）
- **验证**: 
  - 测试用例1-11 全部通过：thead 与 tfoot 列数一致，宽度一致
  - 测试用例7（多级表头+提示列）：验证 rowspan 合并后总列数一致
  - 测试用例8（提示列+表尾冻结）：右侧空白消失，表头表尾对齐
- **状态**: 表头与表尾列数不一致问题修复完成。

### [2026-07-29 表格 tfoot 背景缝隙修复 (v0.10.4)]
- **操作人**: Trae
- **操作内容**: 
  1. **修复 thead/tbody/tfoot display 属性**（`table.css`）：
     - 问题：所有分区都被统一设置为 `display: table-header-group`
     - 修复：thead 使用 `table-header-group`，tbody 使用 `table-row-group`，tfoot 使用 `table-footer-group`
     - 这样可以确保 sticky 定位在不同浏览器中更可靠

  2. **给冻结的 thead/tfoot tr 添加背景色**（`table.css`）：
     - 问题：tfoot 作为一个整体冻结时，单元格之间的背景色不能完全覆盖，导致滚动内容透过缝隙显示
     - 修复：添加 `.CUI-table.CUI-freeze-footer tfoot tr { background-color: var(--bg-gray); }`
     - 同样给 thead 添加相同规则：`.CUI-table.CUI-freeze-header thead tr { background-color: var(--bg-gray); }`
     - 这样 tr 元素本身也有背景色，填充 td/th 之间的缝隙

  3. **移除容器内表格的底部 margin**（`table.css`）：
     - 问题：`.CUI-table` 在 `components.css` 中默认有 `margin-bottom: var(--size-lg)`（约24px）
     - 这导致表格底部有额外空间，使 tfoot sticky 定位时无法粘在容器底部
     - 修复：添加 `.CUI-table-container .CUI-table { margin-bottom: 0; }` 覆盖默认样式

- **问题说明**:
  - 用户报告 tfoot 作为整体冻结时有缝隙，滚动内容会透过缝隙显示
  - 根因1：tr 元素没有背景色，td/th 之间的边框位置出现透明缝隙
  - 根因2：表格底部有 24px margin，增加了滚动高度，导致 tfoot 无法到达容器底部
  - 根因3：tfoot display 属性错误地使用了 `table-header-group`

- **修改文件范围**:
  - `src/modules/css/table.css`（v0.10.3 → v0.10.4）
- **验证**: 
  - 测试用例 2（简单冻结表头+表尾）：tfoot 正确粘在容器底部，无间隙
  - 测试用例 7（多级表头+提示列）：无 tfoot 冻结时正常显示
  - 测试用例 8（提示列+表尾冻结）：tfoot 正确粘在底部，背景色完全覆盖
  - 所有测试用例：滚动时 tfoot 背景无穿透现象
### [2026-07-29 表格 tfoot 下方缝隙修复 (v0.10.5)]
- **操作人**: Trae
- **操作内容**: 
  1. **调整 tfoot sticky bottom 值**（`table.css`）：
     - 将 `bottom: 0` 改为 `bottom: -3px`，向下延伸 3px
     - 确保 tfoot 在粘住时能覆盖容器底部的子像素间隙
     
  2. **添加 tfoot 伪元素延伸背景**（`table.css`）：
     - 添加 `tfoot::after` 伪元素，`bottom: -3px` + `height: 3px`
     - 在 tfoot 底部下方再延伸 3px 背景色
     - 总覆盖 6px，确保在子像素渲染误差下仍无间隙
     
  3. **移除容器底部边框**（`table.css`）：
     - 添加 `.CUI-table-container.CUI-container-freeze-footer { border-bottom: none; }`
     - 避免边框引起的视觉间隙
     
  4. **JS 动态设置表格 margin-bottom**（`table.js`）：
     - 当启用表尾冻结时，给表格添加 `this.element.style.marginBottom = '3px'`
     - 确保滚到底部时 tfoot 仍能保持在容器底部附近
     - 移除冻结时清除 marginBottom
     
- **问题说明**:
  - 用户报告 tfoot 下方出现缝隙，滚动时可以看到背后的内容
  - 根因1：tfoot 的 `bottom: 0` 在子像素渲染时可能产生间隙
  - 根因2：表格滚到底部时，tfoot 不再 sticky，位置由表格内容决定，与容器底部产生间隙
  - 解决方案：双重保险机制
    - tfoot 粘住时：`bottom: -3px` + 伪元素 `bottom: -3px` 共延伸 6px
    - 表格滚到底部时：表格 `marginBottom: 3px` 确保 tfoot 仍在容器底部附近

- **修改文件范围**:
  - `src/modules/css/table.css`（v0.10.4 → v0.10.5）
  - `src/modules/js/table.js`（v0.10.4 → v0.10.5）
  
- **验证**: 
  - 测试用例 2（简单冻结表头+表尾）：
    - 非底部位置：gap = -6px（有 6px 重叠，确保无间隙）
    - 底部位置：gap = 0px（无间隙）
  - 测试用例 8（提示列+表尾冻结）：
    - 非底部位置：gap = -6px（有 6px 重叠）
    - 底部位置：gap = 0px（无间隙）
  - 所有滚动位置均无间隙

- **状态**: tfoot 下方缝隙问题修复完成。

### [2026-07-29] 表格自动汇总功能实现 (v0.11.0)
- **操作人**: Trae
- **操作内容**: 
  1. **实现自动汇总功能**（`table.js`）：
     - 添加 `_isSummaryEnabled(header)` 方法：自动识别可汇总列
       - `data-summary="enable"` → 强制启用
       - `data-summary="none"` → 强制排除
       - `data-type` 为 number/currency → 默认启用
       - 其他类型 → 默认排除
     - 添加 `_getSummaryOptions(type)` 方法：获取支持的汇总方式
       - 数字/货币类型：求和、平均值、最大值、最小值、计数
       - 其他类型：计数、最大值、最小值
     - 添加 `_calculateSummary(values, type, method)` 方法：计算汇总值
     - 添加 `_updateSummaryCell(cell, header, data)` 方法：更新单元格显示
     - 添加 `_createSummarySelect(field, type, currentMethod)` 方法：创建下拉选择器
     - 添加 `_bindSummaryEvents()` 方法：绑定汇总切换事件
     
  2. **修改 `_renderFooter` 方法**（`table.js`）：
     - 自动识别可汇总列并添加下拉选择器 UI
     - 汇总值基于 `filteredData`（筛选后的全量数据）
     - 用户自定义内容优先级最高
     
  3. **添加汇总相关 CSS 样式**（`table.css`）：
     - `.CUI-summary-wrapper`: 汇总内容包装器（flex 列布局）
     - `.CUI-summary-select`: 下拉选择器样式
     - `.CUI-summary-value`: 汇总值显示样式
     - `.CUI-summary-empty`: 空值占位样式
     - 数字/货币类型右对齐

- **设计决策**:
  - 采用方案二（自动汇总）为主，方案一（data-summary 属性）为辅
  - 零配置、开箱即用，符合"极简"设计理念
  - 数字/货币类型默认启用汇总，其他类型默认排除
  - 用户可通过 `data-summary="enable"` 强制启用或 `data-summary="none"` 强制排除
  - 汇总值基于 filteredData（筛选后全量），而非当前页数据
  - 支持 5 种汇总方式：求和、平均值、最大值、最小值、计数

- **修改文件范围**:
  - `src/modules/js/table.js`（v0.10.5 → v0.11.0）
  - `src/modules/css/table.css`（v0.10.5 → v0.11.0）
  - `package.json`（版本号更新至 0.11.0）
  
- **验证**: 
  - 测试用例 2：3 个可汇总列（ID、年龄、薪资）正确识别
  - 汇总计算正确：sum=11325, avg=76, max=150, min=1, count=150
  - 切换功能正常：切换下拉选择器后实时更新汇总值
  - 筛选后数据基于 filteredData（150条），非当前页（50条）
  
- **修复** (2026-07-29):
  1. **Bug修复 - 事件重复绑定**: 
     - 问题：`_bindSummaryEvents` 中每次都重置 `this._summaryBound = false`，导致每次渲染都重复绑定 change 事件
     - 修复：移除 `this._summaryBound = false` 行，保持事件委托只绑定一次
     - 原因：监听器在 tfoot 元素上，不在子元素上，`innerHTML` 清除子元素不影响 tfoot 上的监听器
     
  2. **改进 - avg 精度显示**:
     - 问题：avg 汇总值使用 number 类型默认 decimals=0，导致 75.5 显示为 76
     - 修复：在 `_updateSummaryCell` 方法中，为 avg 汇总方法强制设置 decimals=2
     - 结果：avg 值现在显示为 75.50（保留 2 位小数）

- **改进** (2026-07-29):
  3. **统计口径调整 - 基于当前页数据**:
     - **问题**：之前汇总统计基于 `filteredData`（筛选后全量），在分页场景下与表体显示的当前页数据不一致，违反「所见即所得」的直觉
     - **决策**：常规功能改为基于当前展示数据（策略 C），全量统计作为未来插件扩展
     - **修改文件**：`src/modules/js/table.js`
     - **修改点 1**：`_renderFooter` 方法，将 `const data = entry.filteredData` 改为 `const { data } = this.dataLayer.paginate(this.tableId)`
     - **修改点 2**：`_bindSummaryEvents` 方法，切换汇总方式时同样使用 `this.dataLayer.paginate(this.tableId)` 获取当前页数据
     - **验证结果**：
       - 第1页 ID 列 sum：1275（1+2+...+50）✅
       - 第1页 ID 列 count：50 ✅
       - 第1页 ID 列 avg：25.50 ✅
       - 汇总值随翻页自动更新（由 page 事件驱动）✅

- **改进** (2026-07-29):
  4. **汇总 UI 改为三角形角标样式**:
     - **需求**：将传统的下拉选择器改为贴在单元格右上角的三角形小角标
     - **设计**：
       - 使用 CSS `border` 技巧创建三角形背景
       - 角标上显示 3 个字母的英文缩写（SUM、AVG、MAX、MIN、CNT）
       - 点击角标弹出菜单供用户切换汇总方式
     - **修改文件**：`src/modules/css/table.css`、`src/modules/js/table.js`
     - **新增 CSS 类**：
       - `.CUI-summary-badge`: 角标容器（绝对定位，贴在右上角）
       - `.CUI-summary-badge::before`: 三角形背景
       - `.CUI-summary-badge-label`: 角标文字
       - `.CUI-summary-popup`: 弹窗容器（带淡入动画）
       - `.CUI-summary-popup-item`: 弹窗选项
       - `.CUI-summary-popup-active`: 当前选中状态
     - **新增 JS 方法**：
       - `_getSummaryAbbr(method)`: 获取汇总方式的英文缩写
     - **修改方法**：
       - `_createSummarySelect()`: 创建三角形角标而非 select 元素
       - `_bindSummaryEvents()`: 改为处理 click 事件，实现弹窗交互
     - **验证结果**：
       - 所有表格的汇总角标正常显示 ✅
       - 点击角标弹出选项菜单 ✅
       - 点击选项切换汇总方式并更新角标文字 ✅
       - 弹窗自动关闭 ✅

5. **添加数据表格开关** (2026-07-29):
   - **需求**：区分数据表格和样式表格，纯样式表格不应被 JS 重写
   - **设计**：使用 `data-CUI-dataTable="true"` 作为数据表格开关
   - **规则**：
     - 只有 `data-CUI-dataTable="true"` 的表格才会被 JS 初始化
     - 其他带 `CUI-table` 类的表格只应用 CSS 样式，不动 DOM
     - 避免用户手动绑定的 data 属性被误识别
   - **修改文件**：`src/modules/js/table.js`
   - **修改方法**：`_shouldSkip()` 添加开关检测
   - **测试页面**：`src/test/table/index.html` 所有表格已添加开关
   - **验证结果**：
     - 有开关的表格正常初始化、显示角标 ✅
     - 无开关的纯样式表格保持原始 DOM 结构 ✅
     - 用户手动添加的 `<select>` 等元素完好无损 ✅

6. **框架 data 属性统一为 data-CUI 前缀** (2026-07-29):
   - **需求**：将所有框架 data 属性统一为 `data-CUI` 开头，避免与用户自定义属性冲突
   - **表格配置汇总**：
     - `<table>` 上只保留 `data-CUI-dataTable="true"` 开关 + `data-CUI-config='{...}'` JSON 参数
     - 旧的 `data-cui-table`、`data-freeze-*`、`data-frozen-*`、`data-merge-cells`、`data-data-source`、`data-striped` 全部合并到 config JSON 的 `freeze` 对象中
   - **属性名统一**（全部加 data-CUI 前缀）：
     - 表头 th：`data-field` → `data-CUI-field`、`data-type` → `data-CUI-type`、`data-summary` → `data-CUI-summary`
     - 运行时标记：`data-table-init` → `data-CUI-table-init`、`data-row-id` → `data-CUI-row-id` 等
     - form 模块：`data-form-cols` → `data-CUI-form-cols`、`data-label-position` → `data-CUI-label-position`
     - status 模块：`data-type` → `data-CUI-type`、`data-symbol` → `data-CUI-symbol`、`data-flash` → `data-CUI-flash`
     - input 模块：`data-cui-color-picker` → `data-CUI-color-picker`、`data-validate` → `data-CUI-validate`
     - idcard-validator 模块：`data-validate` → `data-CUI-validate`
   - **汇总下拉菜单样式改造**：
     - 放弃三角形角标 + 弹窗方案
     - 改回原生 `<select>` 元素，应用 `user-test-table.html` 中的旋转 select 样式
     - CSS：旋转 -90°、灰色背景、白色文字、缩放 0.75
     - JS：改回监听 `change` 事件
   - **修改文件**：
     - `src/modules/js/table.js` - 配置解析重构、属性名统一、汇总逻辑
     - `src/modules/css/table.css` - CSS 选择器统一、汇总 select 样式
     - `src/modules/css/form.css` - CSS 选择器统一
     - `src/modules/css/status.css` - CSS 选择器统一
     - `src/modules/js/input.js` - dataset 属性名统一
     - `src/modules/js/idcard-validator.js` - dataset 和选择器统一
     - `src/modules/js/progress.js` - dataset 属性名统一（修复了进度条类型功能失效）
     - `src/test/table/index.html`、`src/test/table/simple-test.html`、`src/test/user-test.html` - 配置合并到 JSON
     - 所有手册页 HTML - data 属性名统一
   - **验证结果**：
     - 11 个表格测试用例全部正常初始化 ✅
     - 汇总下拉菜单显示为旋转 select 样式 ✅
     - 冻结功能正常 ✅
     - 无 JavaScript 控制台错误 ✅

- **状态**: 框架 data 属性统一完成，配置汇总到 JSON，汇总下拉菜单改为旋转 select 样式。

### [2026-08-09]
- **操作人**: Trae
- **操作内容**:
  1. **加载遮罩重构为独立单例组件**：
     - 将遮罩从 `render()` 方法中分离，封装为 `CUI.loadingOverlay` 独立单例，任何组件均可调用。
     - `render()` 不再包含 show/hide 逻辑，只负责纯渲染。
     - 遮罩调用移至外部：`_scheduleUpdate()` 和 `_initializeSuccess()` 在 `render()` 前后分别调用 `show()`/`hide()`。
     - 增加 `_visible` 状态标记：已打开时再次 `show()` 直接返回，已关闭时再次 `hide()` 直接返回，确保单一遮罩不重复创建。
  2. **修改文件范围**：
     - `src/modules/js/table.js` — 遮罩重构为独立单例、`render()` 移除遮罩逻辑、`_scheduleUpdate()` 和 `_initializeSuccess()` 外部分别调用 show/hide
- **状态**: 遮罩组件已封装为独立可复用的单例，任何组件均可通过 `CUI.loadingOverlay.show(container)` / `CUI.loadingOverlay.hide()` 使用。