/* 
 * Casting UI Framework
 * Version: 0.3.0
 * Module: progress.js
 * Description: 进度条模块，基于data属性驱动
 * Copyright (c) 2026 Bingo工作室
 */

import { domObserver } from './dom-observer.js';

class Progress {
    constructor(container) {
        this.container = typeof container === 'string'
            ? document.querySelector(container)
            : container;
        
        if (!this.container) {
            console.warn('Progress: 容器未找到');
            return;
        }
        
        this.progressBar = null;
        this.max = parseInt(this.container.dataset.max) || 100;
        this.value = parseInt(this.container.dataset.value) || 0;
        this.type = this.container.dataset.CUIType || '';
        this.size = this.container.dataset.size || 'md';
        this.color = this.container.dataset.color || null;
        
        this.init();
    }
    
    init() {
        // 解析type参数
        // 默认启用 label、striped、animated
        // 使用 plain 参数可关闭所有默认效果
        const typeStr = this.type.trim();
        const types = typeStr ? typeStr.split(' ') : [];
        const isPlain = types.includes('plain');
        
        if (isPlain) {
            // plain模式：关闭所有装饰
            this.showLabel = false;
            this.striped = false;
            this.animated = false;
        } else if (types.length === 0) {
            // 无任何参数：启用所有默认效果
            this.showLabel = true;
            this.striped = true;
            this.animated = true;
        } else {
            // 自定义配置：根据参数决定
            this.showLabel = types.includes('label');
            this.striped = types.includes('striped');
            this.animated = types.includes('animated');
        }
        
        this.glass = types.includes('glass');
        
        // 颜色处理：data-color 自定义颜色优先于 data-CUI-type 中的颜色类型
        const colorTypes = ['primary', 'success', 'warning', 'error', 'info'];
        const foundColor = types.find(t => colorTypes.includes(t));
        if (this.color && this.color.startsWith('#')) {
            // 已有 data-color 自定义颜色，保持不变
        } else if (foundColor) {
            // 使用 data-CUI-type 中的颜色
            this.color = foundColor;
        }
        
        // 尺寸处理：W/H 参数优先于 data-size
        const hasCustomSize = types.some(t => t.startsWith('W') || t.startsWith('H'));
        
        if (hasCustomSize) {
            // 使用 W/H 参数
            const widthMatch = types.find(t => t.startsWith('W'));
            const heightMatch = types.find(t => t.startsWith('H'));
            if (widthMatch) {
                this.width = Math.max(50, parseInt(widthMatch.slice(1)) || null);
            }
            if (heightMatch) {
                this.height = Math.max(14, parseInt(heightMatch.slice(1)) || null);
            }
            // 忽略 data-size
            this.size = null;
        } else {
            // 使用 data-size 或默认尺寸
            this.width = null;
            this.height = null;
        }
        
        this.render();
    }
    
    render() {
        const percentage = Math.min(100, Math.max(0, (this.value / this.max) * 100));
        
        const classes = [
            'CUI-progress-box',
            `CUI-progress-${this.size}`,
            this.glass ? 'CUI-progress-glass' : ''
        ].filter(Boolean).join(' ');
        
        const barClasses = [
            'CUI-progress-bar',
            this.striped ? 'CUI-progress-stripes' : '',
            this.animated ? 'CUI-progress-animated' : ''
        ].filter(Boolean).join(' ');
        
        // 应用自定义宽度
        let widthStyle = '';
        if (this.width) {
            widthStyle = `width: ${this.width}px;`;
        }
        
        // 应用自定义高度
        let heightStyle = '';
        let barHeightStyle = '';
        if (this.height) {
            heightStyle = `height: ${this.height - 6}px;`;
            barHeightStyle = `height: ${this.height}px;`;
        }
        
        this.container.className = classes;
        this.container.style.cssText = `${widthStyle} ${heightStyle}`;
        this.container.innerHTML = `
            <div class="${barClasses}" style="width: ${percentage}%; ${barHeightStyle}">
                ${this.showLabel ? `${Math.round(percentage)}%` : ''}
            </div>
        `;
        
        this.progressBar = this.container.querySelector('.CUI-progress-bar');
        
        // 应用颜色
        if (this.color) {
            if (['success', 'warning', 'error', 'info'].includes(this.color)) {
                this.progressBar.classList.add(this.color);
            } else if (this.color.startsWith('#')) {
                this.progressBar.style.backgroundColor = this.color;
            }
        }
    }
    
    update(value) {
        if (typeof value !== 'number' || isNaN(value)) {
            return;
        }
        
        this.value = Math.min(this.max, Math.max(0, value));
        const percentage = (this.value / this.max) * 100;
        
        if (this.progressBar) {
            this.progressBar.style.width = `${percentage}%`;
            if (this.showLabel) {
                this.progressBar.textContent = `${Math.round(percentage)}%`;
            }
        }
    }
}

// 避免全局变量冲突，使用更安全的命名空间
if (!window.CUI) {
    window.CUI = {};
}

window.CUI.Progress = Progress;

/**
 * ProgressAutoInit 自动初始化类
 * 使用框架的 domObserver 监听DOM变化，自动初始化带有 CUI-progress 类的元素
 * 并监听data-value变化，自动更新进度条
 */
class ProgressAutoInit {
    constructor() {
        this.instances = new Map();
        this.init();
    }
    
    init() {
        if (typeof CastingDOMObserver !== 'undefined') {
            this.registerObserver();
        } else if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.registerObserver();
            });
        } else {
            this.registerObserver();
        }
    }
    
    registerObserver() {
        if (typeof CastingDOMObserver !== 'undefined') {
            // 监听元素添加
            CastingDOMObserver.onAdd('progress-auto', '.CUI-progress', (el) => {
                this.autoRender(el);
            });
            
            // 监听元素移除
            CastingDOMObserver.onRemove('progress-auto', '.CUI-progress', (el) => {
                const instanceId = this.getInstanceId(el);
                if (instanceId) {
                    this.instances.delete(instanceId);
                }
            });
        }
        
        // 初始化已存在的进度条
        document.querySelectorAll('.CUI-progress').forEach(el => {
            this.autoRender(el);
        });
    }
    
    getInstanceId(el) {
        return el.id ? `#${el.id}` : `progress-${el.dataset.value || Math.floor(Math.random() * 10000)}`;
    }
    
    autoRender(el) {
        // 跳过 pre/code 标签内的代码示例元素
        if (el.closest('pre, code')) {
            return;
        }
        
        const instanceId = this.getInstanceId(el);
        
        // 如果已存在实例，先移除
        if (this.instances.has(instanceId)) {
            return;
        }
        
        // 创建进度条实例
        const progress = new Progress(el);
        
        // 如果容器无效，直接返回
        if (!progress.container) {
            return;
        }
        
        // 存储实例
        this.instances.set(instanceId, progress);
        
        // 监听data-value属性变化
        this.observeValueChange(el, progress);
    }
    
    observeValueChange(el, progress) {
        // 使用MutationObserver监听data-value属性变化
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'data-value') {
                    const newValue = parseInt(el.dataset.value) || 0;
                    progress.update(newValue);
                }
            });
        });
        
        observer.observe(el, {
            attributes: true,
            attributeFilter: ['data-value']
        });
        
        // 存储observer引用，以便后续清理
        el._progressObserver = observer;
    }
}

// 仅在框架环境中初始化
if (typeof CastingDOMObserver !== 'undefined' || document.readyState !== 'loading') {
    new ProgressAutoInit();
}