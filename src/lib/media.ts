import { MediaQuery } from 'svelte/reactivity';

/**
 * Desktop breakpoint (Tailwind `md`). Dialogs on desktop, drawers on mobile.
 * Reading `.current` in a template or effect is reactive. The server/prerender
 * fallback is `true` (desktop markup).
 */
export const isDesktop = new MediaQuery('min-width: 768px', true);
