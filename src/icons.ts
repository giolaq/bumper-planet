export const planetIcon = `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="16" r="8" fill="currentColor"/><ellipse cx="16" cy="16" rx="15" ry="5" transform="rotate(-28 16 16)" stroke="currentColor" stroke-width="2"/><circle cx="13" cy="13" r="2" fill="#171329"/></svg>`;
export const arrowIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export function el<T extends HTMLElement = HTMLElement>(id: string) { return document.getElementById(id) as T; }
export function escapeHTML(value: string) { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!)); }
