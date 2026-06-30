# 表格工具栏与底栏功能增强计划

## Context

当前表格模块（v0.8.2）的工具栏仅有搜索框，底栏状态条仅显示条数信息，功能单薄。用户需要：
1. **头部功能条**增加"导出数据"和"筛选"按钮，提升数据处理能力
2. **底部状态条**增加当前排序和筛选条件的可视化展示，让用户直观看到当前数据视图的过滤状态，并支持单独清除
3. **修复"每页 [select] 条"换行问题**——三个独立元素在窄屏下会被拆行

数据层已具备完整的 filterRules/sortRules 机制（`=`/`!=`/`>`/`<`/`>=`/`<=`/`contains` 操作符），但缺乏 UI 入口让用户可视化操作。本次增强打通"数据层 → UI 入口 → 状态反馈"的完整链路。

## 实现方案

### 1. 工具栏按钮（`_injectToolbar`，[table.js](file:///Users/wanglin/工作_本地/trae/Casting_UI/src/modules/js/table.js) L886-912）

在现有 `.CUI-table-toolbar-right`（当前为空）中注入两个按钮：
```html
<button class="CUI-btn CUI-btn-sm CUI-btn-secondary CUI-table-filter-btn">筛选</button>
<button class="CUI-btn CUI-btn-sm CUI-btn-secondary CUI-table-export-btn">导出</button>
```
事件用直接 `addEventListener`（与搜索框、分页按钮一致，属自定义业务逻辑）。按钮放在右侧，搜索框留在左侧。

### 2. 导出 CSV（新增 `_exportCSV` 方法）

- 数据源：`entry.filteredData`（全量筛选后数据，非当前页）+ `entry.header`
- 格式：UTF-8 with BOM（`\uFEFF` 前缀，确保 Excel 正确识别中文）
- 转义：字段内含逗号/引号用双引号包裹，内部双引号转义为 `""`（复用 `src/test/table/test-table-modules.js` 中已验证的 CSV 转义逻辑）
- 文件名：`{tableId}_{YYYYMMDD-HHmmss}.csv`
- 下载方式：`Blob` + `URL.createObjectURL` + 临时 `<a download>` 标签
- 空数据时 `alert` 提示"暂无数据可导出"

### 3. 筛选 Overlay 面板（新增 `_openFilterPanel` 方法）

复用框架 overlay 组件：`const ov = CUI.overlay({ type: 'glass' })`，注入 HTML 到 `ov.element`。

**面板结构**（用 `.CUI-modal-content` 居中容器，max-width 600px）：
```html
<div class="CUI-modal-content CUI-table-filter-panel">
  <div class="CUI-table-filter-header">
    <h3>数据筛选</h3>
    <button class="CUI-table-filter-close">×</button>
  </div>
  <!-- 已添加规则列表（每条带×删除） -->
  <div class="CUI-table-filter-rules"></div>
  <!-- 添加新规则表单 -->
  <div class="CUI-table-filter-form">
    <select class="CUI-select CUI-filter-field">字段下拉</select>
    <select class="CUI-select CUI-filter-op">操作符下拉</select>
    <input class="CUI-input CUI-filter-value" placeholder="筛选值">
    <button class="CUI-btn CUI-btn-sm CUI-btn-primary">添加</button>
  </div>
  <div class="CUI-table-filter-actions">
    <button class="CUI-btn CUI-btn-sm CUI-btn-text CUI-filter-clear-all">清空全部</button>
    <button class="CUI-btn CUI-btn-sm CUI-btn-secondary CUI-filter-close-btn">关闭</button>
  </div>
</div>
```

**交互逻辑**：
- 字段下拉从 `entry.header` 生成（`<option value="{field}">{label || field}</option>`）
- 操作符下拉：`=`/`!=`/`>`/`<`/`>=`/`<=`/`contains`（显示中文"等于/不等于/大于/小于/大于等于/小于等于/包含"）
- 添加规则：校验值非空 → `registry.addFilterRule(tableId, {field, operator, value})` → 刷新规则列表
- 已添加规则列表：每条显示"{字段} {操作符} {值}" + × 按钮，点 × 调用 `registry.removeFilterRule(tableId, index)`
- 清空全部：`registry.clearFilters(tableId)`
- 关闭：`ov.close()`（点遮罩或关闭按钮）
- 面板打开时从 `entry.filterRules` 回填已有规则列表

### 4. 底部状态条标签（修改 `_updatePagination`，table.js L823-826）

在 `.CUI-table-status-bar` 内，"显示 X-Y 条"后面追加排序和筛选条件标签：

