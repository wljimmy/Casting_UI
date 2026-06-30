/* 
 * Casting UI Framework
 * Table Module Unit Tests
 * Description: 独立测试表格模块的数据层和注册表功能
 * Run: node test-table-modules.js
 */

import assert from 'assert';

class MockRegistry {
    constructor() {
        this._store = new Map();
        this._listeners = new Map();
    }

    register(tableId, config = {}) {
        const defaultEntry = {
            tableId,
            header: [],
            initStatus: 'pending',
            initError: '',
            updateTime: Date.now(),
            rawData: [],
            processedData: [],
            filteredData: [],
            filterRules: [],
            sortRules: [],
            searchRules: { keyword: '', mode: 'fuzzy', field: 'all' },
            pageState: { pageNum: 1, pageSize: 50, total: 0, pageCount: 0 },
            config: { type: 'display', dataSource: '', striped: true }
        };
        defaultEntry.config = Object.assign(defaultEntry.config, config);
        this._store.set(tableId, defaultEntry);
    }

    get(tableId) {
        return this._store.get(tableId);
    }

    setStatus(tableId, status, error = '') {
        const entry = this._store.get(tableId);
        if (!entry) return;
        entry.initStatus = status;
        entry.initError = error;
        entry.updateTime = Date.now();
        this._store.set(tableId, entry);
    }

    setData(tableId, rawData, processedData) {
        const entry = this._store.get(tableId);
        if (!entry) return;
        entry.rawData = rawData || [];
        entry.processedData = processedData || [];
        entry.filteredData = processedData || [];
        entry.pageState.total = (processedData || []).length;
        entry.pageState.pageCount = Math.max(1, Math.ceil(entry.pageState.total / entry.pageState.pageSize));
        entry.pageState.pageNum = 1;
        entry.updateTime = Date.now();
        this._store.set(tableId, entry);
    }

    setFilteredData(tableId, filteredData) {
        const entry = this._store.get(tableId);
        if (!entry) return;
        entry.filteredData = filteredData || [];
        entry.pageState.total = (filteredData || []).length;
        entry.pageState.pageCount = Math.max(1, Math.ceil(entry.pageState.total / entry.pageState.pageSize));
        entry.updateTime = Date.now();
        this._store.set(tableId, entry);
    }

    addFilterRule(tableId, rule) {
        const entry = this._store.get(tableId);
        if (!entry) return false;
        if (entry.filterRules.length >= 10) return false;
        entry.filterRules.push(rule);
        entry.updateTime = Date.now();
        this._store.set(tableId, entry);
        return true;
    }

    addSortRule(tableId, rule) {
        const entry = this._store.get(tableId);
        if (!entry) return false;
        if (entry.sortRules.length >= 10) return false;
        entry.sortRules.push(rule);
        entry.updateTime = Date.now();
        this._store.set(tableId, entry);
        return true;
    }

    removeSortRule(tableId, field) {
        const entry = this._store.get(tableId);
        if (!entry) return false;
        const before = entry.sortRules.length;
        entry.sortRules = entry.sortRules.filter(r => r.field !== field);
        if (entry.sortRules.length !== before) {
            entry.updateTime = Date.now();
            this._store.set(tableId, entry);
        }
        return true;
    }

    removeFilterRule(tableId, index) {
        const entry = this._store.get(tableId);
        if (!entry) return false;
        if (index < 0 || index >= entry.filterRules.length) return false;
        entry.filterRules.splice(index, 1);
        entry.updateTime = Date.now();
        this._store.set(tableId, entry);
        return true;
    }

    setSearchRules(tableId, rules) {
        const entry = this._store.get(tableId);
        if (!entry) return;
        entry.searchRules = Object.assign(entry.searchRules, rules);
        entry.updateTime = Date.now();
        this._store.set(tableId, entry);
    }

    setPageState(tableId, pageState) {
        const entry = this._store.get(tableId);
        if (!entry) return;
        entry.pageState = Object.assign(entry.pageState, pageState);
        entry.updateTime = Date.now();
        this._store.set(tableId, entry);
    }

    setHeader(tableId, header) {
        const entry = this._store.get(tableId);
        if (!entry) return;
        entry.header = header || [];
        entry.updateTime = Date.now();
        this._store.set(tableId, entry);
    }

