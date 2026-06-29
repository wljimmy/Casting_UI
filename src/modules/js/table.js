/*
 * Casting UI Framework
 * Version: 0.8.0
 * Module: table.js
 * Description: 数据表格组件 - 标准化分层架构、数据与视图分离、双向实时同步
 * Architecture: 注册表 + 数据层 + 渲染层 + 初始化模块 四合一
 * Copyright (c) 2026 Bingo工作室
 * Email: wljimmy@hotmail.com
 */

import { debug } from './core.js';
import { domObserver } from './dom-observer.js';

function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
}

/**
 * ============================================================
 * 第一层：注册表模块 (CUITableRegistry)
 * 职责：存储完整表格状态、四状态机管理、事件通知
 * ============================================================
 */
class CUITableRegistry {
    constructor() {
        if (CUITableRegistry._instance) return CUITableRegistry._instance;
        this._store = new Map();
        this._listeners = new Map();
        this.MAX_RULES = 10;
        CUITableRegistry._instance = this;
    }

    register(tableId, config = {}) {
        if (!tableId) throw new Error('[CUITableRegistry] tableId is required');
        
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

        const existing = this._store.get(tableId);
        if (existing) {
            defaultEntry.initStatus = existing.initStatus;
            defaultEntry.initError = existing.initError;
            defaultEntry.rawData = existing.rawData;
            defaultEntry.processedData = existing.processedData;
            defaultEntry.header = existing.header;
        }

        defaultEntry.config = Object.assign(defaultEntry.config, config);
        this._store.set(tableId, defaultEntry);
        this._notify(tableId, 'config');
    }

    get(tableId) {
        return this._store.get(tableId);
    }

    getAll() {
        return Array.from(this._store.values());
    }

    setStatus(tableId, status, error = '') {
        const entry = this._store.get(tableId);
        if (!entry) return;
        entry.initStatus = status;
        entry.initError = error;
        entry.updateTime = Date.now();
        this._store.set(tableId, entry);
        this._notify(tableId, 'status');
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
        this._notify(tableId, 'data');
    }

    setFilteredData(tableId, filteredData) {
        const entry = this._store.get(tableId);
        if (!entry) return;
        entry.filteredData = filteredData || [];
        entry.pageState.total = (filteredData || []).length;
        entry.pageState.pageCount = Math.max(1, Math.ceil(entry.pageState.total / entry.pageState.pageSize));
        entry.updateTime = Date.now();
        this._store.set(tableId, entry);
        this._notify(tableId, 'filtered');
    }

    addFilterRule(tableId, rule) {
        const entry = this._store.get(tableId);
        if (!entry) return false;
        if (entry.filterRules.length >= this.MAX_RULES) {
            console.error('[CUITableRegistry] 筛选规则超过上限');
            return false;
        }
        entry.filterRules.push(rule);
        entry.updateTime = Date.now();
        this._store.set(tableId, entry);
        this._notify(tableId, 'filter');
        return true;
    }

