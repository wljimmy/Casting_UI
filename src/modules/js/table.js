/*
 * Casting UI Framework
 * Version: 0.11.0
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
        if (config.pageSize) {
            defaultEntry.pageState.pageSize = config.pageSize;
        }
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

    unfilter(tableId, index) {
        this.registry.removeFilterRule(tableId, index);
        this.recalculate(tableId);
        const entry = this.registry.get(tableId);
        return { code: 0, total: entry.filteredData.length, filterRules: entry.filterRules };
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

/**
 * 通用遮罩组件 - 单例
 * 渲染期间覆盖指定容器，防止用户操作。所有组件共用同一个遮罩实例。
 * 单一遮罩：如果已经打开，再次调用 show() 不会重复创建，保持原状。
 * 用法: CUI.loadingOverlay.show(wrapper) / CUI.loadingOverlay.hide()
 */
if (!window.CUI.loadingOverlay) {
    let _el = null;
    let _visible = false;
    window.CUI.loadingOverlay = {
        show(wrapper) {
            if (_visible) return; // 已打开则不再重复操作
            if (!_el) {
                _el = document.createElement('div');
                _el.className = 'CUI-table-loading-overlay';
                _el.innerHTML = '<div class="CUI-loading CUI-loading-lg"></div>';
            }
            if (wrapper && wrapper.style) {
                if (wrapper.style.position !== 'absolute' && wrapper.style.position !== 'fixed') {
                    wrapper.style.position = 'relative';
                }
                wrapper.appendChild(_el);
            }
            _el.style.display = 'flex';
            _visible = true;
        },
        hide() {
            if (!_visible) return; // 已关闭则不再重复操作
            if (_el && _el.parentNode) {
                _el.parentNode.removeChild(_el);
            }
            _visible = false;
        }
    };
}

class TableRenderLayer {
    constructor(registry, dataLayer, element) {
        this.registry = registry;
        this.dataLayer = dataLayer;
        this.element = element;
        this.tableId = element.id;
        this.freezeConfig = this._extractFreezeConfig();
        // Apply freeze related classes on the table element (only add advanced classes, no hidden classes)
        if (this.freezeConfig.frozenLeft && this.freezeConfig.frozenLeft.mode === 'advanced') {
            this.element.classList.add('CUI-advanced-left');
        } else {
            this.element.classList.remove('CUI-advanced-left');
        }
        if (this.freezeConfig.frozenRight && this.freezeConfig.frozenRight.mode === 'advanced') {
            this.element.classList.add('CUI-advanced-right');
        } else {
            this.element.classList.remove('CUI-advanced-right');
        }
        this.originalTfootContent = {};
        this.summaryMethods = {}; // 存储每列用户选择的汇总方式
        this.debounceTimer = null;
        this.lastHeaderHash = '';
        /* 防抖时长：默认 500ms，配置 longDebounce:true 时为 1000ms */
        const entry = registry.get(this.tableId);
        this.debounceMs = (entry?.config?.longDebounce) ? 1000 : 500;
        this.init();
    }

    _extractFreezeConfig() {
        const entry = this.registry.get(this.tableId);
        const freeze = entry?.config?.freeze || {};

        const parseFrozenSide = (value) => {
            if (value === true || value === 'true') return { fields: [], mode: 'simple' };
            if (Array.isArray(value)) {
                if (value.length === 0) return { fields: [], mode: 'none' };
                return { fields: value, mode: 'advanced' };
            }
            return { fields: [], mode: 'none' };
        };

        const frozenLeft = parseFrozenSide(freeze.left);
        const frozenRight = parseFrozenSide(freeze.right);

        const parseWidth = (value) => {
            const w = parseInt(value, 10);
            if (isNaN(w)) return 80;
            return Math.max(40, Math.min(120, w));
        };

        const hasAdvancedFreeze = frozenLeft.mode === 'advanced' || frozenRight.mode === 'advanced';
        const mustFreezeHeader = hasAdvancedFreeze;

        const simpleHeader = freeze.header === true;
        const footer = freeze.footer === true;

        const firstCol = frozenLeft.mode === 'simple' || frozenLeft.mode === 'advanced';
        const lastCol = frozenRight.mode === 'simple' || frozenRight.mode === 'advanced';

        return {
            header: simpleHeader || mustFreezeHeader,
            footer,
            firstCol,
            lastCol,
            frozenLeft: { ...frozenLeft, width: parseWidth(freeze.leftWidth) },
            frozenRight: { ...frozenRight, width: parseWidth(freeze.rightWidth) },
            mergeCells: Array.isArray(freeze.mergeCells) ? freeze.mergeCells : []
        };
    }