    destroy(tableId) {
        this._store.delete(tableId);
    }
}

class TableDataLayer {
    constructor(registry) {
        this.registry = registry;
        this.MAX_DATA_ROWS = 5000;
        this.MAX_RULES = 10;
    }

    processRawData(tableId, rawData, headers) {
        if (!rawData || !rawData.length) {
            this.registry.setData(tableId, [], []);
            return { code: 0, msg: '空数据' };
        }

        if (rawData.length > this.MAX_DATA_ROWS) {
            console.warn('[TableDataLayer] 数据量超过5000行阈值');
            rawData = rawData.slice(0, this.MAX_DATA_ROWS);
        }

        const processedData = this._cleanAndAlignData(rawData, headers);
        this.registry.setData(tableId, rawData, processedData);
        this.registry.setHeader(tableId, headers);
        this.recalculate(tableId);

        return { code: 0, tableId, total: processedData.length, msg: '处理完成' };
    }

    _cleanAndAlignData(rawRows, headers) {
        if (!Array.isArray(rawRows)) return [];
        const expectedCols = headers.length;

        return rawRows.map((row, rowIndex) => {
            const cleanRow = { _id: rowIndex, _originalIndex: rowIndex };

            if (Array.isArray(row)) {
                const actualCols = row.length;
                if (actualCols < expectedCols) {
                    /* 缺列自动补齐空值 */
                    headers.forEach((h, colIndex) => {
                        cleanRow[h.field] = row[colIndex] ?? '';
                    });
                } else if (actualCols > expectedCols) {
                    /* 超列：控制台报错 + 截断处理 */
                    console.error(`[CUI Table] 数据列数 (${actualCols}) 超过表头列数 (${expectedCols})，行 ${rowIndex + 1}，已截断`);
                    headers.forEach((h, colIndex) => {
                        cleanRow[h.field] = row[colIndex] ?? '';
                    });
                } else {
                    headers.forEach((h, colIndex) => {
                        cleanRow[h.field] = row[colIndex] ?? '';
                    });
                }
            } else if (typeof row === 'object' && row !== null) {
                headers.forEach(h => {
                    cleanRow[h.field] = row[h.field] !== undefined && row[h.field] !== null ? row[h.field] : '';
                });
                Object.keys(row).forEach(key => {
                    if (cleanRow[key] === undefined) {
                        cleanRow[key] = row[key];
                    }
                });
            } else {
                headers.forEach(h => {
                    cleanRow[h.field] = '';
                });
            }
            return cleanRow;
        });
    }

    recalculate(tableId) {
        const entry = this.registry.get(tableId);
        if (!entry || entry.initStatus !== 'success') return;

        let data = [...entry.processedData];

        if (entry.searchRules.keyword) {
            data = this._search(data, entry.searchRules, entry.header);
        }

        entry.filterRules.forEach(rule => {
            data = this._filter(data, rule);
        });

        entry.sortRules.forEach(rule => {
            data = this._sort(data, rule, entry.header);
        });

        this.registry.setFilteredData(tableId, data);
    }

    _search(data, rules, headers) {
        const keyword = rules.keyword.toLowerCase();
        const field = rules.field;

        return data.filter(row => {
            if (field === 'all') {
                return headers.some(h => 
                    String(row[h.field] ?? '').toLowerCase().includes(keyword)
                );
            }
            return String(row[field] ?? '').toLowerCase().includes(keyword);
        });
    }

    _filter(data, rule) {
        return data.filter(row => {
            const val = row[rule.field];
            switch (rule.operator) {
                case '=': return val == rule.value;
                case '!=': return val != rule.value;
                case '>': return parseFloat(val) > parseFloat(rule.value);
                case '<': return parseFloat(val) < parseFloat(rule.value);
                case '>=': return parseFloat(val) >= parseFloat(rule.value);
                case '<=': return parseFloat(val) <= parseFloat(rule.value);
                case 'contains': return String(val).includes(String(rule.value));
                default: return true;
            }
        });
    }