    addSortRule(tableId, rule) {
        const entry = this._store.get(tableId);
        if (!entry) return false;
        /* 先移除同字段的旧规则，避免同字段累积多条规则 */
        entry.sortRules = entry.sortRules.filter(r => r.field !== rule.field);
        if (entry.sortRules.length >= this.MAX_RULES) {
            console.error('[CUITableRegistry] 排序规则超过上限');
            return false;
        }
        entry.sortRules.push(rule);
        entry.updateTime = Date.now();
        this._store.set(tableId, entry);
        this._notify(tableId, 'sort');
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
            this._notify(tableId, 'sort');
        }
        return true;
    }

    setSearchRules(tableId, rules) {
        const entry = this._store.get(tableId);
        if (!entry) return;
        entry.searchRules = Object.assign(entry.searchRules, rules);
        entry.updateTime = Date.now();
        this._store.set(tableId, entry);
        this._notify(tableId, 'search');
    }

    setPageState(tableId, pageState) {
        const entry = this._store.get(tableId);
        if (!entry) return;
        entry.pageState = Object.assign(entry.pageState, pageState);
        entry.updateTime = Date.now();
        this._store.set(tableId, entry);
        this._notify(tableId, 'page');
    }

    clearRules(tableId) {
        const entry = this._store.get(tableId);
        if (!entry) return;
        entry.filterRules = [];
        entry.sortRules = [];
        entry.searchRules = { keyword: '', mode: 'fuzzy', field: 'all' };
        entry.updateTime = Date.now();
        this._store.set(tableId, entry);
        this._notify(tableId, 'rulesCleared');
    }

    clearFilters(tableId) {
        const entry = this._store.get(tableId);
        if (!entry) return;
        entry.filterRules = [];
        entry.updateTime = Date.now();
        this._store.set(tableId, entry);
        this._notify(tableId, 'filter');
    }

    clearSorts(tableId) {
        const entry = this._store.get(tableId);
        if (!entry) return;
        entry.sortRules = [];
        entry.updateTime = Date.now();
        this._store.set(tableId, entry);
        this._notify(tableId, 'sort');
    }

    updateCellData(tableId, rowIndex, field, value) {
        const entry = this._store.get(tableId);
        if (!entry) return false;
        const row = entry.processedData.find(r => r._originalIndex === rowIndex);
        if (!row) return false;
        row[field] = value;
        entry.updateTime = Date.now();
        this._store.set(tableId, entry);
        return true;
    }

    setHeader(tableId, header) {
        const entry = this._store.get(tableId);
        if (!entry) return;
        entry.header = header || [];
        entry.updateTime = Date.now();
        this._store.set(tableId, entry);
        this._notify(tableId, 'header');
    }

    destroy(tableId) {
        this._store.delete(tableId);
        this._listeners.delete(tableId);
    }

    has(tableId) {
        return this._store.has(tableId);
    }

    on(tableId, event, callback) {
        if (!this._listeners.has(tableId)) {
            this._listeners.set(tableId, {});
        }
        if (!this._listeners.get(tableId)[event]) {
            this._listeners.get(tableId)[event] = [];
        }
        this._listeners.get(tableId)[event].push(callback);
    }

    off(tableId, event, callback) {
        const tableListeners = this._listeners.get(tableId);
        if (!tableListeners || !tableListeners[event]) return;
        if (callback) {
            tableListeners[event] = tableListeners[event].filter(cb => cb !== callback);
        } else {
            tableListeners[event] = [];
        }
    }

    _notify(tableId, event) {
        const listeners = this._listeners.get(tableId);
        if (!listeners || !listeners[event]) return;
        listeners[event].forEach(cb => {
            try { cb(this._store.get(tableId)); } catch (e) { console.warn(e); }
        });
    }
}

