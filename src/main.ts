import './style.css';
import { renderBrokenPanel } from './ui/brokenPanel';
import { renderCountPanel } from './ui/countPanel';
import { renderFindPanel } from './ui/findPanel';
import { renderMovPanel } from './ui/movPanel';
import { renderSmartPanel } from './ui/smartPanel';
import { renderWeakPanel } from './ui/weakPanel';

type PanelKey = 'count' | 'smart' | 'find' | 'mov' | 'weak' | 'broken';

const renderers: Record<PanelKey, (root: HTMLElement) => void> = {
  count: renderCountPanel,
  smart: renderSmartPanel,
  find: renderFindPanel,
  mov: renderMovPanel,
  weak: renderWeakPanel,
  broken: renderBrokenPanel,
};

const rendered = new Set<PanelKey>();

function panelEl(key: PanelKey): HTMLElement {
  return document.getElementById(`panel-${key}`) as HTMLElement;
}

function ensureRendered(key: PanelKey): void {
  if (rendered.has(key)) return;
  renderers[key](panelEl(key));
  rendered.add(key);
}

function selectTab(key: PanelKey): void {
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab-btn'));
  for (const tab of tabs) {
    const isActive = tab.dataset.panel === key;
    tab.setAttribute('aria-selected', String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
    tab.classList.toggle('active', isActive);
    panelEl(tab.dataset.panel as PanelKey).hidden = !isActive;
  }
  ensureRendered(key);
}

function wireTabs(): void {
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab-btn'));
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.panel as PanelKey));
    // Roving tabindex with arrow keys (WAI-ARIA tabs pattern).
    tab.addEventListener('keydown', (e) => {
      let next = -1;
      if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabs.length - 1;
      if (next >= 0) {
        e.preventDefault();
        tabs[next].focus();
        selectTab(tabs[next].dataset.panel as PanelKey);
      }
    });
  });
}

wireTabs();
selectTab('count');