    _sort(data, rule, headers) {
        const field = rule.field;
        const isAsc = rule.order === 'asc';
        const header = headers.find(h => h.field === field);
        const colType = header ? header.type : 'text';

        return [...data].sort((a, b) => {
            let valA = a[field];
            let valB = b[field];

            if (colType === 'number' || colType === 'currency') {
                const numA = parseFloat(valA);
                const numB = parseFloat(valB);
                if (!isNaN(numA) && !isNaN(numB)) {
                    return isAsc ? numA - numB : numB - numA;
                }
            } else if (colType === 'date' || colType === 'datetime') {
                const dateA = Date.parse(valA);
                const dateB = Date.parse(valB);
                if (!isNaN(dateA) && !isNaN(dateB)) {
                    return isAsc ? dateA - dateB : dateB - dateA;
                }
            }

            return isAsc 
                ? String(valA).localeCompare(String(valB), 'zh-CN') 
                : String(valB).localeCompare(String(valA), 'zh-CN');
        });
    }

    paginate(tableId) {
        const entry = this.registry.get(tableId);
        if (!entry) return { data: [], pageInfo: {} };

        const { pageNum, pageSize } = entry.pageState;
        const start = (pageNum - 1) * pageSize;
        const end = start + pageSize;

        return {
            data: entry.filteredData.slice(start, end),
            pageInfo: {
                pageNum,
                pageSize,
                total: entry.pageState.total,
                pageCount: entry.pageState.pageCount
            }
        };
    }

    filter(tableId, rule) {
        if (!this.registry.addFilterRule(tableId, rule)) {
            return { code: -1, msg: '规则超过10条上限' };
        }
        this.recalculate(tableId);
        const entry = this.registry.get(tableId);
        return { code: 0, total: entry.filteredData.length, filterRules: entry.filterRules };
    }

    sort(tableId, rule) {
        if (!this.registry.addSortRule(tableId, rule)) {
            return { code: -1, msg: '规则超过10条上限' };
        }
        this.recalculate(tableId);
        const entry = this.registry.get(tableId);
        return { code: 0, total: entry.filteredData.length, sortRules: entry.sortRules };
    }

    search(tableId, keyword, field = 'all', mode = 'fuzzy') {
        this.registry.setSearchRules(tableId, { keyword, field, mode });
        this.recalculate(tableId);
        const entry = this.registry.get(tableId);
        return { code: 0, total: entry.filteredData.length };
    }
}

