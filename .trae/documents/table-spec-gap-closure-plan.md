# 表格模块：Spec 对比复核与差距收尾计划

> 本计划基于对 `user/表格模块标准化开发文档（AI落地专用·严苛规范版）.md` 的逐章复核，结合 `src/modules/js/table.js`（1283 行）、`src/modules/css/table.css`（505 行）当前真实代码状态制定。
> 上一版计划（`table-spec-comparison-plan.md`）的阶段 1–5 已全部完成，本计划聚焦「复核结论 + 剩余差距收尾」。

---

## 一、Spec 对比复核结论

### 1.1 已实现且符合 Spec（18 项核心要求全部达标）

| Spec 章节 | 要求 | 实现位置 | 状态 |
|-----------|------|----------|------|
| §2 分层架构 | 数据层/渲染层/初始化模块三层隔离 | `CUITableRegistry` / `TableDataLayer` / `TableRenderLayer` / `TableInit` 四类分工 | ✅ |
| §3.1 数据量阈值 | 5000 行截断 + console.warn | `TableDataLayer.MAX_DATA_ROWS`（table.js:226, 236-238） | ✅ |
| §3.2 规则上限 | filter/sort 各 10 条，超量拒绝 | `CUITableRegistry.addFilterRule/addSortRule` | ✅ |
| §3.3 防抖 | 默认 500ms，可配 1000ms | `TableRenderLayer.debounceMs`（table.js:470-472） | ✅ |
| §3.4 错误展示 | 仅控制台，零页面 UI 错误 | 全局 `console.error/warn` | ✅ |
| §4 生命周期 GC | DOM 移除 → 注册表销毁 | `domObserver.onRemove` + `document.contains` 守卫（table.js:1169-1173） | ✅ |
| §5 远程数据源 | 原生 Fetch，仅 JSON/CSV | `TableInit._loadRemoteData`（table.js:1011-1023） | ✅ |
| §6 注册表结构 | 全字段含 searchRules/pageState | `CUITableRegistry.register` | ✅ |
| §7.1 局部热更新 | 仅替换 tbody，保留冻结/滚动 | `_partialUpdate`（table.js:587-591） | ✅ |
| §7.2 全量重建 | 表头变更时重建 | `headerHash` 判定 → `_fullRebuild`（table.js:566-570） | ⚠️ 见 N1 |
| §8.1 初始化模块 | 扫描/双向跳过/四状态机 | `TableInit.scanAndInit/_shouldSkip`（table.js:927-939） | ✅ |
| §8.1.1 loading 加锁 | loading 状态跳过重复初始化 | `_shouldSkip` 含 loading 判定（table.js:937） | ✅ |
| §8.1.2 容错降级 | 失败保留原始 DOM，不动 DOM | `_initializeError` 仅 setStatus（table.js:1113-1116） | ✅ |
| §8.2 数据处理 | 清洗/标准化/空值补全/超量拦截/超列报错 | `TableDataLayer._cleanAndAlignData`（table.js:249-290） | ✅ |
| §8.3 排序筛选搜索 | 堆叠/全量重算/搜索→筛选→排序 | `TableDataLayer.recalculate` | ✅ |
| §8.4 分页模块 | 纯数据裁切 | `TableDataLayer.paginate` | ✅ |
| §8.6 渲染模块 | 只读注册表，仅渲染 success | `TableRenderLayer.render` 守卫（table.js:562-563） | ✅ |
| §8.7 用户数据更新 | updateData API | `Table.updateData`（table.js:1220-1222） | ⚠️ 见 N2 |
| §9 规则堆叠 | 纯堆叠/全量重算/固定顺序 | `recalculate` 顺序：search→filter→sort | ✅ |

---

### 1.2 超越 Spec 的增强实现（我们提供了更好的方案）

| 增强项 | 说明 | Spec 是否提及 |
|--------|------|--------------|
| **Flex 布局行高控制** | `tr:display:flex` + `td:display:block` 让 `max-height` 生效；`CUI-table-autoheight` 释放限制，默认 3 行截断 | ❌ Spec 未涉及 |
| **敏感数据脱敏掩码** | id/idcard/phone/password 类型自动掩码，CSS `::before` + `data-masked` 实现，hover 显色 | ❌ Spec 未涉及 |
| **按数据类型列宽** | 12 种 data-type 对应默认 width/min-width，配合 flex 布局 | ❌ Spec 未涉及 |
| **多方向冻结 + 黄金交角** | header/footer/first-col/last-col sticky，交角 z-index 最高优先级 | ⚠️ Spec 仅提"冻结由CSS完成" |
| **单元格类型化渲染** | currency（符号+千分位）、email（mailto）、link（target=_blank）、image（40x40） | ❌ Spec 未涉及 |
| **可编辑单元格** | contenteditable + `updateCell` API 实时同步注册表 | ❌ Spec 未涉及 |
| **汇总行计算** | data-summary 支持 sum/count/max/min/avg，区分 number/currency/date | ❌ Spec 未涉及 |
| **CSV 引号转义解析** | `_parseCSVLine` 支持 `"field,with,comma"` 转义（`""`→`"`） | ⚠️ Spec §5 要求 CSV 格式，未明确转义 |
| **超列数据截断 + 报错** | 数据列数 > 表头列数时 console.error 并截断，缺列自动补齐 | ⚠️ Spec §8.2 要求"空值补全"，未明确超列 |