/**
 * ============================================================
 * 第二层：数据层模块 (TableDataLayer)
 * 职责：纯数据处理、排序筛选搜索、分页、规则运算、5000行阈值拦截
 * ============================================================
 */
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
            console.warn('[TableDataLayer] 数据量超过5000行阈值，前端仅展示前5000行');
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
                if (actualCols > expectedCols) {
                    console.error(`[CUI Table] 数据列数 (${actualCols}) 超过表头列数 (${expectedCols})，行 ${rowIndex + 1}，已截断`);
                }
                /* 缺列自动补齐空值、超列截断、正常列均走同一逻辑 */
                headers.forEach((h, colIndex) => {
                    cleanRow[h.field] = row[colIndex] ?? '';
                });
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

    updateCell(tableId, rowIndex, field, value) {
        if (!this.registry.updateCellData(tableId, rowIndex, field, value)) return false;
        this.recalculate(tableId);
        return true;
    }

    updateData(tableId, newData, headers) {
        const entry = this.registry.get(tableId);
        if (!entry) return { code: -1, msg: '表格未注册' };

        /* Spec §8.7/§11.3 表头一致性校验：字段集变更时清空规则 + 重置分页，
         * 配合渲染层 headerHash 变化走全量重建路径，避免旧规则引用失效字段。 */
        const oldFields = (entry.header || []).map(h => h.field).join(',');
        const newFields = (headers || []).map(h => h.field).join(',');
        if (oldFields !== '' && oldFields !== newFields) {
            this.registry.clearRules(tableId);
            this.registry.setPageState(tableId, { pageNum: 1 });
        }

        return this.processRawData(tableId, newData, headers);
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

    unsort(tableId, field) {
        this.registry.removeSortRule(tableId, field);
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

    clearFilters(tableId) {
        this.registry.clearFilters(tableId);
        this.recalculate(tableId);
    }

    clearSorts(tableId) {
        this.registry.clearSorts(tableId);
        this.recalculate(tableId);
    }
}

/**
 * ============================================================
 * 第三层：渲染层模块 (TableRenderLayer)
 * 职责：只读注册表数据、局部热更新、全量重建、500ms防抖
 * ============================================================
 */
class TableRenderLayer {
    constructor(registry, dataLayer, element) {
        this.registry = registry;
        this.dataLayer = dataLayer;
        this.element = element;
        this.tableId = element.id;
        this.freezeConfig = this._extractFreezeConfig();
        this.originalTfootContent = {};
        this.debounceTimer = null;
        this.lastHeaderHash = '';
        /* 防抖时长：默认 500ms，配置 longDebounce:true 时为 1000ms */
        const entry = registry.get(this.tableId);
        this.debounceMs = (entry?.config?.longDebounce) ? 1000 : 500;
        this.init();
    }

    _extractFreezeConfig() {
        return {
            header: this.element.getAttribute('data-freeze-header') === 'true',
            footer: this.element.getAttribute('data-freeze-footer') === 'true',
            firstCol: this.element.getAttribute('data-freeze-first-col') === 'true',
            lastCol: this.element.getAttribute('data-freeze-last-col') === 'true'
        };
    }

    init() {
        this.initWrapper();
        this.initOriginalTfoot();
        this.bindRegistryListeners();
    }

    initWrapper() {
        if (!this.element.parentNode.classList.contains('CUI-table-container')) {
            const container = document.createElement('div');
            container.className = 'CUI-table-container';
            this.element.parentNode.insertBefore(container, this.element);
            container.appendChild(this.element);
        }
        this.container = this.element.parentNode;

        if (!this.element.querySelector('thead')) {
            const thead = document.createElement('thead');
            thead.innerHTML = '<tr></tr>';
            this.element.insertBefore(thead, this.element.firstChild);
        }
        if (!this.element.querySelector('tbody')) {
            this.element.appendChild(document.createElement('tbody'));
        }
    }

    initOriginalTfoot() {
        const tfoot = this.element.querySelector('tfoot');
        if (!tfoot) return;

        const headers = this._extractHeadersFromDOM();
        const footerCells = tfoot.querySelectorAll('tr:first-child td, tr:first-child th');

        headers.forEach((h, idx) => {
            const cell = footerCells[idx];
            if (cell) {
                const text = cell.textContent.trim();
                if (text !== '') {
                    this.originalTfootContent[h.field] = text;
                }
            }
        });
    }

    bindRegistryListeners() {
        this.registry.on(this.tableId, 'data', () => this._scheduleUpdate());
        this.registry.on(this.tableId, 'filtered', () => this._scheduleUpdate());
        this.registry.on(this.tableId, 'page', () => this._scheduleUpdate());
        this.registry.on(this.tableId, 'status', (entry) => {
            if (entry.initStatus === 'success') {
                this._scheduleUpdate();
            }
        });
        this.registry.on(this.tableId, 'header', () => this._scheduleUpdate());
    }

    _scheduleUpdate() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.render(), this.debounceMs);
    }

    _extractHeadersFromDOM() {
        const headers = [];
        const ths = this.element.querySelectorAll('thead tr:last-child th');
        ths.forEach((th, idx) => {
            const field = th.getAttribute('data-field') || th.textContent.trim() || `col_${idx}`;
            const label = th.textContent.trim() || field;
            const type = th.getAttribute('data-type') || 'text';
            const summary = th.getAttribute('data-summary') || '';
            headers.push({ field, label, type, summary, element: th });
        });
        return headers;
    }

    render() {
        const entry = this.registry.get(this.tableId);
        if (!entry || entry.initStatus !== 'success') return;

        const headers = this._extractHeadersFromDOM();
        const headerHash = JSON.stringify(headers.map(h => h.field));

        if (headerHash !== this.lastHeaderHash) {
            /* Spec §7.2：表头变更触发全量重建时，清空历史规则 + 重置分页到第1页。
             * 守卫 lastHeaderHash !== ''：首次渲染（空hash）不触达，避免破坏
             * processRawData→setData 已写入的 total/pageCount。 */
            if (this.lastHeaderHash !== '') {
                this.registry.clearRules(this.tableId);
                this.registry.setPageState(this.tableId, { pageNum: 1 });
            }
            this.lastHeaderHash = headerHash;
            this._fullRebuild(headers, entry);
        } else {
            this._partialUpdate(headers, entry);
        }
    }

    _fullRebuild(headers, entry) {
        this._renderBody(headers, entry);
        this._renderFooter(headers, entry);
        this._applyFreezeLayout(headers);
        this._updatePagination(entry);

        if (entry.config.type === 'functional') {
            this._injectToolbar();
        }
    }

    _partialUpdate(headers, entry) {
        this._renderBody(headers, entry);
        this._renderFooter(headers, entry);
        this._applyFreezeLayout(headers);
    }

    _renderBody(headers, entry) {
        const tbody = this.element.querySelector('tbody');
        if (!tbody) return;

        const { data } = this.dataLayer.paginate(this.tableId);

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${headers.length}" class="CUI-table-empty">暂无数据</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        data.forEach(row => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-row-id', row._id);
            tr.setAttribute('data-row-original-index', row._originalIndex);

            headers.forEach(h => {
                const td = document.createElement('td');
                const value = row[h.field] ?? '';

                td.setAttribute('data-field', h.field);
                td.setAttribute('data-row-index', row._originalIndex);
                td.setAttribute('data-value', String(value));
                if (h.type) td.setAttribute('data-type', h.type);

                /* flex 布局下需显式同步 th 宽度到 td */
                if (h.element) {
                    const thInlineWidth = h.element.style.width;
                    if (thInlineWidth) {
                        td.style.width = thInlineWidth;
                    }
                }

                const cellClasses = [];
                const isEditable = h.element?.getAttribute('data-editable') === 'true' ||
                                   (entry.config.type === 'functional' && h.field !== 'id' && h.field !== 'ID');
                if (isEditable) {
                    td.setAttribute('contenteditable', 'true');
                    cellClasses.push('CUI-editable-cell');
                }

                if (this._isMaskedType(h.type)) {
                    const maskText = this._getCellMask(h.type, value);
                    if (maskText !== null) {
                        cellClasses.push('CUI-table-cell-masked');
                        td.setAttribute('data-masked', maskText);
                    }
                }

                if (h.type === 'number' || h.type === 'currency') {
                    cellClasses.push('CUI-td-number');
                }
                if (h.type === 'text-long') {
                    cellClasses.push('CUI-td-long');
                }

                td.className = cellClasses.join(' ');
                td.innerHTML = this._formatCellValue(value, h.type, h);
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });
    }

    _renderFooter(headers, entry) {
        const tfoot = this.element.querySelector('tfoot');
        if (!tfoot) return;

        const footerRow = tfoot.querySelector('tr');
        if (!footerRow) return;

        const cells = footerRow.querySelectorAll('td, th');
        const data = entry.filteredData || [];

        headers.forEach((h, index) => {
            const cell = cells[index];
            if (!cell) return;

            if (this.originalTfootContent[h.field] !== undefined) {
                cell.textContent = this.originalTfootContent[h.field];
                return;
            }

            const summaryRule = h.summary || h.element?.getAttribute('data-summary') || '';
            if (!summaryRule) {
                cell.textContent = '';
                return;
            }

            const values = data.map(row => row[h.field]).filter(v => v !== undefined && v !== null && String(v).trim() !== '');
            const colType = h.type || 'text';
            let calculatedVal = '';

            if (colType === 'number' || colType === 'currency') {
                const numValues = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
                switch (summaryRule) {
                    case 'sum': calculatedVal = numValues.reduce((sum, v) => sum + v, 0); break;
                    case 'count': calculatedVal = numValues.length; break;
                    case 'max': calculatedVal = numValues.length > 0 ? Math.max(...numValues) : ''; break;
                    case 'min': calculatedVal = numValues.length > 0 ? Math.min(...numValues) : ''; break;
                    case 'avg': calculatedVal = numValues.length > 0 ? (numValues.reduce((sum, v) => sum + v, 0) / numValues.length) : 0; break;
                }
            } else if (colType === 'date' || colType === 'datetime') {
                const dateValues = values.map(v => Date.parse(v)).filter(v => !isNaN(v));
                switch (summaryRule) {
                    case 'max': calculatedVal = dateValues.length > 0 ? new Date(Math.max(...dateValues)).toISOString().slice(0, 10) : ''; break;
                    case 'min': calculatedVal = dateValues.length > 0 ? new Date(Math.min(...dateValues)).toISOString().slice(0, 10) : ''; break;
                    default: calculatedVal = '';
                }
            } else {
                calculatedVal = summaryRule === 'count' ? values.length : '';
            }

            if (calculatedVal !== '') {
                if (colType === 'currency') {
                    cell.innerHTML = this._formatCellValue(calculatedVal, 'currency', h);
                } else if (colType === 'number') {
                    cell.innerHTML = this._formatCellValue(calculatedVal, 'number', h);
                } else {
                    cell.textContent = String(calculatedVal);
                }
            } else {
                cell.textContent = '';
            }
        });
    }

    _applyFreezeLayout(headers) {
        const table = this.element;
        const thead = table.querySelector('thead');
        const tfoot = table.querySelector('tfoot');

        thead?.classList.toggle('CUI-freeze-thead', this.freezeConfig.header);
        tfoot?.classList.toggle('CUI-freeze-tfoot', this.freezeConfig.footer);

        const totalCols = headers.length;
        if (totalCols === 0) return;

        const trs = table.querySelectorAll('tr');
        trs.forEach(tr => {
            const cells = tr.querySelectorAll('th, td');
            if (cells.length === 0) return;

            if (this.freezeConfig.firstCol) {
                cells[0]?.classList.add('CUI-freeze-first');
            }
            if (this.freezeConfig.lastCol) {
                cells[cells.length - 1]?.classList.add('CUI-freeze-last');
            }
        });
    }

    _updatePagination(entry) {
        const wrapper = this.container.parentNode;
        let footerBar = wrapper.querySelector('.CUI-table-footer-bar');
        if (!footerBar) {
            footerBar = document.createElement('div');
            footerBar.className = 'CUI-table-footer-bar';
            wrapper.insertBefore(footerBar, this.container.nextSibling);
        }

        const { pageNum, pageSize, total, pageCount } = entry.pageState;
        const startIdx = total === 0 ? 0 : (pageNum - 1) * pageSize + 1;
        const endIdx = Math.min(total, pageNum * pageSize);

        footerBar.innerHTML = `
            <div class="CUI-table-status-bar CUI-status CUI-status--info">
                <span>显示 ${startIdx}-${endIdx} 条 / 共 ${total} 条</span>
            </div>
            <div class="CUI-table-pagination">
                <div class="CUI-pagination-size">
                    <span>每页</span>
                    <select class="CUI-select CUI-pagination-select">
                        <option value="10" ${pageSize === 10 ? 'selected' : ''}>10</option>
                        <option value="20" ${pageSize === 20 ? 'selected' : ''}>20</option>
                        <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
                        <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
                    </select>
                    <span>条</span>
                </div>
                <button class="CUI-btn CUI-btn-sm CUI-pagination-btn-prev" ${pageNum === 1 ? 'disabled' : ''}>上一页</button>
                <span class="CUI-pagination-info">${pageNum} / ${pageCount} 页</span>
                <button class="CUI-btn CUI-btn-sm CUI-pagination-btn-next" ${pageNum === pageCount ? 'disabled' : ''}>下一页</button>
                <div class="CUI-pagination-jump">
                    <span>跳至</span>
                    <input type="number" class="CUI-input CUI-pagination-jump-input" min="1" max="${pageCount}" value="${pageNum}">
                    <span>页</span>
                </div>
            </div>
        `;

        this._bindPaginationEvents(footerBar, entry);
    }

    _bindPaginationEvents(footerBar, entry) {
        const prevBtn = footerBar.querySelector('.CUI-pagination-btn-prev');
        const nextBtn = footerBar.querySelector('.CUI-pagination-btn-next');
        const selectSize = footerBar.querySelector('.CUI-pagination-select');
        const jumpInput = footerBar.querySelector('.CUI-pagination-jump-input');

        const setPage = (page) => {
            this.registry.setPageState(this.tableId, { pageNum: page });
        };

        prevBtn?.addEventListener('click', () => {
            if (entry.pageState.pageNum > 1) {
                setPage(entry.pageState.pageNum - 1);
            }
        });

        nextBtn?.addEventListener('click', () => {
            if (entry.pageState.pageNum < entry.pageState.pageCount) {
                setPage(entry.pageState.pageNum + 1);
            }
        });

        selectSize?.addEventListener('change', (e) => {
            this.registry.setPageState(this.tableId, { pageSize: parseInt(e.target.value), pageNum: 1 });
        });

        jumpInput?.addEventListener('change', (e) => {
            let page = parseInt(e.target.value);
            if (isNaN(page) || page < 1) page = 1;
            if (page > entry.pageState.pageCount) page = entry.pageState.pageCount;
            setPage(page);
        });
    }

    _injectToolbar() {
        const wrapper = this.container.parentNode;
        let toolbar = wrapper.querySelector('.CUI-table-toolbar');
        if (!toolbar) {
            toolbar = document.createElement('div');
            toolbar.className = 'CUI-table-toolbar';
            wrapper.insertBefore(toolbar, this.container);
        }

        toolbar.innerHTML = `
            <div class="CUI-table-toolbar-left">
                <div class="CUI-input-box CUI-input--simple CUI-table-search-box">
                    <input type="text" id="${this.tableId}-search" class="CUI-input" placeholder="输入关键字搜索...">
                </div>
            </div>
            <div class="CUI-table-toolbar-right"></div>
        `;

        const searchInput = toolbar.querySelector(`#${this.tableId}-search`);
        let searchTimer = null;
        searchInput?.addEventListener('input', (e) => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                this.dataLayer.search(this.tableId, e.target.value.trim());
            }, 300);
        });
    }

    _formatCellValue(value, type, header) {
        if (value === undefined || value === null) return '';
        const str = String(value);
        header = header || {};

        switch (type) {
            case 'currency': {
                const symbol = header.currencySymbol || '¥';
                const decimals = header.decimals !== undefined ? header.decimals : 2;
                const num = parseFloat(str);
                if (isNaN(num)) return escapeHtml(str);
                const formatted = num.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                return `<span class="CUI-table-cell-currency"><span class="CUI-currency-symbol">${escapeHtml(symbol)}</span><span class="CUI-currency-amount">${formatted}</span></span>`;
            }
            case 'number': {
                const decimals = header.decimals !== undefined ? header.decimals : 0;
                const num = parseFloat(str);
                if (isNaN(num)) return `<span class="CUI-cell-text">${escapeHtml(str)}</span>`;
                return `<span class="CUI-cell-text">${num.toFixed(decimals)}</span>`;
            }
            case 'email': {
                return `<a href="mailto:${escapeHtml(str)}" class="CUI-table-cell-email">${escapeHtml(str)}</a>`;
            }
            case 'link': {
                const prefix = header.linkPrefix || '';
                return `<a href="${escapeHtml(prefix + str)}" class="CUI-table-cell-link" target="_blank" rel="noopener">${escapeHtml(str)}</a>`;
            }
            case 'image':
                return `<img src="${escapeHtml(str)}" alt="" class="CUI-table-cell-image" loading="lazy">`;
            default:
                return `<span class="CUI-cell-text">${escapeHtml(str)}</span>`;
        }
    }

    _isMaskedType(type) {
        return type === 'id' || type === 'idcard' || type === 'phone' || type === 'password';
    }

    _getCellMask(type, value) {
        if (value === undefined || value === null) return null;
        const str = String(value);

        switch (type) {
            case 'id':
                if (str.length <= 4) return str;
                return str.slice(0, Math.floor(str.length / 4)) + '*'.repeat(str.length - Math.floor(str.length / 4) * 2) + str.slice(-Math.floor(str.length / 4));
            case 'idcard':
                if (str.length === 18) return str.replace(/^(\d{6})\d{8}(\d{4})$/, '$1********$2');
                if (str.length === 15) return str.replace(/^(\d{6})\d{6}(\d{3})$/, '$1******$2');
                return str;
            case 'phone':
                if (str.length === 11) return str.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
                return str;
            case 'password':
                return '*'.repeat(Math.min(str.length, 16));
            default:
                return null;
        }
    }
}

