/*
 * Casting UI Framework
 * Version: 0.3.0
 * Module: input.js
 * Description: Input 输入框模块，注册表管理、值操作、表单批量操作、自动美化
 * Copyright (c) 2026 Bingo工作室
 * Email: wljimmy@hotmail.com
 */

/**
 * CUI.input 注册表
 * 结构：
 * {
 *   'formId': {
 *     type: 'form',
 *     element: <form>,
 *     children: {
 *       'fieldName': { type: 'input', element: <input>, value: '' },
 *       'fieldName': { type: 'cascade', element: <div>, value: '' }
 *     }
 *   },
 *   'standaloneFieldName': { type: 'input', element: <input>, value: '' }
 * }
 */
const CUIInputRegistry = {
    _data: {},

    register(path, config) {
        const parts = path.split('.');
        if (parts.length === 1) {
            this._data[path] = config;
        } else {
            let current = this._data;
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (!current[part]) {
                    current[part] = { type: 'form', children: {} };
                }
                if (!current[part].children) {
                    current[part].children = {};
                }
                current = current[part].children;
            }
            current[parts[parts.length - 1]] = config;
        }
        this._notifyChange();
    },

    unregister(path) {
        const parts = path.split('.');
        if (parts.length === 1) {
            delete this._data[path];
        } else {
            let current = this._data;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!current[parts[i]]) return;
                current = current[parts[i]].children;
            }
            delete current[parts[parts.length - 1]];
        }
        this._notifyChange();
    },

    get(path) {
        const parts = path.split('.');
        if (parts.length === 1) {
            return this._data[path];
        }
        let current = this._data;
        for (let i = 0; i < parts.length; i++) {
            if (!current) return null;
            current = current[parts[i]];
            if (i < parts.length - 1 && current) {
                current = current.children;
            }
        }
        return current;
    },

    element(path) {
        const node = this.get(path);
        if (!node) return null;
        if (node.type === 'checkbox' || node.type === 'radio') {
            return node.elements || null;
        }
        return node.element || null;
    },

    getValue(path) {
        const node = this.get(path);
        if (!node) return null;
        if (node.type === 'checkbox' || node.type === 'radio') {
            return node.value || [];
        }
        if (node.element) {
            if (node.type === 'cascade') {
                return this._getCascadeValue(node.element);
            }
            return node.element.value || '';
        }
        return node.value || null;
    },

    setValue(path, value) {
        const node = this.get(path);
        if (!node) return;
        if (node.type === 'checkbox' || node.type === 'radio') {
            const values = Array.isArray(value) ? value : [value];
            if (node.elements) {
                node.elements.forEach(el => {
                    el.checked = values.includes(el.value);
                });
                node.value = node.elements.filter(el => el.checked).map(el => el.value);
            }
        } else if (node.element) {
            if (node.type === 'cascade') {
                this._setCascadeValue(node.element, value);
            } else {
                node.element.value = value;
                node.value = value;
            }
        }
        this._notifyChange();
    },

    getFormData(formId) {
        const formNode = this._data[formId];
        if (!formNode || formNode.type !== 'form') return null;
        const result = {};
        for (const key in formNode.children) {
            const child = formNode.children[key];
            if (child.type === 'form') {
                result[key] = this.getFormDataChild(child);
            } else if (child.type === 'checkbox' || child.type === 'radio') {
                result[key] = child.value || [];
            } else {
                result[key] = child.element ? (child.element.value || '') : (child.value || '');
            }
        }
        return result;
    },

    getFormDataChild(formNode) {
        const result = {};
        for (const key in formNode.children) {
            const child = formNode.children[key];
            if (child.type === 'form') {
                result[key] = this.getFormDataChild(child);
            } else if (child.type === 'checkbox' || child.type === 'radio') {
                result[key] = child.value || [];
            } else {
                result[key] = child.element ? (child.element.value || '') : (child.value || '');
            }
        }
        return result;
    },

    setFormData(formId, data) {
        for (const key in data) {
            const path = `${formId}.${key}`;
            this.setValue(path, data[key]);
        }
    },

    _getCascadeValue(element) {
        const selects = element.querySelectorAll('select');
        if (selects.length === 0) return '';
        const values = [];
        selects.forEach(select => {
            const text = select.options[select.selectedIndex]?.text || '';
            values.push(text);
        });
        return values.join('-');
    },

    _setCascadeValue(element, valueStr) {
        const selects = element.querySelectorAll('select');
        if (selects.length === 0) return;
        const parts = valueStr.split('-');
        selects.forEach((select, index) => {
            if (parts[index]) {
                const option = Array.from(select.options).find(opt => opt.text === parts[index]);
                if (option) select.selectedIndex = option.index;
            }
        });
    },

    _notifyChange() {
        if (typeof onRegistryChange === 'function') {
            onRegistryChange(this._data);
        }
        if (typeof window !== 'undefined' && window.CUIInputRegistryCallback) {
            window.CUIInputRegistryCallback(this._data);
        }
    },

    getAll() {
        return this._data;
    },

    clear() {
        this._data = {};
        this._notifyChange();
    },

    isValid(path) {
        const node = this.get(path);
        return node ? node.valid !== false : true;
    },

    isFormValid(formId) {
        const formNode = this._data[formId];
        if (!formNode || formNode.type !== 'form') return true;
        return this._checkChildrenValid(formNode.children);
    },

    _checkChildrenValid(children) {
        for (const key in children) {
            const child = children[key];
            if (child.type === 'form') {
                if (!this._checkChildrenValid(child.children)) return false;
            } else if (child.valid === false) {
                return false;
            }
        }
        return true;
    },

    /**
     * 设置 Info 提示信息
     * 注意：外观由 CSS 控制，JavaScript 只设置内容
     * @param {string} path - 节点路径
     * @param {string} text - 提示信息文本
     */
    setInfo(path, text) {
        const node = this.get(path);
        if (!node) {
            console.warn('[CUI.input] setInfo: 节点不存在');
            return;
        }
        
        if (!node.element) {
            console.warn('[CUI.input] setInfo: 元素引用丢失');
            return;
        }
        
        const wrapper = node.element.closest('.CUI-input-box');
        if (!wrapper) {
            console.warn('[CUI.input] setInfo: 元素不在 CUI-input-box 内，请使用正确的结构');
            return;
        }
        
        const infoEl = wrapper.querySelector('.CUI-input__info .CUI-message div');
        if (!infoEl) {
            console.warn('[CUI.input] setInfo: 缺少 .CUI-input__info 结构');
            return;
        }
        
        infoEl.textContent = text || '';
    },

    /**
     * 设置 Error 错误信息
     * 注意：外观由 CSS 控制，JavaScript 只设置内容和状态类
     * @param {string} path - 节点路径
     * @param {string} text - 错误信息文本
     */
    setError(path, text) {
        const node = this.get(path);
        if (!node) {
            console.warn('[CUI.input] setError: 节点不存在');
            return;
        }
        
        if (!node.element) {
            console.warn('[CUI.input] setError: 元素引用丢失');
            return;
        }
        
        const wrapper = node.element.closest('.CUI-input-box');
        if (!wrapper) {
            console.warn('[CUI.input] setError: 元素不在 CUI-input-box 内，请使用正确的结构');
            return;
        }
        
        const errorEl = wrapper.querySelector('.CUI-input__error .CUI-message div');
        if (!errorEl) {
            console.warn('[CUI.input] setError: 缺少 .CUI-input__error 结构');
            return;
        }
        
        errorEl.textContent = text || '';
        wrapper.classList.toggle('CUI-is-error', !!text);
    },

    /**
     * 清除所有消息（Info 和 Error）
     * @param {string} path - 节点路径
     */
    clearMessages(path) {
        const node = this.get(path);
        if (!node) {
            console.warn('[CUI.input] clearMessages: 节点不存在');
            return;
        }
        
        if (!node.element) {
            console.warn('[CUI.input] clearMessages: 元素引用丢失');
            return;
        }
        
        const wrapper = node.element.closest('.CUI-input-box');
        if (!wrapper) {
            console.warn('[CUI.input] clearMessages: 元素不在 CUI-input-box 内，请使用正确的结构');
            return;
        }
        
        const infoEl = wrapper.querySelector('.CUI-input__info .CUI-message div');
        const errorEl = wrapper.querySelector('.CUI-input__error .CUI-message div');
        
        if (infoEl) infoEl.textContent = '';
        if (errorEl) errorEl.textContent = '';
        
        wrapper.classList.remove('CUI-is-error');
    }
};