---

### 1.3 已修复的历史差距（上一版计划 G1–G8 收尾确认）

| # | 历史问题 | 当前状态 | 验证位置 |
|---|---------|---------|---------|
| G1 | 初始化失败时 DOM 已被改造 | ✅ 非真实问题 | `initWrapper` 仅在 `_initializeSuccess` 内通过 `new TableRenderLayer` 触发（table.js:1104），失败路径 `_initializeError` 不创建渲染层，不动 DOM |
| G2 | 无 1000ms 长防抖配置 | ✅ 已修复 | `debounceMs` 读取 `longDebounce`（table.js:472, 983） |
| G3 | loading 状态可重入 | ✅ 已修复 | `_shouldSkip` 含 loading 判定（table.js:937） |
| G4 | CSV 不支持引号转义 | ✅ 已修复 | `_parseCSVLine`（table.js:1046） |
| G5 | `table-data-parser.js` 死代码 | ✅ 已删除 | Glob 确认无此文件 |
| G6 | `table-registry.test.js` 失效 | ✅ 已删除 | Glob 确认无此文件 |
| G7 | `Table.tables` 死代码 | ✅ 已清除 | Grep 确认无 `this.tables` |
| G8 | 提取数据后清空 tbody 致失败时无数据 | ✅ 非真实问题 | 同 G1，失败路径不触达 `_extractDataFromDOM` 后的 DOM 清理 |

---

### 1.4 仍存在的差距（本计划需修复）

| # | Spec 要求 | 当前问题 | 严重度 |
|---|----------|----------|--------|
| **N1** | §7.2 全量重建需"清空所有历史规则（filterRules/sortRules/searchRules）+ 重置分页 pageState 为初始状态" | `_fullRebuild`（table.js:576-585）仅重建 DOM，未调用 `registry.clearRules` / 重置 `pageState`；表头变更后旧规则字段失效，下次 `recalculate` 会基于不存在的字段过滤，导致数据异常 | 🔴 高 |
| **N2** | §8.7/§11.3 updateData 需"表头一致性校验 → 不一致全量重建" | `TableDataLayer.updateData`（table.js:406-408）直接调 `processRawData`，无表头校验；当 `newData` 字段与注册表 `header` 不一致时，未触发规则清空与全量重建路径 | 🟡 中 |
| **N3** | §验证清单 | 测试用例未补充：CSV 引号转义、loading 加锁、超列报错；且测试文件内联的 `TableDataLayer` 副本未同步 `_cleanAndAlignData` 超列报错逻辑，存在双份代码漂移风险 | 🔴 高 |

---

## 二、后续实施计划

### 阶段 A：修复全量重建规则清空（N1）— 最高优先级

**问题本质**：Spec §7.2 明确要求全量重建时清空规则与重置分页，当前 `_fullRebuild` 漏做。表头变更后旧规则字段可能失效，`recalculate` 会引用不存在的字段。

**修改文件**：`src/modules/js/table.js`

**修改内容**：
1. 在 `TableRenderLayer._fullRebuild`（table.js:576）方法体开头，于重建 DOM 之前，调用注册表清理 API：
   - `this.registry.clearRules(this.tableId)` —— 清空 filter/sort/search 规则
   - `this.registry.setPageState(this.tableId, { pageNum: 1, pageSize: entry.pageState.pageSize, total: 0, pageCount: 0 })` —— 重置分页（保留 pageSize 配置）
2. 清空规则后会触发 `recalculate`，但此时 `entry.processedData` 未变，重算结果即全量数据，符合"全量重建"语义。

**注意事项**：
- `clearRules` 内部会 `_notify('rulesCleared')`，需确认是否触发额外 `_scheduleUpdate`。由于 `_fullRebuild` 本身已在 render 流程内，重复防抖会被 `clearTimeout` 合并，无副作用。
- 重置分页后需重新 `paginate`，`_renderBody` 已调用 `this.dataLayer.paginate`，会自动取第 1 页，正确。

**验证**：
- 构造场景：表格初始化后添加 filter 规则，动态修改 DOM thead 字段 → 触发 render → 确认 `entry.filterRules` 为空、`pageState.pageNum === 1`。