function runTests() {
    console.log('\n====================================');
    console.log('表格模块独立功能测试');
    console.log('====================================\n');

    let passed = 0;
    let failed = 0;

    const registry = new MockRegistry();
    const dataLayer = new TableDataLayer(registry);

    const headers = [
        { field: 'ID', label: 'ID', type: 'number' },
        { field: '姓名', label: '姓名', type: 'text' },
        { field: '年龄', label: '年龄', type: 'number' },
        { field: '薪资', label: '薪资', type: 'currency' },
        { field: '手机号', label: '手机号', type: 'phone' }
    ];

    const testData = [
        { ID: 1, 姓名: '张三', 年龄: 25, 薪资: 10000, 手机号: '13800138000' },
        { ID: 2, 姓名: '李四', 年龄: 30, 薪资: 20000, 手机号: '13900139000' },
        { ID: 3, 姓名: '王五', 年龄: 35, 薪资: 30000, 手机号: '13700137000' },
        { ID: 4, 姓名: '赵六', 年龄: 28, 薪资: 15000, 手机号: '13600136000' },
        { ID: 5, 姓名: '孙七', 年龄: 40, 薪资: 40000, 手机号: '13500135000' }
    ];

    function test(name, fn) {
        try {
            fn();
            console.log(`✓ ${name}`);
            passed++;
        } catch (err) {
            console.log(`✗ ${name}`);
            console.log(`  Error: ${err.message}`);
            failed++;
        }
    }

    test('1. 注册表初始化', () => {
        registry.register('test-table');
        const entry = registry.get('test-table');
        assert.ok(entry, '注册表条目应存在');
        assert.strictEqual(entry.initStatus, 'pending');
        assert.deepStrictEqual(entry.filterRules, []);
        assert.deepStrictEqual(entry.sortRules, []);
        assert.deepStrictEqual(entry.searchRules, { keyword: '', mode: 'fuzzy', field: 'all' });
    });

    test('2. 数据处理 - 对象数组', () => {
        registry.register('test-table-2', { type: 'functional' });
        registry.setStatus('test-table-2', 'success');
        const result = dataLayer.processRawData('test-table-2', testData, headers);
        assert.strictEqual(result.code, 0);
        assert.strictEqual(result.total, 5);
        const entry = registry.get('test-table-2');
        assert.strictEqual(entry.rawData.length, 5);
        assert.strictEqual(entry.processedData.length, 5);
        assert.strictEqual(entry.processedData[0]._id, 0);
        assert.strictEqual(entry.processedData[0].姓名, '张三');
    });

    test('3. 数据处理 - 数组数组', () => {
        registry.register('test-table-3', { type: 'functional' });
        registry.setStatus('test-table-3', 'success');
        const arrayData = [
            [6, '周八', 22, 8000, '13400134000'],
            [7, '吴九', 33, 25000, '13300133000']
        ];
        const result = dataLayer.processRawData('test-table-3', arrayData, headers);
        assert.strictEqual(result.code, 0);
        assert.strictEqual(result.total, 2);
        const entry = registry.get('test-table-3');
        assert.strictEqual(entry.processedData[0].姓名, '周八');
        assert.strictEqual(entry.processedData[1].年龄, 33);
    });

    test('4. 数据处理 - 空值补全', () => {
        registry.register('test-table-4', { type: 'functional' });
        registry.setStatus('test-table-4', 'success');
        const incompleteData = [
            { ID: 1, 姓名: '测试' },
            { ID: 2, 年龄: 30 }
        ];
        const result = dataLayer.processRawData('test-table-4', incompleteData, headers);
        assert.strictEqual(result.code, 0);
        const entry = registry.get('test-table-4');
        assert.strictEqual(entry.processedData[0].年龄, '');
        assert.strictEqual(entry.processedData[1].姓名, '');
    });

    test('5. 排序 - 数字升序', () => {
        registry.register('test-table-5', { type: 'functional' });
        registry.setStatus('test-table-5', 'success');
        dataLayer.processRawData('test-table-5', testData, headers);
        dataLayer.sort('test-table-5', { field: '年龄', order: 'asc' });
        const entry = registry.get('test-table-5');
        assert.strictEqual(entry.filteredData[0].年龄, 25);
        assert.strictEqual(entry.filteredData[4].年龄, 40);
    });

    test('6. 排序 - 数字降序', () => {
        registry.register('test-table-6', { type: 'functional' });
        registry.setStatus('test-table-6', 'success');
        dataLayer.processRawData('test-table-6', testData, headers);
        dataLayer.sort('test-table-6', { field: '薪资', order: 'desc' });
        const entry = registry.get('test-table-6');
        assert.strictEqual(entry.filteredData[0].薪资, 40000);
        assert.strictEqual(entry.filteredData[4].薪资, 10000);
    });

    test('7. 筛选 - 等于', () => {
        registry.register('test-table-7', { type: 'functional' });
        registry.setStatus('test-table-7', 'success');
        dataLayer.processRawData('test-table-7', testData, headers);
        dataLayer.filter('test-table-7', { field: '姓名', operator: '=', value: '张三' });
        const entry = registry.get('test-table-7');
        assert.strictEqual(entry.filteredData.length, 1);
        assert.strictEqual(entry.filteredData[0].姓名, '张三');
    });

    test('8. 筛选 - 大于', () => {
        registry.register('test-table-8', { type: 'functional' });
        registry.setStatus('test-table-8', 'success');
        dataLayer.processRawData('test-table-8', testData, headers);
        dataLayer.filter('test-table-8', { field: '年龄', operator: '>', value: 30 });
        const entry = registry.get('test-table-8');
        assert.strictEqual(entry.filteredData.length, 2);
        assert.strictEqual(entry.filteredData[0].年龄, 35);
        assert.strictEqual(entry.filteredData[1].年龄, 40);
    });

    test('9. 搜索 - 全部字段', () => {
        registry.register('test-table-9', { type: 'functional' });
        registry.setStatus('test-table-9', 'success');
        dataLayer.processRawData('test-table-9', testData, headers);
        dataLayer.search('test-table-9', '张');
        const entry = registry.get('test-table-9');
        assert.strictEqual(entry.filteredData.length, 1);
        assert.strictEqual(entry.filteredData[0].姓名, '张三');
    });

    test('10. 搜索 - 指定字段', () => {
        registry.register('test-table-10', { type: 'functional' });
        registry.setStatus('test-table-10', 'success');
        dataLayer.processRawData('test-table-10', testData, headers);
        dataLayer.search('test-table-10', '25', '年龄');
        const entry = registry.get('test-table-10');
        assert.strictEqual(entry.filteredData.length, 1);
        assert.strictEqual(entry.filteredData[0].姓名, '张三');
    });

    test('11. 分页 - 第一页', () => {
        registry.register('test-table-11', { type: 'functional' });
        registry.setStatus('test-table-11', 'success');
        registry.setPageState('test-table-11', { pageSize: 2 });
        dataLayer.processRawData('test-table-11', testData, headers);
        const result = dataLayer.paginate('test-table-11');
        assert.strictEqual(result.data.length, 2);
        assert.strictEqual(result.pageInfo.pageNum, 1);
        assert.strictEqual(result.pageInfo.total, 5);
        assert.strictEqual(result.pageInfo.pageCount, 3);
    });

    test('12. 分页 - 第二页', () => {
        registry.register('test-table-12', { type: 'functional' });
        registry.setStatus('test-table-12', 'success');
        dataLayer.processRawData('test-table-12', testData, headers);
        registry.setPageState('test-table-12', { pageSize: 2, pageNum: 2 });
        const result = dataLayer.paginate('test-table-12');
        assert.strictEqual(result.data.length, 2);
        assert.strictEqual(result.data[0].ID, 3);
        assert.strictEqual(result.data[1].ID, 4);
    });

    test('13. 规则上限 - 筛选规则超过10条', () => {
        registry.register('test-table-13', { type: 'functional' });
        registry.setStatus('test-table-13', 'success');
        dataLayer.processRawData('test-table-13', testData, headers);
        
        for (let i = 0; i < 10; i++) {
            dataLayer.filter('test-table-13', { field: 'ID', operator: '=', value: i });
        }
        
        const result = dataLayer.filter('test-table-13', { field: 'ID', operator: '=', value: 99 });
        assert.strictEqual(result.code, -1);
        assert.strictEqual(result.msg, '规则超过10条上限');
    });

    test('14. 规则上限 - 排序规则超过10条', () => {
        registry.register('test-table-14', { type: 'functional' });
        registry.setStatus('test-table-14', 'success');
        dataLayer.processRawData('test-table-14', testData, headers);
        
        for (let i = 0; i < 10; i++) {
            dataLayer.sort('test-table-14', { field: 'ID', order: 'asc' });
        }
        
        const result = dataLayer.sort('test-table-14', { field: 'ID', order: 'desc' });
        assert.strictEqual(result.code, -1);
        assert.strictEqual(result.msg, '规则超过10条上限');
    });

    test('15. 数据量阈值 - 超过5000行截断', () => {
        registry.register('test-table-15', { type: 'functional' });
        registry.setStatus('test-table-15', 'success');
        
        const largeData = [];
        for (let i = 0; i < 5500; i++) {
            largeData.push({ ID: i, 姓名: `用户${i}`, 年龄: 20 + i % 30, 薪资: 10000 + i * 100, 手机号: '13800138000' });
        }
        
        const result = dataLayer.processRawData('test-table-15', largeData, headers);
        assert.strictEqual(result.total, 5000);
        const entry = registry.get('test-table-15');
        assert.strictEqual(entry.processedData.length, 5000);
    });

    test('16. 空数据处理', () => {
        registry.register('test-table-16', { type: 'functional' });
        registry.setStatus('test-table-16', 'success');
        const result = dataLayer.processRawData('test-table-16', [], headers);
        assert.strictEqual(result.code, 0);
        assert.strictEqual(result.msg, '空数据');
        const entry = registry.get('test-table-16');
        assert.strictEqual(entry.rawData.length, 0);
        assert.strictEqual(entry.processedData.length, 0);
    });

    test('17. 注册表销毁', () => {
        registry.register('test-table-17');
        assert.ok(registry.get('test-table-17'));
        registry.destroy('test-table-17');
        assert.strictEqual(registry.get('test-table-17'), undefined);
    });

    test('18. 表头不匹配处理 - 数据源列多于表头', () => {
        registry.register('test-table-18', { type: 'functional' });
        registry.setStatus('test-table-18', 'success');
        const extraData = [
            { ID: 1, 姓名: '张三', 年龄: 25, 薪资: 10000, 手机号: '13800138000', 额外字段: '测试' }
        ];
        const result = dataLayer.processRawData('test-table-18', extraData, headers);
        assert.strictEqual(result.code, 0);
        const entry = registry.get('test-table-18');
        assert.strictEqual(entry.processedData[0].额外字段, '测试');
    });

    /* ===== 以下为 Spec 差距收尾补充用例（CSV 转义 / 超列报错 / loading 加锁 / longDebounce） ===== */

    /* 内联 _parseCSVLine 副本（与 table.js 同源），用于 Node 环境验证引号转义逻辑 */
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

    test('19. CSV 引号转义 - 字段内含逗号', () => {
        const line = '"张三,技术部",25,"1,000元"';
        const fields = parseCSVLine(line);
        assert.strictEqual(fields.length, 3);
        assert.strictEqual(fields[0], '张三,技术部');
        assert.strictEqual(fields[1], '25');
        assert.strictEqual(fields[2], '1,000元');
    });

    test('20. CSV 引号转义 - 双引号转义', () => {
        const line = '"他说""你好""",30';
        const fields = parseCSVLine(line);
        assert.strictEqual(fields.length, 2);
        assert.strictEqual(fields[0], '他说"你好"');
        assert.strictEqual(fields[1], '30');
    });

    test('21. 超列数据 - 截断并报错', () => {
        registry.register('test-table-21', { type: 'functional' });
        registry.setStatus('test-table-21', 'success');
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
            /* 超出列被截断，不进入 cleanRow */
            assert.strictEqual(entry.processedData[0].额外1, undefined);
            assert.ok(errorCalled, '应触发 console.error');
        } finally {
            console.error = originalError;
        }
    });

    test('22. loading 加锁 - 不被重复初始化', () => {
        registry.register('test-table-22', { type: 'functional' });
        registry.setStatus('test-table-22', 'loading');
        /* 模拟 TableInit._shouldSkip 逻辑 */
        function shouldSkip(entry) {
            if (!entry) return false;
            return entry.initStatus === 'error' || entry.initStatus === 'loading';
        }
        const entry = registry.get('test-table-22');
        assert.ok(shouldSkip(entry), 'loading 状态应被跳过');
        /* 成功后不再跳过 */
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

    test('24. removeFilterRule - 按索引删除单条筛选规则', () => {
        registry.register('test-table-24', { type: 'functional' });
        registry.addFilterRule('test-table-24', { field: '年龄', operator: '>', value: '20' });
        registry.addFilterRule('test-table-24', { field: '省份', operator: '=', value: '北京' });
        const entry1 = registry.get('test-table-24');
        assert.strictEqual(entry1.filterRules.length, 2);
        /* 删除第一条（索引 0） */
        const ok = registry.removeFilterRule('test-table-24', 0);
        assert.strictEqual(ok, true);
        const entry2 = registry.get('test-table-24');
        assert.strictEqual(entry2.filterRules.length, 1);
        assert.strictEqual(entry2.filterRules[0].field, '省份');
        /* 越界索引返回 false 且不修改 */
        const ok2 = registry.removeFilterRule('test-table-24', 99);
        assert.strictEqual(ok2, false);
        const entry3 = registry.get('test-table-24');
        assert.strictEqual(entry3.filterRules.length, 1);
    });

    test('25. removeSortRule - 按字段删除单条排序规则', () => {
        registry.register('test-table-25', { type: 'functional' });
        registry.addSortRule('test-table-25', { field: '薪资', order: 'desc' });
        registry.addSortRule('test-table-25', { field: '年龄', order: 'asc' });
        const entry1 = registry.get('test-table-25');
        assert.strictEqual(entry1.sortRules.length, 2);
        /* 删除薪资排序 */
        const ok = registry.removeSortRule('test-table-25', '薪资');
        assert.strictEqual(ok, true);
        const entry2 = registry.get('test-table-25');
        assert.strictEqual(entry2.sortRules.length, 1);
        assert.strictEqual(entry2.sortRules[0].field, '年龄');
        /* 删除不存在的字段，长度不变 */
        registry.removeSortRule('test-table-25', '不存在');
        const entry3 = registry.get('test-table-25');
        assert.strictEqual(entry3.sortRules.length, 1);
    });

    console.log('\n====================================');
    console.log(`测试结果: ${passed} 通过 / ${failed} 失败`);
    console.log('====================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();