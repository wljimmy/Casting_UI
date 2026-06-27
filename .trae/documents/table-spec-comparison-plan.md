# 表格模块：Spec 对比与后续工作计划

## 一、对比结论总览

### 1.1 已实现且符合 Spec（核心功能完备）

| Spec 章节 | 要求 | 实现位置 | 状态 |
|-----------|------|----------|------|
| §2 分层架构 | 数据层/渲染层/初始化模块三层隔离 | table.js 四类分工 | ✅ |
| §3.1 数据量阈值 | 5000 行截断 + console.warn | `TableDataLayer.MAX_DATA_ROWS` | ✅ |
| §3.2 规则上限 | filter/sort 各 10 条，超量拒绝 | `CUITableRegistry.addFilterRule/addSortRule` | ✅ |
| §3.3 防抖 | 500ms | `TableRenderLayer._scheduleUpdate` | ✅ |
| §3.4 错误展示 | 仅控制台，零页面 UI 错误 | 全局 console.error | ✅ |
| §4 生命周期 GC | DOM 移除 → 注册表销毁 | `domObserver.onRemove` | ✅ |
| §5 远程数据源 | 原生 Fetch，仅 JSON/CSV | `TableInit._loadRemoteData` | ✅ |
| §6 注册表结构 | 全字段含 searchRules/pageState | `CUITableRegistry.register` | ✅ |
| §7.1 局部热更新 | 仅替换 tbody，保留冻结/滚动 | `_partialUpdate` | ✅ |
| §7.2 全量重建 | 表头变更时重建 | `headerHash` 判定 → `_fullRebuild` | ✅ |
| §8.1 初始化模块 | 扫描/双向跳过/四状态机 | `TableInit.scanAndInit/_shouldSkip` | ✅ |
| §8.2 数据处理 | 清洗/标准化/空值补全/超量拦截 | `TableDataLayer.processRawData` | ✅ |
| §8.3 排序筛选搜索 | 堆叠/全量重算/搜索→筛选→排序 | `TableDataLayer.recalculate` | ✅ |
| §8.4 分页模块 | 纯数据裁切 | `TableDataLayer.paginate` | ✅ |
| §8.5 分页器生成 | 内部调用生成配置 | `TableRenderLayer._updatePagination` | ✅ |
| §8.6 渲染模块 | 只读注册表，仅渲染 success | `TableRenderLayer` | ✅ |
| §8.7 用户数据更新 | updateData API | `Table.updateData` | ✅ |
| §9 规则堆叠 | 纯堆叠/全量重算/固定顺序 | `recalculate` | ✅ |

**结论：Spec 的 18 项核心要求均已实现，架构主线完整。**

---

### 1.2 超越 Spec 的增强实现（我们做了更好的方案）

| 增强项 | 说明 | Spec 是否提及 |
|--------|------|--------------|
| **Flex 布局行高控制** | `tr:display:flex` + `td:display:block` 实现 `max-height` 生效；`CUI-table-autoheight` 类释放限制 | ❌ Spec 未涉及 |
| **敏感数据脱敏掩码** | id/idcard/phone/password 类型自动掩码，CSS `::before` + `data-masked` 实现，hover 显色 | ❌ Spec 未涉及 |
| **按数据类型列宽** | 12 种 data-type 对应默认 width/min-width，配合 flex 布局 | ❌ Spec 未涉及 |
| **多方向冻结 + 黄金交角** | header/footer/first-col/last-col sticky，交角 z-index=13 最高优先级 | ⚠️ Spec 仅提"冻结由CSS完成" |
| **单元格类型化渲染** | currency（符号+千分位）、email（mailto）、link（target=_blank）、image（40x40） | ❌ Spec 未涉及 |
| **可编辑单元格** | contenteditable + `updateCell` API 实时同步注册表 | ❌ Spec 未涉及 |
| **汇总行计算** | data-summary 支持 sum/count/max/min/avg，区分 number/currency/date | ❌ Spec 未涉及 |

---

### 1.3 存在差距需修复的问题

| # | Spec 要求 | 当前问题 | 严重度 |
|---|----------|----------|--------|
| **G1** | §8.1.2 初始化失败"保留完整原始 Table DOM 结构" | `initWrapper` 在初始化早期就改造 DOM（创建容器、补 thead/tbody），远程加载失败时原始 DOM 已被改动 | 🔴 高 |
| **G2** | §3.3 "支持配置开启长防抖：1000ms" | 仅实现 500ms 固定防抖，无 1000ms 配置入口 | 🟡 中 |
| **G3** | §8.1.1 loading 加锁"禁止所有监听与重复初始化" | `_shouldSkip` 仅检查 `finish` 和 `error`，不检查 `loading`，理论上可重入 | 🟡 中 |
| **G4** | §5 CSV 格式规范 | `_parseCSV` 是简单 `split(',')`，不支持字段内逗号/引号转义 | 🟡 中 |
| **G5** | — | `table-data-parser.js` 是死代码（未被 import），含更完善的 CSV 解析和清洗逻辑但闲置 | 🟡 中 |
| **G6** | — | `table-registry.test.js` 引用已删除的 `table-registry.js`，测试失效 | 🟢 低 |
| **G7** | — | `Table.tables` Map（第 1136 行）声明后未使用，是死代码 | 🟢 低 |
| **G8** | §8.1.2 "保留原始 tbody 内容" | `_extractDataFromDOM` 提取数据后清空 tbody，若后续 `processRawData` 失败，tbody 已空 | 🔴 高 |