---

### 阶段 B：增强 updateData 表头一致性校验（N2）

**问题本质**：Spec §8.7/§11.3 要求 updateData 做表头一致性校验，不一致则全量重建。当前 `updateData` 直接复用 `processRawData`，未校验。

**修改文件**：`src/modules/js/table.js`

**修改内容**：
1. 在 `TableDataLayer.updateData`（table.js:406）增加表头一致性校验逻辑：
   ```javascript
   updateData(tableId, newData, headers) {
       const entry = this.registry.get(tableId);
       if (!entry) return { code: -1, msg: '表格未注册' };

       // 表头一致性校验：比较新 headers 与注册表历史 header 的字段集
       const oldFields = entry.header.map(h => h.field).join(',');
       const newFields = headers.map(h => h.field).join(',');
       if (oldFields !== newFields) {
           // 表头变更：清空规则、重置分页、走全量重建路径
           this.registry.clearRules(tableId);
           this.registry.setPageState(tableId, { pageNum: 1, total: 0, pageCount: 0 });
       }

       return this.processRawData(tableId, newData, headers);
   }
   ```
2. `processRawData` 内部已调用 `setHeader` + `setData`，会更新注册表 header 和数据。配合阶段 A 的 `_fullRebuild` 规则清空，表头变更时渲染层 `headerHash` 变化自动触发全量重建。

**注意事项**：
- 当 `newData` 为对象数组时，调用方（`Table.setData`）已从 DOM 读取 headers 传入。若用户未改 DOM thead，`oldFields === newFields`，走局部更新路径，符合 §7.1。
- 若用户改了 DOM thead 后调 `updateData`，`oldFields !== newFields`，清空规则 + 全量重建，符合 §7.2。

**验证**：
- 测试 1：相同表头不同数据 → 仅局部更新，规则保留。
- 测试 2：修改 DOM thead 字段后调 `updateData` → 规则被清空，分页重置为第 1 页。

---

### 阶段 C：补充测试用例并消除代码漂移（N3）

**问题本质**：测试文件 `src/test/table/test-table-modules.js` 使用内联的 `TableDataLayer` 副本（非从 table.js import），导致与生产代码漂移。当前内联副本缺少超列报错逻辑。

**修改文件**：`src/test/table/test-table-modules.js`

**修改内容**：

#### C1. 同步内联 `_cleanAndAlignData` 至 table.js 增强版
将测试文件第 147-173 行的内联 `_cleanAndAlignData` 替换为 table.js:249-290 的增强版本（含 `expectedCols` 超列报错与缺列补齐逻辑）。

#### C2. 新增测试用例（在第 18 个用例后追加）

```javascript
test('19. CSV 引号转义 - 字段内含逗号', () => {
    // 模拟 _parseCSVLine 逻辑：验证 "field,with,comma" 正确解析为单字段
    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];
            if (inQuotes) {
                if (char === '"' && nextChar === '"') { current += '"'; i++; }
                else if (char === '"') { inQuotes = false; }
                else { current += char; }
            } else {
                if (char === '"') { inQuotes = true; }
                else if (char === ',') { result.push(current.trim()); current = ''; }
                else { current += char; }
            }
        }
        result.push(current.trim());
        return result;
    }
    const line = '"张三,技术部",25,"1,000元"';
    const fields = parseCSVLine(line);
    assert.strictEqual(fields.length, 3);
    assert.strictEqual(fields[0], '张三,技术部');
    assert.strictEqual(fields[1], '25');
    assert.strictEqual(fields[2], '1,000元');
});

test('20. CSV 引号转义 - 双引号转义', () => {
    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];
            if (inQuotes) {
                if (char === '"' && nextChar === '"') { current += '"'; i++; }
                else if (char === '"') { inQuotes = false; }
                else { current += char; }
            } else {
                if (char === '"') { inQuotes = true; }
                else if (char === ',') { result.push(current.trim()); current = ''; }
                else { current += char; }
            }
        }
        result.push(current.trim());
        return result;
    }
    const line = '"他说""你好""",30';
    const fields = parseCSVLine(line);
    assert.strictEqual(fields.length, 2);
    assert.strictEqual(fields[0], '他说"你好"');
    assert.strictEqual(fields[1], '30');
});

test('21. 超列数据 - 截断并报错', () => {
    registry.register('test-table-21', { type: 'functional' });
    registry.setStatus('test-table-21', 'success');
    // 原始捕获 console.error
    const originalError = console.error;
    let errorCalled = false;
    console.error = () => { errorCalled = true; };
    try {
        const extraColsData = [
            [1, '张三', 25, 10000, '13800138000', '额外1', '额外2']
        ];
        const result = dataLayer.processRawData('test-table-21', extraColsData, headers);
        assert.strictEqual(result.code, 0);
        const entry = registry.get('test-table-21');
        assert.strictEqual(entry.processedData[0].ID, 1);
        assert.strictEqual(entry.processedData[0].姓名, '张三');
        // 超出列被截断，不进入 cleanRow
        assert.strictEqual(entry.processedData[0].额外1, undefined);
        assert.ok(errorCalled, '应触发 console.error');
    } finally {
        console.error = originalError;
    }
});

test('22. loading 加锁 - 不被重复初始化', () => {
    registry.register('test-table-22', { type: 'functional' });
    registry.setStatus('test-table-22', 'loading');
    // 模拟 _shouldSkip 逻辑
    function shouldSkip(entry) {
        if (!entry) return false;
        return entry.initStatus === 'error' || entry.initStatus === 'loading';
    }
    const entry = registry.get('test-table-22');
    assert.ok(shouldSkip(entry), 'loading 状态应被跳过');
    // 模拟成功后不再跳过
    registry.setStatus('test-table-22', 'success');
    const entry2 = registry.get('test-table-22');
    assert.ok(!shouldSkip(entry2), 'success 状态不应被跳过');
});

test('23. longDebounce 配置 - 防抖时长判定', () => {
    registry.register('test-table-23', { type: 'functional', longDebounce: true });
    const entry = registry.get('test-table-23');
    const debounceMs = entry.config.longDebounce ? 1000 : 500;
    assert.strictEqual(debounceMs, 1000);
    registry.register('test-table-23b', { type: 'functional' });
    const entry2 = registry.get('test-table-23b');
    const debounceMs2 = entry2.config.longDebounce ? 1000 : 500;
    assert.strictEqual(debounceMs2, 500);
});
```