```html
<div class="CUI-table-status-bar CUI-status CUI-status--info">
  <span>显示 ${startIdx}-${endIdx} 条 / 共 ${total} 条</span>
  <!-- 排序标签 -->
  <span class="CUI-badge CUI-badge-outline CUI-badge-secondary CUI-badge-closeable"
        data-sort-field="${rule.field}">
    ${fieldLabel} ${order === 'asc' ? '↑' : '↓'}
    <button class="CUI-badge-close">×</button>
  </span>
  <!-- 筛选标签 -->
  <span class="CUI-badge CUI-badge-outline CUI-badge-secondary CUI-badge-closeable"
        data-filter-index="${i}">
    ${fieldLabel} ${opLabel} ${value}
    <button class="CUI-badge-close">×</button>
  </span>
</div>
```

- 字段标签：从 `entry.header` 查找 `field` 对应的 `label`（fallback 到 field 名）
- 操作符中文映射：`=`→等于、`!=`→不等于、`>`→大于、`<`→小于、`>=`→≥、`<=`→≤、`contains`→包含
- 点排序标签 ×：`registry.removeSortRule(tableId, field)`
- 点筛选标签 ×：`registry.removeFilterRule(tableId, index)`
- 标签容器加 `flex-wrap: wrap` 允许多标签换行，`overflow-x: auto` 横向滚动兜底
- `_bindPaginationEvents` 中扩展：用事件委托监听 `.CUI-badge-close` 点击

### 5. Registry 新增 `removeFilterRule` API

参考 `removeSortRule`（[table.js](file:///Users/wanglin/工作_本地/trae/Casting_UI/src/modules/js/table.js) L144-155）实现：
```js
removeFilterRule(tableId, index) {
    const entry = this._store.get(tableId);
    if (!entry) return false;
    if (index < 0 || index >= entry.filterRules.length) return false;
    entry.filterRules.splice(index, 1);
    entry.updateTime = Date.now();
    this._store.set(tableId, entry);
    this._notify(tableId, 'filter');
    return true;
}
```

### 6. 修复"每页 [select] 条"换行（table.css）

`.CUI-pagination-size` 添加 `white-space: nowrap; flex-shrink: 0;`，确保"每页"+"下拉"+"条"作为整体不被拆行。同时给 `.CUI-table-pagination` 加 `flex-wrap: wrap` 作为窄屏兜底。

### 7. CSS 新增（table.css）

- `.CUI-table-filter-panel`：面板宽度/最大高度/滚动
- `.CUI-table-filter-header`：标题栏 flex 布局 + 关闭按钮绝对定位
- `.CUI-table-filter-rules`：规则列表，每条 flex + 间距 + × 按钮
- `.CUI-table-filter-form`：表单 flex + gap
- `.CUI-table-filter-actions`：底部按钮栏 flex + 右对齐
- `.CUI-table-status-bar` 扩展：`flex-wrap: wrap; gap`，标签间距
- `.CUI-pagination-size`：`white-space: nowrap; flex-shrink: 0`

## 修改文件

| 文件 | 改动 |
|------|------|
| [src/modules/js/table.js](file:///Users/wanglin/工作_本地/trae/Casting_UI/src/modules/js/table.js) | `_injectToolbar` 加按钮、新增 `_exportCSV`/`_openFilterPanel`/`_renderFilterRules`、`_updatePagination` 加标签、`_bindPaginationEvents` 扩展标签×事件、Registry 加 `removeFilterRule`、版本号 |
| [src/modules/css/table.css](file:///Users/wanglin/工作_本地/trae/Casting_UI/src/modules/css/table.css) | 筛选面板样式、状态条标签样式、`.CUI-pagination-size` nowrap、版本号 |
| [src/test/table/test-table-modules.js](file:///Users/wanglin/工作_本地/trae/Casting_UI/src/test/table/test-table-modules.js) | 内联副本同步 `removeFilterRule`，新增 CSV 转义 + removeFilterRule 测试用例 |

## 版本号

v0.8.2 → v0.9.0（功能新增，minor 版本升级）

## 验证

1. **Playwright 端到端验证**（访问 `http://localhost:5173/test/table/index.html`）：
   - 工具栏右侧出现"筛选""导出"两个按钮
   - 点"导出"：下载 CSV 文件，文件名含表名+时间戳，内容为全量筛选数据，Excel 打开中文不乱码
   - 点"筛选"：弹出 overlay 面板，添加"省份 = 北京"规则后表格数据筛选，状态条出现"省份 等于 北京"标签
   - 点状态条筛选标签 ×：该规则清除，标签消失，表格数据恢复
   - 排序：点表头排序后状态条出现"薪资 ↓"标签，点 × 取消排序
   - "每页 10 条"在窄屏下不换行（缩窗至 800px 验证）
2. **Node 单元测试**：`node src/test/table/test-table-modules.js` 保持 23+N 通过 / 0 失败
3. **回归**：列宽对齐不受影响（thead/tbody/tfoot 仍一致）