/**
 * ============================================================
 * 第四层：初始化模块 (TableInit)
 * 职责：扫描识别、双向跳过判定、四状态机管控、容错降级
 * ============================================================
 */
class TableInit {
    constructor(registry, dataLayer) {
        this.registry = registry;
        this.dataLayer = dataLayer;
        this.renderLayers = new Map();
    }

    init() {
        debug('表格组件初始化模块启动');
        this.scanAndInit();
        this.bindDOMObserver();
    }

    scanAndInit() {
        document.querySelectorAll('table.CUI-table').forEach(el => {
            if (this._shouldSkip(el)) return;
            this.initTable(el);
        });
    }

    _shouldSkip(element) {
        if (element.getAttribute('data-table-init') === 'finish') return true;
        const entry = this.registry.get(element.id);
        if (entry && (entry.initStatus === 'error' || entry.initStatus === 'loading')) return true;
        return false;
    }

    async initTable(element) {
        const tableId = element.id || `cui-table-${Date.now()}`;
        if (!element.id) element.id = tableId;

        this.registry.register(tableId, this._extractConfig(element));
        this.registry.setStatus(tableId, 'loading');

        try {
            const headers = this._extractHeadersFromDOM(element);
            const dataSource = this._getDataSource(element);

            let rawData = [];
            if (dataSource) {
                rawData = await this._loadRemoteData(dataSource);
            } else {
                rawData = this._extractDataFromDOM(element);
            }

            const result = this.dataLayer.processRawData(tableId, rawData, headers);
            
            if (result.code === 0) {
                this._initializeSuccess(tableId, element);
            } else {
                this._initializeError(tableId, element, result.msg);
            }
        } catch (error) {
            this._initializeError(tableId, element, error.message);
        }
    }