---

## 二、修复方案与实施计划

### 阶段 1：修复初始化容错降级（G1 + G8）— 最高优先级

**问题本质**：当前时序是 `initWrapper(改造DOM) → 加载数据 → 失败则保留已改造的DOM`，违反 Spec 的"失败时保留原始完整 Table DOM"。

**修复方案**：调整初始化时序为「先加载数据，成功后再改造 DOM」：

```
原时序：register → setStatus(loading) → initWrapper(改造DOM) → 加载数据 → 成功/失败
新时序：register → setStatus(loading) → 提取headers → 加载数据 → 成功→initWrapper+渲染 / 失败→不动DOM
```

**修改文件**：`src/modules/js/table.js`
- `TableInit.initTable`：将 `initWrapper` 调用移到 `_initializeSuccess` 中
- `_initializeSuccess`：成功后才创建容器、清理 DOM、标记 finish
- `_initializeError`：确保不做任何 DOM 操作

**验证**：模拟远程加载失败，检查原始 `<table>` 结构是否完整保留

---

### 阶段 2：修复 loading 加锁防重入（G3）

**修改文件**：`src/modules/js/table.js`
- `TableInit._shouldSkip`：增加第三条判定 —— 注册表 `initStatus === 'loading'` 时跳过

**验证**：短时间内重复调用 `scanAndInit`，确认 loading 状态表格不被重复初始化

---

### 阶段 3：整合 table-data-parser.js 的成熟解析能力（G4 + G5）

**方案**：将 `table-data-parser.js` 中有价值的逻辑合并进 `table.js`，然后删除孤立文件。

**合并内容**：
1. `CSVParser.parseCSVLine` 的引号转义逻辑 → 替换 `TableInit._parseCSV`
2. `TableDataParser.cleanAndAlignData` 的超列报错逻辑 → 增强 `TableDataLayer._cleanAndAlignData`

**修改文件**：
- `src/modules/js/table.js`：增强 `_parseCSV` 和 `_cleanAndAlignData`
- 删除 `src/modules/js/table-data-parser.js`

**验证**：用含逗号的 CSV 测试数据验证引号转义；用超列数据验证报错

---

### 阶段 4：支持长防抖配置（G2）

**修改文件**：`src/modules/js/table.js` + `src/modules/css/table.css`（无 CSS 改动）
- `TableRenderLayer` 构造函数：从 `data-cui-table` 配置读取 `longDebounce` 选项
- `_scheduleUpdate`：根据配置选择 500ms 或 1000ms

**使用方式**：`data-cui-table='{"longDebounce":true}'`

**验证**：配置 longDebounce 后，防抖时间从 500ms 变为 1000ms

---

### 阶段 5：清理死代码（G6 + G7）

**修改文件**：
- 删除 `src/test/table-registry.test.js`（引用已删除文件，已失效）
- `src/modules/js/table.js`：删除 `Table.tables` Map 及相关引用

---

### 阶段 6：更新测试页面与测试用例

**修改文件**：
- `src/test/table/index.html`：确认容错降级场景（可加一个错误数据源测试表格）
- `src/test/table/test-table-modules.js`：补充 CSV 引号转义测试、loading 加锁测试、超列报错测试

---

## 三、不修改项（已优于 Spec，保持现状）

以下能力超出了 Spec 要求但已稳定运行，不做改动：

1. **Flex 布局行高控制** + `CUI-table-autoheight` — 保持
2. **敏感数据脱敏掩码** — 保持
3. **按数据类型列宽规则** — 保持
4. **多方向冻结 + 黄金交角 z-index** — 保持
5. **单元格类型化渲染**（currency/email/link/image）— 保持
6. **可编辑单元格 + updateCell** — 保持
7. **汇总行计算**（sum/count/max/min/avg）— 保持

---

## 四、验证清单

- [ ] 远程加载失败时，原始 `<table>` DOM 结构完整保留
- [ ] loading 状态表格不被重复初始化
- [ ] CSV 字段内逗号正确解析（引号转义）
- [ ] 超列数据触发 console 报错
- [ ] `longDebounce:true` 配置后防抖为 1000ms
- [ ] `table-data-parser.js` 已删除，无 import 引用
- [ ] `table-registry.test.js` 已删除
- [ ] `Table.tables` 死代码已清除
- [ ] Node 单元测试全部通过
- [ ] 测试页面正常渲染
