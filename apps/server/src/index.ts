import { SIM_PACKAGE_VERSION } from '@industry-dynasty/sim';
import { handlePlayerIntent } from './intent-handler.js';

const PORT = Number(process.env.PORT ?? 3847);

console.log(`[industry-dynasty/server] sim ${SIM_PACKAGE_VERSION}`);
console.log(`[industry-dynasty/server] intent stub:`, handlePlayerIntent({ type: 'ping', clientTime: Date.now() }));
console.log(`[industry-dynasty/server] Sprint 0 stub — HTTP/WS gameplay not wired. PORT=${PORT}`);
console.log(`[industry-dynasty/server] Run with: pnpm dev:server`);
