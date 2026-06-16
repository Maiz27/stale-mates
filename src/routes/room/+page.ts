// The room is entirely client-driven (reads ?id from the URL and opens a WebSocket
// after mount), so there's nothing useful to server-render. Ship a prerendered
// client shell, like the AI page.
export const ssr = false;
