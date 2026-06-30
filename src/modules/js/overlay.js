/* 
 * Casting UI Framework
 * Module: overlay.js
 * Description: 遮罩层管理模块，提供容器级别的独立遮罩功能
 */

class Overlay {
    /**
     * 创建遮罩
     */
    static create(options = {}) {
        const { 
            target = null,
            type = 'transparent',
            zIndex = 9999,
            autoClose = 0 
        } = options;

        let container = null;
        let isFullscreen = false;

        if (target) {
            container = typeof target === 'string' 
                ? document.querySelector(target)
                : target;

            if (!container) {
                console.error('目标容器不存在:', target);
                return null;
            }

            // 检查是否已有遮罩，有则复用
            const existing = container.querySelector(':scope > .CUI-overlay');
            if (existing) {
                existing.classList.remove('show', 'CUI-overlay-transparent', 'CUI-overlay-glass');
                existing.classList.add('CUI-overlay-' + type);
                existing.classList.add('show');
                existing.style.zIndex = zIndex;
                if (autoClose > 0) {
                    setTimeout(() => Overlay.removeFrom(container), autoClose);
                }
                return {
                    element: existing,
                    close: () => Overlay.removeFrom(container),
                    get innerHTML() { return existing.innerHTML; },
                    set innerHTML(value) { existing.innerHTML = value; },
                    container: container
                };
            }

            // 设置容器为相对定位
            if (getComputedStyle(container).position === 'static') {
                container.style.position = 'relative';
            }
        } else {
            isFullscreen = true;
            container = document.body;
        }

        // 创建遮罩元素
        const overlay = document.createElement('div');
        overlay.className = `CUI-overlay CUI-overlay-${type}${isFullscreen ? '' : ' CUI-overlay-container'}`;
        overlay.style.zIndex = zIndex;

        // 添加到容器
        container.appendChild(overlay);

        // 阻止滚轮穿透 (特别是 Mac 触控板的惯性滚动)
        const preventScroll = (e) => {
            if (overlay.contains(e.target)) {
                e.preventDefault();
            }
        };
        overlay.addEventListener('wheel', preventScroll, { passive: false });
        overlay.addEventListener('touchmove', preventScroll, { passive: false });

        // 显示遮罩
        setTimeout(() => {
            overlay.classList.add('show');
        }, 10);

        // 自动关闭
        if (autoClose > 0) {
            setTimeout(() => {
                Overlay.removeFrom(container);
            }, autoClose);
        }

        // 返回遮罩对象
        return {
            element: overlay,
            close: () => Overlay.removeFrom(container),
            get innerHTML() { return overlay.innerHTML; },
            set innerHTML(value) { overlay.innerHTML = value; },
            container: container
        };
    }

    /**
     * 从指定容器移除遮罩
     */
    static removeFrom(container) {
        if (!container) return;
        
        // 转换为 DOM 元素
        if (typeof container === 'string') {
            container = document.querySelector(container);
        }

        if (!container) return;

        // 查找直接子级遮罩 (可以有多级，但通常在容器下)
        const overlay = container.querySelector(':scope > .CUI-overlay') || container.querySelector('.CUI-overlay');
        if (overlay) {
            overlay.classList.remove('show');

            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.remove();
                }
            }, 300);
        }
    }

    /**
     * 检查容器是否有遮罩
     */
    static has(target) {
        const container = typeof target === 'string' 
            ? document.querySelector(target)
            : target;
        
        return container ? container.querySelector(':scope > .CUI-overlay') !== null || container.querySelector('.CUI-overlay') !== null : false;
    }

    /**
     * 关闭所有遮罩
     */
    static closeAll() {
        document.querySelectorAll('.CUI-overlay').forEach(overlay => {
            overlay.classList.remove('show');
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.remove();
                }
            }, 300);
        });
    }
}

// 暴露到全局命名空间
window.CUI = window.CUI || {};
window.CUI.overlay = Object.assign(Overlay.create.bind(Overlay), {
    close: Overlay.removeFrom.bind(Overlay),
    has: Overlay.has.bind(Overlay),
    closeAll: Overlay.closeAll.bind(Overlay),
    OverlayClass: Overlay
});

export { Overlay };