    _extractConfig(element) {
        const dataAttr = element.getAttribute('data-cui-table');
        let parsedConfig = {};
        if (dataAttr) {
            try { parsedConfig = JSON.parse(dataAttr); } catch (e) {}
        }

        return {
            dataSource: parsedConfig.dataSource || element.getAttribute('data-data-source') || '',
            striped: parsedConfig.striped !== false && element.getAttribute('data-striped') !== 'false',
            pageSize: parsedConfig.pageSize || 10,
            type: parsedConfig.type || 'display',
            longDebounce: parsedConfig.longDebounce === true
        };
    }

    _extractHeadersFromDOM(element) {
        const headers = [];
        const ths = element.querySelectorAll('thead tr:last-child th');
        ths.forEach((th, idx) => {
            const field = th.getAttribute('data-field') || th.textContent.trim() || `col_${idx}`;
            const label = th.textContent.trim() || field;
            const type = th.getAttribute('data-type') || 'text';
            const summary = th.getAttribute('data-summary') || '';
            headers.push({ field, label, type, summary });
        });
        return headers;
    }

    _getDataSource(element) {
        const dataAttr = element.getAttribute('data-cui-table');
        if (dataAttr) {
            try {
                const parsed = JSON.parse(dataAttr);
                return parsed.dataSource || '';
            } catch (e) {}
        }
        return element.getAttribute('data-data-source') || '';
    }

