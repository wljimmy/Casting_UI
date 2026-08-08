/*
 * Casting UI Framework
 * Module: idcard-validator.js
 * Description: 身份证高级验证模块，支持分段解析、校验码验证、实时状态更新
 * Copyright (c) 2026 Bingo工作室
 * Email: wljimmy@hotmail.com
 */

/**
 * @dependency: location-data
 * 
 * CUI.idcardValidator 模块
 * 触发条件：data-CUI-validate="idcard-adv"
 * 
 * 功能：
 *   1. 身份证号码分段解析（省/市/区/生日/性别）
 *   2. 校验码验证（ISO 7064 MOD 11-2）
 *   3. 状态挂靠到注册表（node.idcard）
 *   4. 实时解析（逐位解析）
 *   5. 调用 location-data 模块获取行政区划名称
 */

// 校验码加权因子
const IDCARD_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const IDCARD_CHECK_CODES = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];

const CUIIdCardValidator = {
    _dataReady: false,
    
    /**
     * 等待数据加载完成
     * @returns {Promise<boolean>}
     */
    waitForData() {
        if (this._dataReady) return Promise.resolve(true);
        
        if (!window.CUI || !window.CUI.locationData) {
            return Promise.resolve(false);
        }
        
        // 如果数据已加载
        if (window.CUI.locationData._loaded) {
            this._dataReady = true;
            return Promise.resolve(true);
        }
        
        // 如果正在加载，等待完成
        if (window.CUI.locationData._loading) {
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (window.CUI.locationData._loaded) {
                        clearInterval(checkInterval);
                        this._dataReady = true;
                        resolve(true);
                    }
                }, 50);
            });
        }
        
        // 如果数据未加载，触发加载
        return window.CUI.locationData.load().then(() => {
            this._dataReady = true;
            return true;
        });
    },

    /**
     * 解析身份证号码
     * @param {string} value - 身份证号码（已清理）
     * @returns {Object} 解析状态对象
     */
    parse(value) {
        // 数据清洗：移除所有非数字和非X字符，转换为大写
        const cleanValue = this._cleanIdcard(value);
        const len = cleanValue.length;
        
        // 初始化状态
        const state = {
            status: 'parsing',
            phase: 0,
            province: { code: '', name: '', valid: null },
            city: { code: '', name: '', valid: null },
            district: { code: '', name: '', valid: null },
            birth: { date: '', year: '', month: '', day: '', age: 0, valid: null },
            gender: '',
            checksumValid: null,
            isValid: false,
            displayText: '',
            error: ''
        };
        
        // 空值
        if (len === 0) {
            state.status = 'waiting';
            return state;
        }
        
        // 位数过多
        if (len > 18) {
            state.status = 'error';
            state.error = '身份证号位数不正确';
            return state;
        }
    
        // 阶段1：省级代码（2位）
        if (len >= 2) {
            state.phase = 1;
            const provinceCode = cleanValue.substring(0, 2);
            state.province.code = provinceCode;
            
            // 尝试获取省份名称
            if (window.CUI && window.CUI.locationData && window.CUI.locationData._loaded) {
                const province = window.CUI.locationData.getProvince(provinceCode);
                if (province) {
                    state.province.name = province.name;
                    state.province.valid = true;
                } else {
                    state.province.name = `省码${provinceCode}`;
                    state.province.valid = false;
                    state.status = 'error';
                    state.error = '省级代码无效';
                    return state;
                }
            } else {
                state.province.name = `省码${provinceCode}`;
                state.province.valid = null;
            }
        }
        
        // 阶段2：地级代码（4位）
        if (len >= 4) {
            state.phase = 2;
            const cityCode = cleanValue.substring(0, 4);
            state.city.code = cityCode;
            
            if (window.CUI && window.CUI.locationData && window.CUI.locationData._loaded) {
                const city = window.CUI.locationData.getCity(cityCode);
                if (city) {
                    state.city.name = city.name;
                    state.city.valid = true;
                } else {
                    state.city.name = state.province.name;
                    state.city.valid = true;
                }
            } else {
                state.city.name = `市码${cityCode}`;
                state.city.valid = null;
            }
        }
        
        // 阶段3：县级代码（6位）
        if (len >= 6) {
            state.phase = 3;
            const districtCode = cleanValue.substring(0, 6);
            state.district.code = districtCode;
            
            if (window.CUI && window.CUI.locationData && window.CUI.locationData._loaded) {
                const district = window.CUI.locationData.getDistrict(districtCode);
                if (district) {
                    state.district.name = district.name;
                    state.district.valid = true;
                } else {
                    state.district.name = `区码${districtCode}`;
                    state.district.valid = false;
                    state.status = 'error';
                    state.error = '区级代码无效';
                    return state;
                }
            } else {
                state.district.name = `区码${districtCode}`;
                state.district.valid = null;
            }
        }
        
        // 阶段4：出生日期（8位）
        if (len >= 14) {
            state.phase = 4;
            const year = cleanValue.substring(6, 10);
            const month = cleanValue.substring(10, 12);
            const day = cleanValue.substring(12, 14);
            
            state.birth.year = year;
            state.birth.month = month;
            state.birth.day = day;
            
            const birthDate = new Date(`${year}-${month}-${day}`);
            const isValidDate = birthDate instanceof Date && !isNaN(birthDate) &&
                birthDate.getFullYear() === parseInt(year) &&
                (birthDate.getMonth() + 1) === parseInt(month) &&
                birthDate.getDate() === parseInt(day);
            
            if (isValidDate) {
                state.birth.date = `${year}-${month}-${day}`;
                state.birth.valid = true;
                
                const today = new Date();
                let age = today.getFullYear() - birthDate.getFullYear();
                const monthDiff = today.getMonth() - birthDate.getMonth();
                if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                    age--;
                }
                state.birth.age = age;
            } else {
                state.birth.valid = false;
                state.status = 'error';
                state.error = '出生日期无效';
                return state;
            }
        }
        
        // 阶段5：性别（17位）
        if (len >= 17) {
            state.phase = 5;
            const seqCode = cleanValue.substring(14, 17);
            const genderCode = parseInt(seqCode);
            state.gender = genderCode % 2 === 1 ? 'male' : 'female';
        }
        
        // 阶段6：完整验证（18位）
        if (len === 18) {
            state.phase = 6;
            
            const checksumValid = this.validateChecksum(cleanValue);
            state.checksumValid = checksumValid;
            
            if (checksumValid) {
                state.status = 'valid';
                state.isValid = true;
            } else {
                state.status = 'error';
                state.error = '校验码错误';
                return state;
            }
        }
        
        state.displayText = this.generateDisplayText(state);
        
        return state;
    },
    
    /**
     * 数据清洗：移除分隔符，转换为大写
     * @param {string} value - 原始身份证号
     * @returns {string} 清洗后的身份证号
     */
    _cleanIdcard(value) {
        if (!value) return '';
        // 移除所有非数字和非X字符，转换为大写
        return String(value).toUpperCase().replace(/[^0-9X]/g, '');
    },

    /**
     * 验证校验码（ISO 7064 MOD 11-2）
     * @param {string} idcard - 18位身份证号码
     * @returns {boolean} 校验码是否正确
     */
    validateChecksum(idcard) {
        if (idcard.length !== 18) return false;
        
        let sum = 0;
        for (let i = 0; i < 17; i++) {
            sum += parseInt(idcard[i]) * IDCARD_WEIGHTS[i];
        }
        
        const remainder = sum % 11;
        const expectedChecksum = IDCARD_CHECK_CODES[remainder];
        const actualChecksum = idcard[17].toUpperCase();
        
        return expectedChecksum === actualChecksum;
    },

    /**
     * 生成显示文本
     * @param {Object} state - 解析状态对象
     * @returns {string} 显示文本
     */
    generateDisplayText(state) {
        const parts = [];
        
        // 省市区（含历史数据备注）
        if (state.province.name) {
            let provinceText = state.province.name;
            if (state.province.isHistorical && state.province.mergedTo) {
                provinceText += `(已合并至${state.province.mergedTo})`;
            }
            parts.push(provinceText);
        }
        
        if (state.city.name) {
            let cityText = state.city.name;
            if (state.city.isHistorical && state.city.mergedTo) {
                cityText += `(已合并至${state.city.mergedTo})`;
            }
            parts.push(cityText);
        }
        
        if (state.district.name) {
            let districtText = state.district.name;
            if (state.district.isHistorical && state.district.mergedTo) {
                districtText += `(已合并至${state.district.mergedTo})`;
            }
            parts.push(districtText);
        }
        
        // 出生日期
        if (state.birth.date && state.birth.valid) {
            const year = state.birth.year;
            const month = state.birth.month;
            const day = state.birth.day;
            const age = state.birth.age;
            parts.push(`${year}年${month}月${day}日 ${age}岁`);
        }
        
        // 性别
        if (state.gender) {
            parts.push(state.gender === 'male' ? '男性' : '女性');
        }
        
        return parts.join(' ');
    },

    /**
     * 初始化身份证高级验证
     */
    init() {
        if (window.__CUI_IDCARD_VALIDATOR_INITIALIZED__) return;
        window.__CUI_IDCARD_VALIDATOR_INITIALIZED__ = true;
        
        // 先扫描现有的 idcard-adv 元素，设置默认提示/错误信息
        const existingWrappers = document.querySelectorAll('.CUI-input-box[data-CUI-validate="idcard-adv"]');
        existingWrappers.forEach(wrapper => {
            this._setupDefaultMessages(wrapper);
        });
        
        // 使用 DOMObserver 监听新添加的 idcard-adv 元素
        if (window.CUI && window.CUI.CastingDOMObserver) {
            window.CUI.CastingDOMObserver.addSelector('.CUI-input-box[data-CUI-validate="idcard-adv"]', (wrapper) => {
                this._setupDefaultMessages(wrapper);
            });
        }
        
        // 监听 input 事件（实时解析）
        document.addEventListener('input', (e) => {
            const target = e.target;
            if (!target.matches('input')) return;
            
            // 检查验证类型：优先检查父元素 .CUI-input-box，其次检查 input 本身
            const wrapper = target.closest('.CUI-input-box');
            let validateType = null;
            
            if (wrapper) {
                validateType = wrapper.dataset.CUIValidate;
            } else {
                validateType = target.dataset.CUIValidate;
            }
            
            if (validateType !== 'idcard-adv') return;
            
            const value = target.value;
            const state = this.parse(value);
            this.updateRegistryState(target, state);
            this.updateMessageDisplay(target, state);
        });
        
        // 监听 blur 事件（验证完整性）
        document.addEventListener('blur', (e) => {
            const target = e.target;
            if (!target.matches('input')) return;
            
            // 检查验证类型：优先检查父元素 .CUI-input-box，其次检查 input 本身
            const wrapper = target.closest('.CUI-input-box');
            let validateType = null;
            
            if (wrapper) {
                validateType = wrapper.dataset.CUIValidate;
            } else {
                validateType = target.dataset.CUIValidate;
            }
            
            if (validateType !== 'idcard-adv') return;
            
            const value = target.value.replace(/[^0-9Xx]/g, '');
            
            // 获取路径用于调用 API
            const form = target.closest('form');
            const parentId = form && form.id ? form.id : null;
            const path = parentId ? `${parentId}.${target.name}` : target.name;
            
            if (value.length === 18) {
                const state = this.parse(value);
                const isValid = state.isValid;
                this.updateRegistryValid(target, isValid);
                this.updateValidationClass(wrapper, target, value.length > 0, isValid, state.error);
                
                if (wrapper && !isValid && state.error) {
                    if (window.CUI && window.CUI.input) {
                        window.CUI.input.setError(path, state.error);
                    }
                }
            } else if (value.length > 18) {
                // 超过18位，显示错误信息
                this.updateRegistryValid(target, false);
                this.updateValidationClass(wrapper, target, true, false, '身份证号位数不正确，最多18位');
                
                if (wrapper && window.CUI && window.CUI.input) {
                    window.CUI.input.setError(path, '身份证号位数不正确，最多18位');
                }
            } else if (value.length > 0 && value.length < 18) {
                // 输入不完整，显示错误信息
                this.updateRegistryValid(target, false);
                this.updateValidationClass(wrapper, target, true, false, '身份证号不完整，请输入18位身份证号');
                
                if (wrapper && window.CUI && window.CUI.input) {
                    window.CUI.input.setError(path, '身份证号不完整，请输入18位身份证号');
                }
            } else {
                // 空值，清除验证状态
                this.updateValidationClass(wrapper, target, false, false);
                this.updateRegistryValid(target, null);
                
                // 只有启用逐位解析时，才恢复初始提示词
                // 其他情况不动 info 内容
                const enableParseDisplay = wrapper && wrapper.dataset.enableParseDisplay === 'true';
                if (enableParseDisplay) {
                    const infoEl = wrapper.querySelector('.CUI-input__info .CUI-message div');
                    if (infoEl) {
                        infoEl.textContent = '请输入身份证号码';
                    }
                }
                
                // 清除 error 状态（通过 CSS 类控制显示/隐藏，不清除内容）
                if (wrapper) {
                    wrapper.classList.remove('CUI-is-error');
                }
            }
        }, true);
        
        // 注册简洁的验证接口
        window.CUI.validateIdcard = (idcard) => {
            const state = this.parse(idcard);
            
            return {
                idcard: state.status === 'valid' ? this._cleanIdcard(idcard) : null,
                isValid: state.isValid,
                province: state.province,
                city: state.city,
                district: state.district,
                birth: state.birth.date || '',
                age: state.birth.age || 0,
                gender: state.gender || '',
                checksum: state.status === 'valid' ? this._cleanIdcard(idcard).substring(17) : '',
                checksumValid: state.checksumValid,
                error: state.error || null
            };
        };
        
        console.log('[CUIIdCardValidator] 模块初始化完成');
    },

    /**
     * 设置默认的提示和错误信息
     * @param {HTMLElement} wrapper - CUI-input-box 元素
     */
    _setupDefaultMessages(wrapper) {
        // 检查用户是否设置了启用逐位解析显示的标记
        // 约定：清洗后的关键词为 "idinfo" 时才启用逐位解析显示功能
        // 清洗规则：忽略大小写、忽略 -_ 连接符、忽略其他符号
        // 如果后面还有别的词汇，则属于用户自定义内容，不做处理
        const input = wrapper.querySelector('input');
        const infoValue = input && input.dataset.info ? input.dataset.info.trim() : '';
        
        // 清洗关键词：移除连接符和符号，转小写
        const cleanedValue = infoValue.toLowerCase().replace(/[-_\s]/g, '').replace(/[^\w]/g, '');
        
        // 只有清洗后正好是 "idinfo" 时才启用
        const enableParseDisplay = cleanedValue === 'idinfo';
        
        // 标记 wrapper，用于后续判断是否启用逐位解析显示
        wrapper.dataset.enableParseDisplay = enableParseDisplay ? 'true' : 'false';
        
        // 只有用户明确设置关键词时，才启用逐位解析显示功能
        // 其他情况（设置了其他内容或没有设置）都不做额外处理
        if (enableParseDisplay) {
            // 确保 info 元素存在
            let infoEl = wrapper.querySelector('.CUI-input__info');
            if (!infoEl) {
                // 创建 info 元素
                infoEl = document.createElement('span');
                infoEl.className = 'CUI-input__info';
                infoEl.innerHTML = '<div class="CUI-message CUI-message-info"><div></div></div>';
                
                // 插入到合适的位置（在 hint 之后，error 之前）
                const hintEl = wrapper.querySelector('.CUI-input__hint');
                const errorEl = wrapper.querySelector('.CUI-input__error');
                if (hintEl) {
                    hintEl.after(infoEl);
                } else if (errorEl) {
                    errorEl.before(infoEl);
                } else {
                    wrapper.appendChild(infoEl);
                }
            }
            
            // 设置默认提示文本（等待用户输入时显示）
            const msgEl = infoEl.querySelector('.CUI-message div');
            if (msgEl) {
                msgEl.textContent = '请输入身份证号码';
            }
        }
        
        // 设置默认 Error 错误
        const errorEl = wrapper.querySelector('.CUI-input__error');
        if (errorEl) {
            const msgEl = errorEl.querySelector('.CUI-message div');
            if (msgEl && !msgEl.textContent.trim()) {
                msgEl.textContent = '身份证号格式不正确';
            }
        }
    },

    /**
     * 更新注册表状态
     * @param {HTMLElement} input - 输入框元素
     * @param {Object} state - 解析状态对象
     */
    updateRegistryState(input, state) {
        if (!window.CUI || !window.CUI.input) return;
        
        const form = input.closest('form');
        const parentId = form && form.id ? form.id : null;
        const path = parentId ? `${parentId}.${input.name}` : input.name;
        
        const node = window.CUI.input.get(path);
        if (node) {
            node.idcard = state;
            node.value = input.value;
        }
    },

    /**
     * 更新注册表 valid 状态
     * @param {HTMLElement} input - 输入框元素
     * @param {boolean} isValid - 是否有效
     */
    updateRegistryValid(input, isValid) {
        if (!window.CUI || !window.CUI.input) return;
        
        const form = input.closest('form');
        const parentId = form && form.id ? form.id : null;
        const path = parentId ? `${parentId}.${input.name}` : input.name;
        
        const node = window.CUI.input.get(path);
        if (node) {
            node.valid = isValid;
        }
    },

    /**
     * 更新验证 CSS 类
     * @param {HTMLElement} wrapper - 包装元素（可能为 null）
     * @param {HTMLElement} input - 输入框元素
     * @param {boolean} hasValue - 是否有值
     * @param {boolean} isValid - 是否有效
     * @param {string} message - 错误信息（可选）
     */
    updateValidationClass(wrapper, input, hasValue, isValid, message) {
        // 如果没有 wrapper，尝试查找 .CUI-input 或直接在 input 上添加样式
        // 注意：如果 input 本身就是 .CUI-input，则 wrapper 就是 input 自己
        if (!wrapper) {
            wrapper = input.closest('.CUI-input');
        }
        
        // 判断 wrapper 是否是 input 自己（单纯 input 元素）
        const isSelfWrapper = wrapper === input;
        
        // 清除现有状态
        if (wrapper && !isSelfWrapper) {
            wrapper.classList.remove('CUI-is-error', 'CUI-is-success', 'CUI-input--error', 'CUI-input--success');
        }
        input.classList.remove('CUI-input--error', 'CUI-input--success');
        input.title = '';
        
        if (hasValue) {
            if (isValid) {
                // 成功状态
                if (wrapper && wrapper.classList.contains('CUI-input-box')) {
                    wrapper.classList.add('CUI-is-success');
                } else if (wrapper && !isSelfWrapper) {
                    wrapper.classList.add('CUI-input--success');
                } else {
                    // 单纯 input 元素，直接在 input 上添加样式
                    input.classList.add('CUI-input--success');
                }
            } else {
                // 错误状态
                if (wrapper && wrapper.classList.contains('CUI-input-box')) {
                    wrapper.classList.add('CUI-is-error');
                } else if (wrapper && !isSelfWrapper) {
                    wrapper.classList.add('CUI-input--error');
                    input.title = message || '身份证号格式不正确';
                } else {
                    // 单纯 input 元素，直接在 input 上添加样式
                    input.classList.add('CUI-input--error');
                    input.title = message || '身份证号格式不正确';
                }
            }
        }
    },

    /**
     * 更新消息显示
     * 使用框架标准结构：.CUI-input__info 和 .CUI-input__error
     * 注意：外观由 CSS 控制，JavaScript 只设置内容
     * @param {HTMLElement} input - 输入框元素
     * @param {Object} state - 解析状态对象
     */
    updateMessageDisplay(input, state) {
        const wrapper = input.closest('.CUI-input-box');
        if (!wrapper) return;
        
        // 检查是否启用逐位解析显示功能
        // 只有用户明确设置 data-info="ID Info" 时才启用
        const enableParseDisplay = wrapper.dataset.enableParseDisplay === 'true';
        
        const infoEl = wrapper.querySelector('.CUI-input__info');
        const errorEl = wrapper.querySelector('.CUI-input__error');
        
        if (state.error) {
            if (errorEl) {
                const msgEl = errorEl.querySelector('.CUI-message div');
                if (msgEl) msgEl.textContent = state.error;
            }
        } else if (state.displayText && enableParseDisplay) {
            // 只有用户明确设置 data-info="ID Info" 时，才更新逐位解析显示
            if (infoEl) {
                const msgEl = infoEl.querySelector('.CUI-message div');
                if (msgEl) msgEl.textContent = state.displayText;
            }
        } else if (state.status === 'waiting' && enableParseDisplay) {
            // 只有用户明确设置关键词时，才显示等待提示
            if (infoEl) {
                const msgEl = infoEl.querySelector('.CUI-message div');
                if (msgEl) msgEl.textContent = '请输入身份证号码';
            }
        }
    }
};

// 注册到全局
(function() {
    if (!window.CUI) window.CUI = {};
    window.CUI.idcardValidator = CUIIdCardValidator;
    
    // 如果调度器可用，在 INTERACTION 阶段初始化
    if (typeof window.CUI.registerModule === 'function') {
        window.CUI.registerModule('idcardValidator', {
            stages: {
                INTERACTION: () => {
                    CUIIdCardValidator.init();
                }
            },
            dependencies: ['input', 'locationData']
        });
    } else {
        // 独立加载时直接初始化
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => CUIIdCardValidator.init());
        } else {
            CUIIdCardValidator.init();
        }
    }
})();

// 导出（ES6 模块）
export default CUIIdCardValidator;