/* ================================
   图标 SVG 定义 (Tabler Icons)
   ================================ */

const CUIInputIcons = {
    search: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M21 21l-6 -6"/></svg>`,
    email: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10"/><path d="M3 7l9 6l9 -6"/></svg>`,
    tel: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2"/></svg>`,
    password: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6"/><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0"/><path d="M8 11v-4a4 4 0 1 1 8 0v4"/></svg>`,
    url: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15l6 -6"/><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464"/><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"/></svg>`,
    number: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17v-10l7 10v-10"/><path d="M15 17h5"/><path d="M15 10a2.5 3 0 1 0 5 0a2.5 3 0 1 0 -5 0"/></svg>`,
    sms: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 3h10v8h-3l-4 2v-2h-3l0 -8"/><path d="M15 16v4a1 1 0 0 1 -1 1h-8a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1h2"/><path d="M10 18v.01"/></svg>`,
    code: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8l-4 4l4 4"/><path d="M17 8l4 4l-4 4"/><path d="M14 4l-4 16"/></svg>`,
    date: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M4 11h16"/><path d="M11 15h1"/><path d="M12 15v3"/></svg>`,
    time: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M12 7v5l3 3"/></svg>`,
    user: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"/><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/></svg>`,
    userpassword: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"/><path d="M6 21v-2a4 4 0 0 1 4 -4h5"/><path d="M18.5 18.5l-3.5 3.5l-1.5 -1.5"/><path d="M18.554 18.414a2 2 0 1 1 2.828 -2.828a2 2 0 0 1 -2.828 2.828"/><path d="M16 19l1 1"/></svg>`,
    clear: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M14.5 9.5l-5 5"/><path d="M9.5 9.5l5 5"/></svg>`,
    color: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.5 0 10 -4.5 10 -10s-4.5 -10 -10 -10s-10 4.5 -10 10s4.5 10 10 10"/><path d="M12 22c-5.5 0 -10 -4.5 -10 -10s4.5 -10 10 -10s10 4.5 10 10s-4.5 10 -10 10"/></svg>`
};