    async _loadRemoteData(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('json')) {
            return await response.json();
        } else if (contentType.includes('csv') || url.endsWith('.csv')) {
            const text = await response.text();
            return this._parseCSV(text);
        } else {
            throw new Error('不支持的文件格式');
        }
    }

    _parseCSV(text) {
        const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
        if (lines.length === 0) return [];

        const headers = this._parseCSVLine(lines[0]);
        const data = lines.slice(1).map(line => {
            const values = this._parseCSVLine(line);
            const row = {};
            headers.forEach((h, i) => {
                row[h] = values[i] ?? '';
            });
            return row;
        });

        return data;
    }

    /**
     * 解析单行 CSV，支持引号内逗号与 "" 转义
     */
    _parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (inQuotes) {
                if (char === '"' && nextChar === '"') {
                    current += '"';
                    i++;
                } else if (char === '"') {
                    inQuotes = false;
                } else {
                    current += char;
                }
            } else {
                if (char === '"') {
                    inQuotes = true;
                } else if (char === ',') {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
        }
        result.push(current.trim());
        return result;
    }

    _extractDataFromDOM(element) {
        const data = [];
        const tbody = element.querySelector('tbody');
        if (!tbody) return data;

        const ths = element.querySelectorAll('thead tr:last-child th');
        const headers = Array.from(ths).map((th, idx) => 
            th.getAttribute('data-field') || th.textContent.trim() || `col_${idx}`
        );

        tbody.querySelectorAll('tr').forEach(tr => {
            const row = {};
            tr.querySelectorAll('td').forEach((td, idx) => {
                row[headers[idx]] = td.textContent.trim();
            });
            data.push(row);
        });

        return data;
    }

    _initializeSuccess(tableId, element) {
        this.registry.setStatus(tableId, 'success');
        element.setAttribute('data-table-init', 'finish');

        const renderLayer = new TableRenderLayer(this.registry, this.dataLayer, element);
        this.renderLayers.set(tableId, renderLayer);

        renderLayer.render();

        this._bindEditEvents(tableId, element);
        this._bindSortEvents(tableId, element);
    }

    _initializeError(tableId, element, error) {
        this.registry.setStatus(tableId, 'error', error);
        console.error(`[TableInit] 表格 ${tableId} 初始化失败:`, error);
    }

    _bindEditEvents(tableId, element) {
        const tbody = element.querySelector('tbody');
        if (!tbody) return;

        tbody.addEventListener('focusout', (e) => {
            const td = e.target.closest('td');
            if (td && td.hasAttribute('contenteditable')) {
                const field = td.getAttribute('data-field');
                const rowIndex = parseInt(td.getAttribute('data-row-index'));
                const newValue = td.textContent.trim();

                if (field && !isNaN(rowIndex)) {
                    this.dataLayer.updateCell(tableId, rowIndex, field, newValue);
                }
            }
        });
    }

    _bindSortEvents(tableId, element) {
        const thead = element.querySelector('thead');
        if (!thead) return;

        thead.addEventListener('click', (e) => {
            const th = e.target.closest('th');
            if (!th) return;

            const entry = this.registry.get(tableId);
            if (!entry || entry.config.type !== 'functional') return;

            const field = th.getAttribute('data-field') || th.textContent.trim();
            const currentRules = entry.sortRules.filter(r => r.field === field);

            /* 三态循环：无排序 → 升序 → 降序 → 取消排序（无）→ 升序... */
            element.querySelectorAll('thead th').forEach(t => t.classList.remove('CUI-sort-asc', 'CUI-sort-desc'));

            if (currentRules.length === 0) {
                /* 无 → 升序 */
                this.dataLayer.sort(tableId, { field, order: 'asc' });
                th.classList.add('CUI-sort-asc');
            } else if (currentRules[0].order === 'asc') {
                /* 升序 → 降序 */
                this.dataLayer.sort(tableId, { field, order: 'desc' });
                th.classList.add('CUI-sort-desc');
            } else {
                /* 降序 → 取消排序 */
                this.dataLayer.unsort(tableId, field);
                /* 清除 class 后不加新 class，恢复默认 ↕ 图标 */
            }
            /* 排序变更通过 registry 'filtered' 事件触发 _scheduleUpdate → render，
             * 无需手动调用 render（TableInit 无 render 方法）。 */
        });
    }

    bindDOMObserver() {
        domObserver.onAdd('cui-table-auto-init', 'table.CUI-table', (el) => {
            if (!this._shouldSkip(el)) {
                this.initTable(el);
            }
        });

        domObserver.onRemove('cui-table-auto-destroy', 'table.CUI-table', (el) => {
            if (el.id) {
                if (!document.contains(el)) {
                    this.registry.destroy(el.id);
                    this.renderLayers.delete(el.id);
                    debug('表格组件从管理系统移除', null, { id: el.id });
                }
            }
        });
    }
}

