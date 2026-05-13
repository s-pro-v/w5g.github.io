/**
 * Web Components (Custom Elements) — rejestracja przy imporcie modułu.
 * Styl w Shadow DOM korzysta z dziedziczonych zmiennych CSS z :root.
 */

function tplStatCard() {
    return `
<style>
:host {
    display: flex;
    flex-direction: column;
    position: relative;
    background: var(--bg-panel);
    padding: clamp(12px, 3vw, 20px);
    min-height: 0;
}
:host::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 4px;
    height: 4px;
    background: var(--primary);
}
.stat-label {
    font-size: clamp(9px, 1.2vw, 10px);
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: clamp(4px, 1vw, 8px);
}
.stat-val {
    font-size: clamp(1rem, 2.5vw, 22px);
    font-weight: 700;
    color: var(--primary);
    text-shadow: var(--glow);
}
.stat-val.stable {
    color: var(--status-ok);
    text-shadow: none;
}
</style>
<div class="stat-label"></div>
<div class="stat-val"></div>
`;
}

class W5gStatCard extends HTMLElement {
    static observedAttributes = ['label', 'value'];

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        if (!this.shadowRoot.firstElementChild) {
            this.shadowRoot.innerHTML = tplStatCard();
        }
        this.render();
    }

    attributeChangedCallback() {
        this.render();
    }

    render() {
        if (!this.shadowRoot) return;
        const label = this.getAttribute('label') || '';
        const value = this.getAttribute('value') ?? '--';
        const stable = this.hasAttribute('stable');
        const labelEl = this.shadowRoot.querySelector('.stat-label');
        const valEl = this.shadowRoot.querySelector('.stat-val');
        if (labelEl) labelEl.textContent = label;
        if (valEl) {
            valEl.textContent = value;
            valEl.classList.toggle('stable', stable);
        }
    }
}

class W5gSidebarBrand extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        if (this.shadowRoot.firstElementChild) return;
        this.shadowRoot.innerHTML = `
<style>
:host { display: block; }
.brand-stack { display: flex; flex-direction: column; gap: clamp(2px, 0.4vw, 6px); }
</style>
<div class="brand-stack">
  <slot name="title"></slot>
  <slot name="subtitle"></slot>
</div>
`;
    }
}

customElements.define('w5g-stat-card', W5gStatCard);
customElements.define('w5g-sidebar-brand', W5gSidebarBrand);