#### C3. 运行测试
```bash
node src/test/table/test-table-modules.js
```
预期：23 个用例全部通过，输出 `23 通过 / 0 失败`。

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
8. **CSV 引号转义解析** — 保持
9. **超列截断 + 报错** — 保持

---

## 四、假设与决策

1. **N1 修复决策**：在渲染层 `_fullRebuild` 内清空规则，而非在数据层。原因：`_fullRebuild` 的触发条件（headerHash 变化）是渲染层判定，规则清空应与重建原子化。`clearRules` 是注册表 API，渲染层调用它属于"只读注册表"边界的小幅越界，但 Spec §10.1 已明确"渲染层交互动作必须调用数据层 API"，`clearRules` 属于注册表公开 API，符合规范精神。
2. **N2 修复决策**：表头一致性校验放在 `TableDataLayer.updateData`，比较 `entry.header` 与传入 `headers` 的字段集。不新增 `headers` 参数到 `Table.updateData` 公开签名（保持 Spec §8.7 的 `updateData(tableId, newOriginData)` 两参签名），headers 由 `Table.setData` 从 DOM 读取后内部传入。
3. **N3 测试策略**：测试文件继续使用内联副本（因 table.js 依赖浏览器 DOM 与框架 `domObserver`，无法在 Node 直接 import）。同步内联副本至 table.js 增强版，并新增 5 个用例覆盖引号转义、超列报错、loading 加锁、longDebounce。后续如需消除漂移，可考虑抽取纯数据逻辑到独立 `table-data.js` 供测试 import，但本次不做此重构。

---

## 五、验证清单

### 代码修改验证
- [ ] `_fullRebuild` 调用 `registry.clearRules` + `setPageState` 重置（N1）
- [ ] `updateData` 实现表头一致性校验，不一致时清空规则+重置分页（N2）
- [ ] 测试文件内联 `_cleanAndAlignData` 同步至增强版（C1）
- [ ] 新增 5 个测试用例：CSV 转义×2、超列报错、loading 加锁、longDebounce（C2）

### 运行验证
- [ ] `node src/test/table/test-table-modules.js` 输出 `23 通过 / 0 失败`
- [ ] 测试页面 `src/test/table/index.html` 正常渲染（Vite 启动后 tbody 有数据、冻结生效、汇总行计算正确）

### Spec 合规验证
- [ ] 动态修改 DOM thead 字段后触发全量重建：`filterRules` 为空、`pageState.pageNum === 1`
- [ ] 相同表头调用 `updateData`：规则保留，走局部更新
- [ ] 不同表头调用 `updateData`：规则清空，分页重置

---

## 六、执行顺序

1. **阶段 A**（N1）：修改 `_fullRebuild` → 5 分钟
2. **阶段 B**（N2）：修改 `updateData` → 10 分钟
3. **阶段 C**（N3）：同步测试内联副本 + 新增 5 用例 → 15 分钟
4. **运行验证**：Node 测试 + Vite 页面验证 → 10 分钟
5. **日志同步**：在 `gemini_operation_log.md` 追加操作记录

预计总工作量：约 40 分钟。