/**
 * ============================================================
 * 对外API入口 (Table)
 * ============================================================
 */
class Table {
    constructor() {
        this.registry = new CUITableRegistry();
        this.dataLayer = new TableDataLayer(this.registry);
        this.initModule = new TableInit(this.registry, this.dataLayer);
    }

    init() {
        this.initModule.init();
    }

    getData(tableId) {
        const entry = this.registry.get(tableId);
        return entry ? entry.filteredData : null;
    }

    getOriginalData(tableId) {
        const entry = this.registry.get(tableId);
        return entry ? entry.rawData : null;
    }

    getTableEntry(tableId) {
        return this.registry.get(tableId);
    }

    setData(tableId, newData) {
        const entry = this.registry.get(tableId);
        if (!entry) return false;

        const headers = this._extractHeadersFromDOM(tableId);
        const result = this.dataLayer.updateData(tableId, newData, headers);
        return result.code === 0;
    }

    updateData(tableId, newData) {
        return this.setData(tableId, newData);
    }

    updateCell(tableId, rowIndex, field, value) {
        return this.dataLayer.updateCell(tableId, rowIndex, field, value);
    }

    filter(tableId, rule) {
        return this.dataLayer.filter(tableId, rule);
    }

    sort(tableId, rule) {
        return this.dataLayer.sort(tableId, rule);
    }