    init() {
        this.initWrapper();
        // 仅在高级冻结启用时添加对应方向的占位
        this._addLeftHintPlaceholders();
        this._addRightHintPlaceholders();
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

    // 为左侧提示列在表头和表尾插入占位 <th>（使用rowspan合并）
    _addLeftHintPlaceholders() {
        if (!(this.freezeConfig.frozenLeft && this.freezeConfig.frozenLeft.mode === 'advanced')) return;
        const addPlaceholders = (section) => {
            const el = this.element.querySelector(section);
            if (!el) return;
            const rows = el.querySelectorAll('tr');
            if (rows.length === 0) return;
            const th = document.createElement('th');
            th.className = 'CUI-hint-header-left';
            th.setAttribute('rowspan', rows.length);
            rows[0].insertBefore(th, rows[0].firstChild);
        };
        addPlaceholders('thead');
        addPlaceholders('tfoot');
    }

    // 为右侧提示列在表头和表尾插入占位 <th>（使用rowspan合并）
    _addRightHintPlaceholders() {
        if (!(this.freezeConfig.frozenRight && this.freezeConfig.frozenRight.mode === 'advanced')) return;
        const addPlaceholders = (section) => {
            const el = this.element.querySelector(section);
            if (!el) return;
            const rows = el.querySelectorAll('tr');
            if (rows.length === 0) return;
            const th = document.createElement('th');
            th.className = 'CUI-hint-header-right';
            th.setAttribute('rowspan', rows.length);
            rows[0].appendChild(th);
        };
        addPlaceholders('thead');
        addPlaceholders('tfoot');
    }

    // 填充左侧提示列（如果启用高级模式）
    _populateLeftHintColumn(headers) {
        const leftFields = (this.freezeConfig.frozenLeft && this.freezeConfig.frozenLeft.mode === 'advanced') ? this.freezeConfig.frozenLeft.fields : [];
        if (!leftFields.length) return;
        const thead = this.element.querySelector('thead');
        const rows = thead ? thead.querySelectorAll('tr') : [];
        const lastHeaderRow = rows.length ? rows[rows.length - 1] : null;
        const fieldMap = {};
        if (lastHeaderRow) {
            lastHeaderRow.querySelectorAll('th').forEach(th => {
                const field = th.getAttribute('data-CUI-field') || th.textContent.trim();
                const label = th.textContent.trim();
                fieldMap[field] = label;
            });
        }
        const renderText = (fields) => fields.map(f => fieldMap[f] || f).join(' · ');
        // 填充 thead 第一行左侧占位单元格（使用rowspan合并，只填充一个）
        if (rows.length > 0) {
            const first = rows[0].firstElementChild;
            if (first) first.textContent = renderText(leftFields);
        }
        // 填充 tfoot 第一行左侧占位单元格
        const tfoot = this.element.querySelector('tfoot');
        if (tfoot) {
            const tfootRows = tfoot.querySelectorAll('tr');
            if (tfootRows.length > 0) {
                const first = tfootRows[0].firstElementChild;
                if (first) first.textContent = renderText(leftFields);
            }
        }
    }

    // 填充右侧提示列（如果启用高级模式）
    _populateRightHintColumn(headers) {
        const rightFields = (this.freezeConfig.frozenRight && this.freezeConfig.frozenRight.mode === 'advanced') ? this.freezeConfig.frozenRight.fields : [];
        if (!rightFields.length) return;
        const thead = this.element.querySelector('thead');
        const rows = thead ? thead.querySelectorAll('tr') : [];
        const lastHeaderRow = rows.length ? rows[rows.length - 1] : null;
        const fieldMap = {};
        if (lastHeaderRow) {
            lastHeaderRow.querySelectorAll('th').forEach(th => {
                const field = th.getAttribute('data-CUI-field') || th.textContent.trim();
                const label = th.textContent.trim();
                fieldMap[field] = label;
            });
        }
        const renderText = (fields) => fields.map(f => fieldMap[f] || f).join(' · ');
        // 填充 thead 第一行右侧占位单元格（使用rowspan合并，只填充一个）
        if (rows.length > 0) {
            const last = rows[0].lastElementChild;
            if (last) last.textContent = renderText(rightFields);
        }
        // 填充 tfoot 第一行右侧占位单元格
        const tfoot = this.element.querySelector('tfoot');
        if (tfoot) {
            const tfootRows = tfoot.querySelectorAll('tr');
            if (tfootRows.length > 0) {
                const last = tfootRows[0].lastElementChild;
                if (last) last.textContent = renderText(rightFields);
            }
        }
    }

    _setHintColumnWidths() {
        const { frozenLeft, frozenRight } = this.freezeConfig;
        
        if (frozenLeft.mode === 'advanced') {
            this.element.querySelectorAll('.CUI-hint-header-left, .CUI-hint-cell-left').forEach(cell => {
                cell.style.width = `${frozenLeft.width}px`;
            });
        }
        
        if (frozenRight.mode === 'advanced') {
            this.element.querySelectorAll('.CUI-hint-header-right, .CUI-hint-cell-right').forEach(cell => {
                cell.style.width = `${frozenRight.width}px`;
            });
        }
    }

    setHintColumnWidth(direction, width) {
        const parsedWidth = parseInt(width, 10);
        if (isNaN(parsedWidth)) return false;
        
        const clampedWidth = Math.max(40, Math.min(120, parsedWidth));
        
        if (direction === 'left') {
            if (!this.freezeConfig.frozenLeft || this.freezeConfig.frozenLeft.mode !== 'advanced') {
                return false;
            }
            this.freezeConfig.frozenLeft.width = clampedWidth;
            this.element.querySelectorAll('.CUI-hint-header-left, .CUI-hint-cell-left').forEach(cell => {
                cell.style.width = `${clampedWidth}px`;
            });
        } else if (direction === 'right') {
            if (!this.freezeConfig.frozenRight || this.freezeConfig.frozenRight.mode !== 'advanced') {
                return false;
            }
            this.freezeConfig.frozenRight.width = clampedWidth;
            this.element.querySelectorAll('.CUI-hint-header-right, .CUI-hint-cell-right').forEach(cell => {
                cell.style.width = `${clampedWidth}px`;
            });
        } else {
            return false;
        }
        
        return true;
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
        this.debounceTimer = setTimeout(() => {
            CUI.loadingOverlay.show(this.container.parentNode);
            this.render();
            CUI.loadingOverlay.hide();
        }, this.debounceMs);
    }

    _extractHeadersFromDOM() {
        const headers = [];
        const thead = this.element.querySelector('thead');
        if (!thead) return headers;

        const rows = thead.querySelectorAll('tr');
        if (rows.length === 0) return headers;

        const lastRow = rows[rows.length - 1];
        const ths = lastRow.querySelectorAll('th:not(.CUI-hint-header-left):not(.CUI-hint-header-right)');

        ths.forEach((th, idx) => {
            const field = th.getAttribute('data-CUI-field') || th.textContent.trim() || `col_${idx}`;
            const label = th.textContent.trim() || field;
            const type = th.getAttribute('data-CUI-type') || 'text';
            const summary = th.getAttribute('data-CUI-summary') || '';

            const headerInfo = { field, label, type, summary, element: th };

            if (rows.length > 1) {
                const parentLabels = [];
                let currentCol = idx;
                for (let r = rows.length - 2; r >= 0; r--) {
                    const rowThs = rows[r].querySelectorAll('th:not(.CUI-hint-header-left):not(.CUI-hint-header-right)');
                    let accumulatedSpan = 0;
                    for (const rowTh of rowThs) {
                        const colspan = parseInt(rowTh.getAttribute('colspan')) || 1;
                        if (accumulatedSpan <= currentCol && accumulatedSpan + colspan > currentCol) {
                            parentLabels.push(rowTh.textContent.trim());
                            break;
                        }
                        accumulatedSpan += colspan;
                    }
                }
                headerInfo.parentLabels = parentLabels.reverse();
            }

            headers.push(headerInfo);
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

        // 根据后台排序规则同步渲染表头排序指示器（前后台彻底分离）
        this.element.querySelectorAll('thead th').forEach(th =>
            th.classList.remove('CUI-sort-asc', 'CUI-sort-desc')
        );
        (entry.sortRules || []).forEach(rule => {
            const th = this.element.querySelector(`thead th[data-CUI-field="${rule.field}"]`);
            if (th) th.classList.add(rule.order === 'asc' ? 'CUI-sort-asc' : 'CUI-sort-desc');
        });
    }

    _fullRebuild(headers, entry) {
        this._renderBody(headers, entry);
        this._renderFooter(headers, entry);
        this._applyFreezeLayout(headers);
        // 仅在对应方向启用高级冻结时填充提示列
        this._populateLeftHintColumn(headers);
        this._populateRightHintColumn(headers);

        if (entry.config.type === 'functional') {
            this._injectToolbar();
            this._updatePagination(entry);
        }

        this._syncColumnWidths();
        this._initHintObserver();
    }

    _partialUpdate(headers, entry) {
        this._renderBody(headers, entry);
        this._renderFooter(headers, entry);
        this._applyFreezeLayout(headers);
        // 仅在对应方向启用高级冻结时填充提示列
        this._populateLeftHintColumn(headers);
        this._populateRightHintColumn(headers);

        if (entry.config.type === 'functional') {
            this._updatePagination(entry);
        }

        this._syncColumnWidths();
        this._setHintColumnWidths();
        this._initHintObserver();
    }

    _getColumnWidths() {
        const lastRow = this.element.querySelector('thead tr:last-child');
        if (!lastRow) return [];
        const ths = lastRow.querySelectorAll('th');
        if (!ths.length) return [];

        const widths = [];
        let colIndex = 0;
        ths.forEach(th => {
            const colspan = parseInt(th.getAttribute('colspan')) || 1;
            const computedWidth = window.getComputedStyle(th).width;
            for (let i = 0; i < colspan; i++) {
                widths[colIndex++] = computedWidth;
            }
        });
        return widths;
    }

    /**
     * 列宽同步：thead th 定义列宽（CSS 规则），JS 读取 th 计算宽度
     * 通过 CSS 变量 --cw 同步到所有 tbody/tfoot 单元格，实现"定义一次，自动传播"。
     * flex 布局破坏了原生 table 的列宽共享，需此方法显式同步。
     */
    _syncColumnWidths() {
        const widths = this._getColumnWidths();
        if (!widths.length) return;

        const getMergedWidth = (startCol, colspan) => {
            let totalWidth = 0;
            for (let i = 0; i < colspan; i++) {
                const w = widths[startCol + i];
                if (w) {
                    const num = parseFloat(w);
                    if (!isNaN(num)) {
                        totalWidth += num;
                    }
                }
            }
            return totalWidth > 0 ? `${totalWidth}px` : widths[startCol];
        };

        this.element.querySelectorAll('tbody tr').forEach(tr => {
            if (tr.querySelector('.CUI-table-empty')) return;
            const tds = tr.querySelectorAll('td');
            let currentCol = 0;
            tds.forEach(td => {
                const colspan = parseInt(td.getAttribute('colspan')) || 1;
                const mergedWidth = getMergedWidth(currentCol, colspan);
                if (mergedWidth) {
                    td.style.width = mergedWidth;
                }
                currentCol += colspan;
            });
        });

        const tfootRows = this.element.querySelectorAll('tfoot tr');
        tfootRows.forEach(tfootRow => {
            const cells = tfootRow.querySelectorAll('td, th');
            let currentCol = 0;
            cells.forEach(cell => {
                const colspan = parseInt(cell.getAttribute('colspan')) || 1;
                const mergedWidth = getMergedWidth(currentCol, colspan);
                if (mergedWidth) {
                    cell.style.width = mergedWidth;
                }
                currentCol += colspan;
            });
        });
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

        const isDisplay = entry.config.type === 'display';
        const mergeCells = isDisplay ? (this.freezeConfig.mergeCells || []) : [];

        const colWidths = this._getColumnWidths();

        const rowspans = new Map();

        const leftFields = (this.freezeConfig.frozenLeft && this.freezeConfig.frozenLeft.mode === 'advanced') ? this.freezeConfig.frozenLeft.fields : [];
        const rightFields = (this.freezeConfig.frozenRight && this.freezeConfig.frozenRight.mode === 'advanced') ? this.freezeConfig.frozenRight.fields : [];

        // 构建字段类型映射，用于提示列中识别掩码字段
        const fieldTypeMap = {};
        headers.forEach(h => { fieldTypeMap[h.field] = h.type; });

        const leftHintTexts = [];
        const rightHintTexts = [];
        
        data.forEach((row, rowIndex) => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-CUI-row-id', row._id);
            tr.setAttribute('data-CUI-row-original-index', row._originalIndex);

            // 添加左侧提示列（仅在高级模式启用时，放在最前面）
            if (leftFields.length > 0) {
                const leftText = leftFields.map(field => {
                    const val = row[field] || '';
                    const type = fieldTypeMap[field];
                    if (this._isMaskedType(type)) {
                        const masked = this._getCellMask(type, val);
                        return masked !== null ? masked : val;
                    }
                    return val;
                }).join(' · ');
                leftHintTexts.push(leftText);
                const leftTd = document.createElement('td');
                leftTd.className = 'CUI-hint-cell-left';
                leftTd.textContent = leftText;
                tr.appendChild(leftTd);
            }

            let colIndex = 0;
            
            while (colIndex < headers.length) {
                const rsKey = `${rowIndex}-${colIndex}`;
                if (rowspans.has(rsKey)) {
                    rowspans.set(rsKey, rowspans.get(rsKey) - 1);
                    if (rowspans.get(rsKey) <= 0) {
                        rowspans.delete(rsKey);
                    }
                    colIndex++;
                    continue;
                }

                const h = headers[colIndex];
                const td = document.createElement('td');
                const value = row[h.field] ?? '';

                td.setAttribute('data-CUI-field', h.field);
                td.setAttribute('data-CUI-row-index', row._originalIndex);
                td.setAttribute('data-CUI-value', String(value));
                if (h.type) td.setAttribute('data-CUI-type', h.type);

                const cellClasses = [];
                const isEditable = h.element?.getAttribute('data-CUI-editable') === 'true' ||
                                   (entry.config.type === 'functional' && h.field !== 'id' && h.field !== 'ID');
                if (isEditable) {
                    td.setAttribute('contenteditable', 'true');
                    cellClasses.push('CUI-editable-cell');
                }

                if (this._isMaskedType(h.type)) {
                    const maskText = this._getCellMask(h.type, value);
                    if (maskText !== null) {
                        cellClasses.push('CUI-table-cell-masked');
                        td.setAttribute('data-CUI-masked', maskText);
                    }
                }

                if (h.type === 'number' || h.type === 'currency') {
                    cellClasses.push('CUI-td-number');
                }
                if (h.type === 'text-long') {
                    cellClasses.push('CUI-td-long');
                }

                if (isDisplay) {
                    const mergeRule = mergeCells.find(m => m.row === rowIndex && m.col === colIndex);
                    if (mergeRule) {
                        const { colspan = 1, rowspan = 1 } = mergeRule;
                        if (colspan > 1) {
                            td.setAttribute('colspan', colspan);
                            cellClasses.push('CUI-cell-merged-col');
                        }
                        if (rowspan > 1) {
                            td.setAttribute('rowspan', rowspan);
                            cellClasses.push('CUI-cell-merged-row');
                            for (let j = 1; j < rowspan; j++) {
                                for (let k = 0; k < colspan; k++) {
                                    rowspans.set(`${rowIndex + j}-${colIndex + k}`, rowspan - j);
                                }
                            }
                        }
                        td.className = cellClasses.join(' ');
                        td.innerHTML = this._formatCellValue(value, h.type, h);
                        colIndex += colspan;
                        tr.appendChild(td);
                        continue;
                    }
                }

                td.className = cellClasses.join(' ');
                td.innerHTML = this._formatCellValue(value, h.type, h);
                tr.appendChild(td);
                
                colIndex++;
            }

            // 添加右侧提示列（仅在高级模式启用时，放在最后面）
            if (rightFields.length > 0) {
                const rightText = rightFields.map(field => {
                    const val = row[field] || '';
                    const type = fieldTypeMap[field];
                    if (this._isMaskedType(type)) {
                        const masked = this._getCellMask(type, val);
                        return masked !== null ? masked : val;
                    }
                    return val;
                }).join(' · ');
                rightHintTexts.push(rightText);
                const rightTd = document.createElement('td');
                rightTd.className = 'CUI-hint-cell-right';
                rightTd.textContent = rightText;
                tr.appendChild(rightTd);
            }

            tbody.appendChild(tr);
        });
        
        this._setHintColumnWidths();
    }

    /**
     * 判断某列是否启用汇总
     * 规则：
     * - data-CUI-summary="enable" → 强制启用
     * - data-CUI-summary="none" → 强制排除
     * - data-CUI-type 为 number/currency → 默认启用
     * - 其他类型 → 默认排除
     */
    _isSummaryEnabled(header) {
        const summaryAttr = header.element?.getAttribute('data-CUI-summary') || header.summary || '';
        
        // 强制启用
        if (summaryAttr === 'enable') return true;
        // 强制排除
        if (summaryAttr === 'none') return false;
        // 如果有具体的汇总规则（如 sum/count/max/min/avg），视为启用
        if (['sum', 'count', 'max', 'min', 'avg'].includes(summaryAttr)) return true;
        
        // 根据类型自动判断
        const type = header.type || 'text';
        return type === 'number' || type === 'currency';
    }

    /**
     * 获取某列支持的汇总方式列表
     */
    _getSummaryOptions(type) {
        const numericOptions = [
            { value: 'sum', label: '求和', abbr: 'SUM' },
            { value: 'avg', label: '平均值', abbr: 'AVG' },
            { value: 'max', label: '最大值', abbr: 'MAX' },
            { value: 'min', label: '最小值', abbr: 'MIN' },
            { value: 'count', label: '计数', abbr: 'CNT' }
        ];
        const otherOptions = [
            { value: 'count', label: '计数', abbr: 'CNT' },
            { value: 'max', label: '最大值', abbr: 'MAX' },
            { value: 'min', label: '最小值', abbr: 'MIN' }
        ];
        
        return (type === 'number' || type === 'currency') ? numericOptions : otherOptions;
    }

    /**
     * 获取某列默认的汇总方式
     */
    _getDefaultSummaryMethod(header) {
        const summaryAttr = header.element?.getAttribute('data-CUI-summary') || header.summary || '';
        // 如果用户指定了汇总方式，使用用户指定的
        if (['sum', 'count', 'max', 'min', 'avg'].includes(summaryAttr)) {
            return summaryAttr;
        }
        // 默认求和
        return 'sum';
    }

    /**
     * 计算汇总值
     */
    _calculateSummary(values, type, method) {
        if (!values.length) return '';
        
        const numericMethods = ['sum', 'count', 'max', 'min', 'avg'];
        
        if (type === 'number' || type === 'currency') {
            const numValues = values
                .map(v => parseFloat(v))
                .filter(v => !isNaN(v));
            
            if (!numValues.length) return '';
            
            switch (method) {
                case 'sum': return numValues.reduce((sum, v) => sum + v, 0);
                case 'count': return numValues.length;
                case 'max': return Math.max(...numValues);
                case 'min': return Math.min(...numValues);
                case 'avg': return numValues.reduce((sum, v) => sum + v, 0) / numValues.length;
                default: return '';
            }
        } else if (type === 'date' || type === 'datetime') {
            const dateValues = values
                .map(v => Date.parse(v))
                .filter(v => !isNaN(v));
            
            if (!dateValues.length) return '';
            
            switch (method) {
                case 'max': return new Date(Math.max(...dateValues)).toISOString().slice(0, 10);
                case 'min': return new Date(Math.min(...dateValues)).toISOString().slice(0, 10);
                case 'count': return dateValues.length;
                default: return '';
            }
        } else {
            // 其他类型只支持计数
            if (method === 'count') {
                return values.filter(v => v !== undefined && v !== null && String(v).trim() !== '').length;
            }
            return '';
        }
    }

    /**
     * 更新单个单元格的汇总值
     */
    _updateSummaryCell(cell, header, data) {
        if (!cell || !header) return;
        
        const method = this.summaryMethods[header.field] || this._getDefaultSummaryMethod(header);
        const type = header.type || 'text';
        const values = data.map(row => row[header.field]).filter(v => v !== undefined && v !== null && String(v).trim() !== '');
        const calculatedVal = this._calculateSummary(values, type, method);
        
        if (calculatedVal !== '' && calculatedVal !== undefined) {
            // 为 avg 汇总方法增加小数位精度
            const summaryHeader = { ...header };
            if (method === 'avg' && (type === 'number' || type === 'currency')) {
                summaryHeader.decimals = 2;
            }
            
            if (type === 'currency') {
                cell.innerHTML = this._formatCellValue(calculatedVal, 'currency', summaryHeader);
            } else if (type === 'number') {
                cell.innerHTML = this._formatCellValue(calculatedVal, 'number', summaryHeader);
            } else {
                cell.textContent = String(calculatedVal);
            }
        } else {
            // 空值显示占位
            cell.innerHTML = `<span class="CUI-summary-empty">—</span>`;
        }
    }

    /**
     * 创建汇总下拉选择器（旋转 select 样式）
     */
    _createSummarySelect(field, type, currentMethod) {
        const options = this._getSummaryOptions(type);
        const select = document.createElement('select');
        select.className = 'CUI-summary-select';
        select.setAttribute('data-CUI-field', field);

        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.abbr;
            if (opt.value === currentMethod) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        return select;
    }

    /**
     * 修正旋转 select 的偏移
     * 旋转 -90° 后，元素宽度变成了高度方向的偏移量
     * 先 translateY 再 rotate，这样平移是在旋转前的坐标系中进行
     */
    _fixSelectTransform(select) {
        if (!select || !select.offsetWidth) return;
        const offset = select.offsetWidth * 0.75; // scale(0.75) 补偿
        select.style.transform = `translateY(${offset}px) rotate(-90deg) scale(0.75)`;
    }

    /**
     * 绑定汇总切换事件
     */
    _bindSummaryEvents() {
        const tfoot = this.element.querySelector('tfoot');
        if (!tfoot) return;

        if (!this._summaryBound) {
            tfoot.addEventListener('change', (e) => {
                if (e.target.classList.contains('CUI-summary-select')) {
                    const field = e.target.getAttribute('data-CUI-field');
                    const method = e.target.value;
                    this.summaryMethods[field] = method;

                    // 重新计算该列的汇总值（基于当前页数据）
                    const headers = this._extractHeadersFromDOM();
                    const header = headers.find(h => h.field === field);
                    if (!header) return;

                    const cell = tfoot.querySelector(`td[data-CUI-summary-field="${field}"]`);
                    if (cell) {
                        const valueSpan = cell.querySelector('.CUI-summary-value');
                        if (valueSpan) {
                            const { data } = this.dataLayer.paginate(this.tableId);
                            this._updateSummaryCell(valueSpan, header, data);
                        }
                    }
                }
            });
            this._summaryBound = true;
        }
    }

    _renderFooter(headers, entry) {
        const tfoot = this.element.querySelector('tfoot');
        if (!tfoot) return;

        const leftFields = (this.freezeConfig.frozenLeft && this.freezeConfig.frozenLeft.mode === 'advanced') ? this.freezeConfig.frozenLeft.fields : [];
        const rightFields = (this.freezeConfig.frozenRight && this.freezeConfig.frozenRight.mode === 'advanced') ? this.freezeConfig.frozenRight.fields : [];

        // 汇总统计基于当前页数据（与表体一致）
        const { data } = this.dataLayer.paginate(this.tableId);
        const totalCols = headers.length + (leftFields.length > 0 ? 1 : 0) + (rightFields.length > 0 ? 1 : 0);

        tfoot.innerHTML = '';
        const footerRow = document.createElement('tr');
        tfoot.appendChild(footerRow);

        for (let i = 0; i < totalCols; i++) {
            const td = document.createElement('td');
            footerRow.appendChild(td);
        }

        let cellIndex = 0;

        if (leftFields.length > 0) {
            const firstCell = footerRow.querySelectorAll('td, th')[cellIndex];
            firstCell.className = 'CUI-hint-header-left';
            const renderText = (fields) => fields.map(f => {
                const header = headers.find(h => h.field === f);
                return header ? header.label : f;
            }).join(' · ');
            firstCell.textContent = renderText(leftFields);
            cellIndex++;
        }

        headers.forEach((h) => {
            const cell = footerRow.querySelectorAll('td, th')[cellIndex];
            if (!cell) {
                cellIndex++;
                return;
            }

            // 用户自定义内容优先级最高
            if (this.originalTfootContent[h.field] !== undefined) {
                cell.textContent = this.originalTfootContent[h.field];
                cellIndex++;
                return;
            }

            // 判断是否启用汇总
            if (this._isSummaryEnabled(h)) {
                const field = h.field;
                const type = h.type || 'text';
                
                // 确保 summaryMethods 中有该列的默认值
                if (!this.summaryMethods[field]) {
                    this.summaryMethods[field] = this._getDefaultSummaryMethod(h);
                }
                
                const currentMethod = this.summaryMethods[field];
                
                // 创建汇总容器
                const summaryWrapper = document.createElement('div');
                summaryWrapper.className = 'CUI-summary-wrapper';

                // 创建下拉选择器
                const select = this._createSummarySelect(field, type, currentMethod);
                summaryWrapper.appendChild(select);
                
                // 创建值显示容器
                const valueSpan = document.createElement('span');
                valueSpan.className = 'CUI-summary-value';
                summaryWrapper.appendChild(valueSpan);
                
                cell.appendChild(summaryWrapper);
                cell.setAttribute('data-CUI-summary-field', field);
                cell.setAttribute('data-CUI-type', type);
                cell.classList.add('CUI-summary-cell');
                
                // 修正旋转 select 的偏移
                this._fixSelectTransform(select);
                
                // 计算并显示汇总值
                this._updateSummaryCell(valueSpan, h, data);
            } else {
                cell.textContent = '';
            }

            cellIndex++;
        });

        if (rightFields.length > 0) {
            const lastCell = footerRow.querySelectorAll('td, th')[cellIndex];
            lastCell.className = 'CUI-hint-header-right';
            const renderText = (fields) => fields.map(f => {
                const header = headers.find(h => h.field === f);
                return header ? header.label : f;
            }).join(' · ');
            lastCell.textContent = renderText(rightFields);
        }

        // 绑定汇总切换事件
        this._bindSummaryEvents();
    }

    _applyFreezeLayout(headers) {
        const { header, footer, firstCol, lastCol, frozenLeft, frozenRight } = this.freezeConfig;

        const shouldFreezeHeader = header || 
            (frozenLeft.mode === 'advanced' && frozenLeft.fields.length > 0) || 
            (frozenRight.mode === 'advanced' && frozenRight.fields.length > 0);
        const shouldFreezeFooter = footer;
        const shouldFreezeFirstCol = firstCol || 
            (frozenLeft.mode === 'advanced' && frozenLeft.fields.length > 0);
        const shouldFreezeLastCol = lastCol || 
            (frozenRight.mode === 'advanced' && frozenRight.fields.length > 0);

        this.element.classList.toggle('CUI-freeze-header', shouldFreezeHeader);
        this.element.classList.toggle('CUI-freeze-footer', shouldFreezeFooter);
        this.element.classList.toggle('CUI-freeze-first-col', shouldFreezeFirstCol);
        this.element.classList.toggle('CUI-freeze-last-col', shouldFreezeLastCol);

        // 当启用表尾冻结时，给容器添加类并给表格添加底部 margin 以防止子像素间隙
        if (shouldFreezeFooter) {
            this.container.classList.add('CUI-container-freeze-footer');
            this.element.style.marginBottom = '3px';
        } else {
            this.container.classList.remove('CUI-container-freeze-footer');
            this.element.style.marginBottom = '';
        }
    }

    

    _initHintObserver() {}
    _destroyHintObserver() {}

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

        const headers = entry.header || [];
        const fieldLabel = (field) => {
            const h = headers.find(hh => hh.field === field);
            return h ? (h.label || h.field) : field;
        };

        const sortBadges = (entry.sortRules || []).map(r => `
            <span class="CUI-badge CUI-badge-outline CUI-badge-secondary CUI-badge-closeable" data-CUI-sort-field="${escapeHtml(r.field)}">
                ${escapeHtml(fieldLabel(r.field))} ${r.order === 'asc' ? '↑' : '↓'}
                <button class="CUI-badge-close" type="button">×</button>
            </span>
        `).join('');

        const filterBadges = (entry.filterRules || []).map((r, i) => `
            <span class="CUI-badge CUI-badge-outline CUI-badge-secondary CUI-badge-closeable" data-CUI-filter-index="${i}">
                ${escapeHtml(fieldLabel(r.field))} ${escapeHtml(this._filterOpLabel(r.operator))} ${escapeHtml(r.value)}
                <button class="CUI-badge-close" type="button">×</button>
            </span>
        `).join('');

        footerBar.innerHTML = `
            <div class="CUI-table-status-bar CUI-status CUI-status--info">
                <span>显示 ${startIdx}-${endIdx} 条 / 共 ${total} 条</span>
                ${sortBadges}
                ${filterBadges}
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

        footerBar.addEventListener('click', (e) => {
            const closeBtn = e.target.closest('.CUI-badge-close');
            if (!closeBtn) return;
            const badge = closeBtn.closest('.CUI-badge-closeable');
            if (!badge) return;
            const sortField = badge.getAttribute('data-CUI-sort-field');
            const filterIdx = badge.getAttribute('data-CUI-filter-index');
            if (sortField !== null) {
                this.dataLayer.unsort(this.tableId, sortField);
            } else if (filterIdx !== null) {
                this.dataLayer.unfilter(this.tableId, parseInt(filterIdx, 10));
            }
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
            <div class="CUI-table-toolbar-right">
                <button class="CUI-btn CUI-btn-sm CUI-btn-secondary CUI-table-filter-btn">筛选</button>
                <button class="CUI-btn CUI-btn-sm CUI-btn-secondary CUI-table-export-btn">导出</button>
            </div>
        `;

        const searchInput = toolbar.querySelector(`#${this.tableId}-search`);
        let searchTimer = null;
        searchInput?.addEventListener('input', (e) => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                this.dataLayer.search(this.tableId, e.target.value.trim());
            }, 300);
        });

        toolbar.querySelector('.CUI-table-filter-btn')?.addEventListener('click', () => {
            this._openFilterPanel();
        });

        toolbar.querySelector('.CUI-table-export-btn')?.addEventListener('click', () => {
            this._exportCSV();
        });
    }

    /**
     * 导出当前筛选后全量数据为 CSV（UTF-8 with BOM，Excel 兼容）
     */
    _exportCSV() {
        const entry = this.registry.get(this.tableId);
        if (!entry) return;
        const data = entry.filteredData || [];
        if (data.length === 0) {
            alert('暂无数据可导出');
            return;
        }

        const headers = entry.header || [];
        const escapeCSV = (val) => {
            const s = String(val ?? '');
            if (/[",\n\r]/.test(s)) {
                return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
        };

        const lines = [];
        lines.push(headers.map(h => escapeCSV(h.label || h.field)).join(','));
        data.forEach(row => {
            lines.push(headers.map(h => escapeCSV(row[h.field])).join(','));
        });

        const bom = '\uFEFF';
        const csv = bom + lines.join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.tableId}_${ts}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * 操作符中文映射
     */
    _filterOpLabel(op) {
        const map = {
            '=': '等于', '!=': '不等于', '>': '大于', '<': '小于',
            '>=': '≥', '<=': '≤', 'contains': '包含'
        };
        return map[op] || op;
    }

    /**
     * 打开筛选 Overlay 面板
     */
    _openFilterPanel() {
        const entry = this.registry.get(this.tableId);
        if (!entry) return;
        const headers = entry.header || [];

        const ov = window.CUI.overlay({ type: 'glass' });
        if (!ov) return;

        const fieldOptions = headers.map(h =>
            `<option value="${escapeHtml(h.field)}">${escapeHtml(h.label || h.field)}</option>`
        ).join('');
        const opOptions = [
            ['=', '等于'], ['!=', '不等于'], ['>', '大于'], ['<', '小于'],
            ['>=', '≥'], ['<=', '≤'], ['contains', '包含']
        ].map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

        ov.element.innerHTML = `
            <div class="CUI-modal-content CUI-table-filter-panel">
                <div class="CUI-table-filter-header">
                    <h3>数据筛选</h3>
                    <button class="CUI-table-filter-close" type="button">×</button>
                </div>
                <div class="CUI-table-filter-rules"></div>
                <div class="CUI-table-filter-form">
                    <select class="CUI-select CUI-filter-field">${fieldOptions}</select>
                    <select class="CUI-select CUI-filter-op">${opOptions}</select>
                    <input type="text" class="CUI-input CUI-filter-value" placeholder="筛选值">
                    <button class="CUI-btn CUI-btn-sm CUI-btn-primary CUI-filter-add-btn" type="button">添加</button>
                </div>
                <div class="CUI-table-filter-actions">
                    <button class="CUI-btn CUI-btn-sm CUI-btn-text CUI-filter-clear-all" type="button">清空全部</button>
                    <button class="CUI-btn CUI-btn-sm CUI-btn-secondary CUI-filter-close-btn" type="button">关闭</button>
                </div>
            </div>
        `;

        const close = () => ov.close();
        const renderRules = () => this._renderFilterRules(ov, entry);

        ov.element.querySelector('.CUI-table-filter-close')?.addEventListener('click', close);
        ov.element.querySelector('.CUI-filter-close-btn')?.addEventListener('click', close);
        ov.element.querySelector('.CUI-filter-clear-all')?.addEventListener('click', () => {
            this.dataLayer.clearFilters(this.tableId);
            renderRules();
        });
        ov.element.querySelector('.CUI-filter-add-btn')?.addEventListener('click', () => {
            const field = ov.element.querySelector('.CUI-filter-field').value;
            const operator = ov.element.querySelector('.CUI-filter-op').value;
            const value = ov.element.querySelector('.CUI-filter-value').value.trim();
            if (!value) {
                alert('请输入筛选值');
                return;
            }
            this.dataLayer.filter(this.tableId, { field, operator, value });
            ov.element.querySelector('.CUI-filter-value').value = '';
            renderRules();
        });

        ov.element.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.CUI-filter-rule-remove');
            if (removeBtn) {
                const idx = parseInt(removeBtn.dataset.index, 10);
                this.dataLayer.unfilter(this.tableId, idx);
                renderRules();
            }
        });

        renderRules();
    }

    /**
     * 渲染筛选面板中已添加的规则列表
     */
    _renderFilterRules(ov, entry) {
        const container = ov.element.querySelector('.CUI-table-filter-rules');
        if (!container) return;
        const rules = entry.filterRules || [];
        const headers = entry.header || [];

        if (rules.length === 0) {
            container.innerHTML = '<div class="CUI-table-filter-empty">暂无筛选规则</div>';
            return;
        }

        container.innerHTML = rules.map((r, i) => {
            const h = headers.find(hh => hh.field === r.field);
            const label = h ? (h.label || h.field) : r.field;
            return `
                <div class="CUI-table-filter-rule">
                    <span class="CUI-filter-rule-text">${escapeHtml(label)} ${escapeHtml(this._filterOpLabel(r.operator))} ${escapeHtml(r.value)}</span>
                    <button class="CUI-filter-rule-remove" type="button" data-CUI-index="${i}">×</button>
                </div>
            `;
        }).join('');
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
        this._tableCounter = 0;
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
        // 数据表格开关：只有 data-CUI-dataTable="true" 的表格才进行 JS 初始化
        if (element.getAttribute('data-CUI-dataTable') !== 'true') return true;
        if (element.getAttribute('data-CUI-table-init') === 'finish') return true;
        const entry = this.registry.get(element.id);
        if (entry && (entry.initStatus === 'error' || entry.initStatus === 'loading')) return true;
        return false;
    }

    async initTable(element) {
        const tableId = element.id || `cui-table-${Date.now()}-${this._tableCounter++}`;
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
        const dataAttr = element.getAttribute('data-CUI-config');
        let parsedConfig = {};
        if (dataAttr) {
            try { parsedConfig = JSON.parse(dataAttr); } catch (e) {}
        }

        return {
            dataSource: parsedConfig.dataSource || '',
            striped: parsedConfig.striped !== false,
            pageSize: parsedConfig.pageSize || 10,
            type: parsedConfig.type || 'display',
            longDebounce: parsedConfig.longDebounce === true,
            freeze: parsedConfig.freeze || {}
        };
    }

    _extractHeadersFromDOM(element) {
        const headers = [];
        const ths = element.querySelectorAll('thead tr:last-child th');
        ths.forEach((th, idx) => {
            const field = th.getAttribute('data-CUI-field') || th.textContent.trim() || `col_${idx}`;
            const label = th.textContent.trim() || field;
            const type = th.getAttribute('data-CUI-type') || 'text';
            const summary = th.getAttribute('data-CUI-summary') || '';
            headers.push({ field, label, type, summary });
        });
        return headers;
    }

    _getDataSource(element) {
        const dataAttr = element.getAttribute('data-CUI-config');
        if (dataAttr) {
            try {
                const parsed = JSON.parse(dataAttr);
                return parsed.dataSource || '';
            } catch (e) {}
        }
        return '';
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
            th.getAttribute('data-CUI-field') || th.textContent.trim() || `col_${idx}`
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
        element.setAttribute('data-CUI-table-init', 'finish');

        const entry = this.registry.get(tableId);
        element.setAttribute('data-CUI-table-type', entry.config.type);

        if (entry.config.striped) {
            element.classList.add('CUI-table-striped');
        }

        const renderLayer = new TableRenderLayer(this.registry, this.dataLayer, element);
        this.renderLayers.set(tableId, renderLayer);

        CUI.loadingOverlay.show(element.parentNode.parentNode);
        renderLayer.render();
        CUI.loadingOverlay.hide();

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
                const field = td.getAttribute('data-CUI-field');
                const rowIndex = parseInt(td.getAttribute('data-CUI-row-index'));
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

            const field = th.getAttribute('data-CUI-field') || th.textContent.trim();
            const currentRules = entry.sortRules.filter(r => r.field === field);

            /* 三态循环：无排序 → 升序 → 降序 → 取消排序（无）→ 升序...
             * 只修改后台状态，不操作 DOM。render() 会读取状态同步 UI。 */
            if (currentRules.length === 0) {
                this.dataLayer.sort(tableId, { field, order: 'asc' });
            } else if (currentRules[0].order === 'asc') {
                this.dataLayer.sort(tableId, { field, order: 'desc' });
            } else {
                this.dataLayer.unsort(tableId, field);
            }
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

    setHintColumnWidth(tableId, direction, width) {
        const renderLayer = this.initModule.renderLayers.get(tableId);
        if (!renderLayer) return false;
        return renderLayer.setHintColumnWidth(direction, width);
    }

    setColumnWidth(tableId, columnIndex, width) {
        const table = document.getElementById(tableId);
        if (!table) return false;
        
        const parsedWidth = parseInt(width, 10);
        if (isNaN(parsedWidth)) return false;
        
        const widthValue = `${parsedWidth}px`;
        
        const headerCells = table.querySelectorAll(`thead tr th:nth-child(${columnIndex + 1})`);
        headerCells.forEach(cell => {
            cell.style.width = widthValue;
        });
        
        const bodyCells = table.querySelectorAll(`tbody tr td:nth-child(${columnIndex + 1})`);
        bodyCells.forEach(cell => {
            cell.style.width = widthValue;
        });
        
        const footerCells = table.querySelectorAll(`tfoot tr td:nth-child(${columnIndex + 1}), tfoot tr th:nth-child(${columnIndex + 1})`);
        footerCells.forEach(cell => {
            cell.style.width = widthValue;
        });
        
        return true;
    }

    _extractHeadersFromDOM(tableId) {
        const element = document.getElementById(tableId);
        if (!element) return [];

        const headers = [];
        const ths = element.querySelectorAll('thead tr:last-child th');
        ths.forEach((th, idx) => {
            const field = th.getAttribute('data-CUI-field') || th.textContent.trim() || `col_${idx}`;
            const label = th.textContent.trim() || field;
            const type = th.getAttribute('data-CUI-type') || 'text';
            const summary = th.getAttribute('data-CUI-summary') || '';
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