const CUIInputIconMap = {
    search: 'search',
    email: 'email',
    tel: 'tel',
    telephone: 'tel',
    password: 'password',
    url: 'url',
    link: 'url',
    number: 'number',
    numeric: 'number',
    sms: 'sms',
    code: 'code',
    date: 'date',
    time: 'time',
    verification: 'sms',
    username: 'user',
    userpassword: 'userpassword',
    color: 'color'
};

/* ================================
   验证规则表
   ================================ */

const CUIInputRules = {
    idcard: { pattern: /^\d{17}[\dXx]$/, message: '身份证号格式错误' },
    phone: { pattern: /^1[3-9]\d{9}$/, message: '手机号格式错误' },
    email: { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '邮箱格式错误' },
    number: { pattern: /^-?\d+(\.\d+)?$/, message: '请输入有效数字' },
    url: { pattern: /^https?:\/\/.+/, message: '网址格式错误' },
    required: { pattern: /.+/, message: '此项不能为空' },
    custom: { pattern: null, message: '输入格式不正确' }
};

function CUIInputInit() {
    if (window.__CUI_INPUT_INITIALIZED__) return;
    window.__CUI_INPUT_INITIALIZED__ = true;

    const processedNames = new Set();
    const beautifiedElements = new WeakSet();

    function getInputType(input) {
        if (input.type === 'checkbox' || input.type === 'radio') {
            return input.type;
        }
        return 'single';
    }

    function getIconForInput(input) {
        const type = (input.type || 'text').toLowerCase();
        const iconName = CUIInputIconMap[type];
        return iconName ? CUIInputIcons[iconName] : null;
    }

    function getIconNameForInput(input) {
        const type = (input.type || 'text').toLowerCase();
        
        console.log('getIconNameForInput called', {
            type,
            CUI_exists: typeof CUI !== 'undefined',
            CUI_env_exists: typeof CUI !== 'undefined' && CUI.env,
            nativeInputIcons: typeof CUI !== 'undefined' && CUI.env ? CUI.env.features.nativeInputIcons : 'not available',
            CUI_env_full: typeof CUI !== 'undefined' && CUI.env ? CUI.env : 'not available'
        });
        
        if (typeof CUI !== 'undefined' && CUI.env && CUI.env.features.nativeInputIcons) {
            const nativeIconTypes = ['date', 'time', 'datetime-local'];
            if (nativeIconTypes.includes(type)) {
                console.log('  Should use native icon, returning null');
                return null;
            }
        }
        
        if (input.dataset.icon) {
            console.log('  Using data-icon:', input.dataset.icon);
            return input.dataset.icon;
        }
        const result = CUIInputIconMap[type] || null;
        console.log('  Using icon from map:', result);
        return result;
    }

    function addIcon(wrapper, input) {
        const iconName = getIconNameForInput(input);
        if (!iconName) return;
        const iconSvg = CUIInputIcons[iconName];
        if (!iconSvg) return;

        wrapper.classList.add('CUI-input--with-icon');
        const iconEl = document.createElement('span');
        iconEl.className = 'CUI-input__icon';
        iconEl.innerHTML = iconSvg;
        wrapper.appendChild(iconEl);
    }

    function addLabel(wrapper, labelText, position) {
        if (!labelText) return;

        const labelEl = document.createElement('span');
        labelEl.className="CUI-input__label CUI-text-md CUI-text-primary";
        labelEl.textContent = labelText;

        if (position === 'top') {
            wrapper.classList.add('CUI-input--label-top');
            wrapper.insertBefore(labelEl, wrapper.firstChild);
        } else if (position === 'left') {
            wrapper.classList.add('CUI-input--label-left');
            wrapper.insertBefore(labelEl, wrapper.firstChild);
        }
    }

    function initColorPickerInput(input) {
        const useCustomPicker = input.dataset.CUIColorPicker === 'true';
        
        if (!useCustomPicker) {
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'CUI-input CUI-input-color';

        const colorPreview = document.createElement('span');
        colorPreview.className = 'CUI-input-color__preview';
        colorPreview.style.backgroundColor = input.value || '#165DFF';

        const colorValue = document.createElement('span');
        colorValue.className = 'CUI-input-color__value';
        colorValue.textContent = input.value || '#165DFF';

        const parent = input.parentNode;
        if (parent) {
            parent.insertBefore(wrapper, input);
            wrapper.appendChild(colorPreview);
            wrapper.appendChild(colorValue);
            wrapper.appendChild(input);

            input.style.display = 'none';

            input.addEventListener('input', () => {
                colorPreview.style.backgroundColor = input.value;
                colorValue.textContent = input.value;
            });
        }
    }

    function beautifyInput(input) {
        if (beautifiedElements.has(input)) return null;

        const inputType = input.type;

        if (inputType === 'checkbox' || inputType === 'radio') {
            if (!input.classList.contains('CUI-input')) return null;
            const label = input.closest('label');
            if (label) {
                const wrapper = document.createElement('div');
                wrapper.className = `CUI-input CUI-input-${inputType}`;

                label.parentNode.insertBefore(wrapper, label);
                wrapper.appendChild(label);

                input.classList.remove('CUI-input');
                beautifiedElements.add(input);
            }
            return null;
        } else if (inputType === 'color') {
            initColorPickerInput(input);
            beautifiedElements.add(input);
            return null;
        } else if (input.classList.contains('CUI-input-box')) {
            const parent = input.parentNode;
            if (!parent || parent === document.body) return null;

            const labelText = input.dataset.label || '';
            const hintText = input.dataset.hint || '';
            const infoText = input.dataset.info || '';
            const errorText = input.dataset.error || '';
            const isError = input.dataset.isError === 'true';
            const isSimple = input.classList.contains('CUI-input--simple');
            const validateType = input.dataset.CUIValidate || '';

            let iconHtml = '';
            if (input.tagName !== 'TEXTAREA') {
                const iconName = getIconNameForInput(input);
                if (iconName && CUIInputIcons[iconName]) {
                    iconHtml = `<span class="CUI-input__icon">${CUIInputIcons[iconName]}</span>`;
                }
            }

            const labelHtml = labelText
                ? `<span class="CUI-input__label CUI-text-md">${labelText}</span>`
                : '';

            const hintHtml = hintText
                ? `<span class="CUI-input__hint CUI-text-sm CUI-text-muted">${hintText}</span>`
                : '';

            const infoHtml = infoText
                ? `<span class="CUI-input__info"><div class="CUI-message CUI-message-info"><div>${infoText}</div></div></span>`
                : '';

            const errorHtml = `<span class="CUI-input__error"><div class="CUI-message CUI-message-error"><div>${errorText || ''}</div></div></span>`;

            const boxHtml = `
<div class="CUI-input-box${isError ? ' CUI-is-error' : ''}"${validateType ? ` data-CUI-validate="${validateType}"` : ''}>
    ${labelHtml}
    <div class="CUI-input${isSimple ? ' CUI-input--simple' : ''}">
        <input type="${input.type}" name="${input.name}" class="" placeholder="${input.placeholder}" value="${input.value}">
        ${iconHtml}
    </div>
    ${hintHtml}
    ${infoHtml}
    ${errorHtml}
</div>`;

            parent.insertBefore(document.createRange().createContextualFragment(boxHtml), input);

            const box = input.previousElementSibling;
            const newInput = box && box.querySelector('input');
            if (newInput) {
                if (input.id) newInput.id = input.id;
                ['readonly', 'disabled', 'required', 'autocomplete', 'inputmode', 'maxlength', 'min', 'max', 'step', 'pattern'].forEach(attr => {
                    const val = input.getAttribute(attr);
                    if (val !== null) newInput.setAttribute(attr, val);
                });
                if (input.dataset.CUIValidate) newInput.dataset.CUIValidate = input.dataset.CUIValidate;
                if (input.dataset.validatePattern) newInput.dataset.validatePattern = input.dataset.validatePattern;
                if (input.dataset.info) newInput.dataset.info = input.dataset.info;
            }

            input.remove();
            beautifiedElements.add(input);
            return newInput;
        } else if (input.classList.contains('CUI-input')) {
            const wrapper = document.createElement('div');
            
            const classesToKeep = [];
            for (let i = 0; i < input.classList.length; i++) {
                const cls = input.classList[i];
                if (cls !== 'CUI-input' && cls !== 'CUI-input--simple') {
                    classesToKeep.push(cls);
                }
            }
            
            wrapper.className = 'CUI-input';
            if (classesToKeep.length > 0) {
                wrapper.className += ' ' + classesToKeep.join(' ');
            }

            const parent = input.parentNode;
            if (parent && parent !== document.body) {
                const isSimple = input.classList.contains('CUI-input--simple');
                if (isSimple) {
                    wrapper.classList.add('CUI-input--simple');
                    input.classList.remove('CUI-input--simple');
                }

                const labelText = input.dataset.label;
                const labelPosition = input.dataset.CUILabelPosition || 'left';
                if (labelText) {
                    addLabel(wrapper, labelText, labelPosition);
                }

                parent.insertBefore(wrapper, input);
                wrapper.appendChild(input);

                if (input.tagName !== 'TEXTAREA') {
                    addIcon(wrapper, input);
                }

                input.classList.remove('CUI-input');
                input.classList.remove(...classesToKeep);
                beautifiedElements.add(input);
            }
        }
    }

    function processInput(input) {
        if (!input.name) return;

        const inputType = input.type;
        const form = input.closest('form');
        const parentId = form && form.id ? form.id : null;

        const effectiveInput = beautifyInput(input) || input;

        let path = parentId ? `${parentId}.${effectiveInput.name}` : effectiveInput.name;
        let groupPath = `__group__${path}`;

        if (inputType === 'checkbox' || inputType === 'radio') {
            if (processedNames.has(groupPath)) {
                return;
            }
            processedNames.add(groupPath);

            const groupSelector = `input[name="${input.name}"]${form ? `, form#${form.id} input[name="${input.name}"]` : ''}`;
            const allInputs = form
                ? form.querySelectorAll(groupSelector)
                : document.querySelectorAll(groupSelector);

            const elements = Array.from(allInputs).filter(el =>
                el.type === input.type && el.name === input.name
            );

            const nodeData = {
                type: inputType,
                elements: elements,
                value: elements.filter(el => el.checked).map(el => el.value)
            };

            if (parentId) {
                let formNode = CUIInputRegistry._data[parentId];
                if (!formNode) {
                    formNode = { type: 'form', children: {} };
                    CUIInputRegistry._data[parentId] = formNode;
                }
                if (!formNode.children) formNode.children = {};
                formNode.children[input.name] = nodeData;
            } else {
                CUIInputRegistry._data[input.name] = nodeData;
            }

            elements.forEach(el => {
                el.addEventListener('change', () => {
                    const node = CUIInputRegistry.get(path);
                    if (node && node.elements) {
                        node.value = node.elements.filter(e => e.checked).map(e => e.value);
                        CUIInputRegistry._notifyChange();
                    }
                });
            });
        } else {
            processedNames.add(path);

            const nodeData = {
                type: 'input',
                element: effectiveInput,
                value: effectiveInput.value,
                valid: true
            };

            if (parentId) {
                let formNode = CUIInputRegistry._data[parentId];
                if (!formNode) {
                    formNode = { type: 'form', children: {} };
                    CUIInputRegistry._data[parentId] = formNode;
                }
                if (!formNode.children) formNode.children = {};
                formNode.children[effectiveInput.name] = nodeData;
            } else {
                CUIInputRegistry._data[effectiveInput.name] = nodeData;
            }
        }
    }

    function scanInputs() {
        document.querySelectorAll('input,textarea,select').forEach(processInput);
    }

    function resolvePath(input) {
        const form = input.closest('form');
        const parentId = form && form.id ? form.id : null;
        return parentId ? `${parentId}.${input.name}` : input.name;
    }

    function validateInput(input, wrapper) {
        // 检查父元素的 data-CUI-validate 属性（支持 CUI-input-box 结构）
        const validateType = wrapper && wrapper.dataset.CUIValidate
            ? wrapper.dataset.CUIValidate
            : input.dataset.CUIValidate;
        
        if (!validateType) return;

        // 跳过高级身份证验证（由 idcard-validator.js 独立处理）
        if (validateType === 'idcard-adv') return;

        const rule = CUIInputRules[validateType];
        if (!rule) return;

        const pattern = validateType === 'custom'
            ? new RegExp(input.dataset.validatePattern || '')
            : rule.pattern;

        const value = input.value;
        const valid = validateType === 'required'
            ? pattern.test(value)
            : (!value || pattern.test(value));

        const msg = input.dataset.error || rule.message;

        const path = resolvePath(input);
        const node = CUIInputRegistry.get(path);
        if (node) node.valid = valid;

        if (valid) {
            showSuccess(input, wrapper);
        } else {
            showError(input, wrapper, msg);
        }
    }

    function showError(input, wrapper, message) {
        if (!wrapper) wrapper = input.closest('.CUI-input-box') || input.closest('.CUI-input');
        if (!wrapper) {
            input.classList.add('CUI-input--error');
            input.title = message;
            return;
        }
        
        wrapper.classList.remove('CUI-is-success', 'CUI-input--success');
        input.classList.remove('CUI-input--success');
        
        if (wrapper.classList.contains('CUI-input-box')) {
            wrapper.classList.add('CUI-is-error');
        } else {
            wrapper.classList.add('CUI-input--error');
            input.title = message;
        }
    }

    function showSuccess(input, wrapper) {
        if (!wrapper) wrapper = input.closest('.CUI-input-box') || input.closest('.CUI-input');
        if (!wrapper) {
            input.classList.add('CUI-input--success');
            return;
        }
        
        wrapper.classList.remove('CUI-is-error', 'CUI-input--error');
        input.classList.remove('CUI-input--error');
        input.title = '';
        
        if (wrapper.classList.contains('CUI-input-box')) {
            wrapper.classList.add('CUI-is-success');
        } else {
            wrapper.classList.add('CUI-input--success');
        }
        
        const path = resolvePath(input);
        const node = CUIInputRegistry.get(path);
        if (node) node.valid = true;
    }

    function clearErrorState(input, wrapper) {
        if (!wrapper) wrapper = input.closest('.CUI-input-box') || input.closest('.CUI-input');
        if (!wrapper) {
            input.classList.remove('CUI-input--error', 'CUI-input--success');
            input.title = '';
            return;
        }

        wrapper.classList.remove('CUI-is-error', 'CUI-input--error', 'CUI-is-success', 'CUI-input--success');
        input.classList.remove('CUI-input--error', 'CUI-input--success');
        input.title = '';

        const path = resolvePath(input);
        const node = CUIInputRegistry.get(path);
        if (node) node.valid = true;
    }

    function init() {
        if (typeof CastingDOMObserver !== 'undefined') {
            CastingDOMObserver.onAdd('input-registry', 'input,textarea,select', (el) => {
                if (el.matches('input,textarea,select') && el.name) {
                    processInput(el);
                }
            });
            CastingDOMObserver.onRemove('input-registry', 'input,textarea,select', (el) => {
                if (!el.name) return;
                const form = el.closest('form');
                let path;
                if (form && form.id) {
                    path = `${form.id}.${el.name}`;
                } else {
                    path = el.name;
                }
                CUIInputRegistry.unregister(path);
            });
        }

        document.addEventListener('click', async (event) => {
            const colorWrapper = event.target.closest('.CUI-input-color');
            if (!colorWrapper) return;

            const input = colorWrapper.querySelector('input[type="color"]');
            if (!input || input.dataset.CUIColorPicker !== 'true') return;

            if (typeof window.openColorPicker === 'function') {
                try {
                    const result = await window.openColorPicker({
                        initialColor: input.value || '#165DFF',
                        format: 'hex'
                    });
                    if (result) {
                        input.value = result;
                        const preview = colorWrapper.querySelector('.CUI-input-color__preview');
                        const valueEl = colorWrapper.querySelector('.CUI-input-color__value');
                        if (preview) preview.style.backgroundColor = result;
                        if (valueEl) valueEl.textContent = result;
                        input.dispatchEvent(new Event('input'));
                    }
                } catch (e) {
                    console.log('Color picker closed');
                }
            }
        });

        document.addEventListener('input', (e) => {
            const target = e.target.closest('input,textarea,select');
            if (!target) return;
            clearErrorState(target);
            const path = resolvePath(target);
            const node = CUIInputRegistry.get(path);
            if (node && node.element) node.value = target.value;
            CUIInputRegistry._notifyChange();
        });

        document.addEventListener('blur', (e) => {
            const target = e.target.closest('input,textarea,select');
            if (!target || !target.name) return;
            const wrapper = target.closest('.CUI-input-box') || target.closest('.CUI-input');
            if (!wrapper) return;
            validateInput(target, wrapper);
        }, true);

        scanInputs();
    }

    // 调度器在 DOM_REGISTRY 阶段会自动调用，此时DOM已就位，直接 init()
    init();
}

// 注册到全局生命周期调度器
(function() {
    if (window.CUI && window.CUI.__inputModuleReady) return;
    if (!window.CUI) window.CUI = {};
    window.CUI.input = CUIInputRegistry;
    window.CUI.inputInit = CUIInputInit;
    window.CUI.__inputModuleReady = true;

    if (typeof window.CUI.registerModule === 'function') {
        window.CUI.registerModule('input', {
            stages: {
                DOM_REGISTRY: () => {
                    CUIInputInit();
                }
            }
        });
    } else {
        CUIInputInit();
    }
})();
