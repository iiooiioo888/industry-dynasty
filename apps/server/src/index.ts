import { SIM_PACKAGE_VERSION, parcelIdFromCoords } from '@industry-dynasty/sim';
import { handlePlayerIntent, resetSessionWorldState } from './intent-handler.js';

const PORT = Number(process.env.PORT ?? 3847);

resetSessionWorldState();
const parcelId = parcelIdFromCoords(0, 0);
handlePlayerIntent({ type: 'world', action: { type: 'BID', parcelId, amount: 800 } });

console.log(`[industry-dynasty/server] sim ${SIM_PACKAGE_VERSION}`);
console.log(`[industry-dynasty/server] Sprint 1 intent stub — world actions via handlePlayerIntent`);
console.log(`[industry-dynasty/server] HTTP/WS not wired. PORT=${PORT}`);