    unsort(tableId, field) {
        return this.dataLayer.unsort(tableId, field);
    }

    search(tableId, keyword, field = 'all', mode = 'fuzzy') {
        return this.dataLayer.search(tableId, keyword, field, mode);
    }

    setPage(tableId, pageNum) {
        this.registry.setPageState(tableId, { pageNum });
        return true;
    }

    refresh(tableId) {
        const entry = this.registry.get(tableId);
        if (!entry) return false;
        this.dataLayer.recalculate(tableId);
        return true;
    }

    _extractHeadersFromDOM(tableId) {
        const element = document.getElementById(tableId);
        if (!element) return [];

        const headers = [];
        const ths = element.querySelectorAll('thead tr:last-child th');
        ths.forEach((th, idx) => {
            const field = th.getAttribute('data-field') || th.textContent.trim() || `col_${idx}`;
            const label = th.textContent.trim() || field;
            const type = th.getAttribute('data-type') || 'text';
            const summary = th.getAttribute('data-summary') || '';
            headers.push({ field, label, type, summary });
        });
        return headers;
    }
}

const tableInstance = new Table();
if (!window.CUI) window.CUI = {};
window.CUI.table = tableInstance;
window.CUI.tableRegistry = tableInstance.registry;
window.CUI.tableDataLayer = tableInstance.dataLayer;

window.CUI.registerModule('table', {
    dependencies: ['core', 'ui'],
    stages: {
        READY: () => {
            tableInstance.init();
        }
    }
});

export { Table, CUITableRegistry, TableDataLayer, TableRenderLayer, TableInit };