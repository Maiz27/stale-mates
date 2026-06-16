// Prerender the whole app. There is no server-side data (no load/+server/actions);
// AI runs in a browser Web Worker and multiplayer over a WebSocket, so every page
// can ship as static HTML that hydrates client-side. This keeps the deployment to a
// single catch-all serverless function (under Vercel's Hobby-plan limit of 12).
export const prerender = true;
