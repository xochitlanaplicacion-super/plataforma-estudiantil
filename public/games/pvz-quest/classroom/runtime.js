// A single asset package works in the isolated preview and authenticated platform.
const config = typeof document === 'undefined' ? {} : document.documentElement.dataset;
const prefix = /^\/games\/pvz-quest$/.test(config.pvzAssetRoot || '') ? config.pvzAssetRoot : '';
export const assetURL = path => path.startsWith('/assets/') ? `${prefix}${path}` : path;
export const platformMode = config.pvzPlatform === 'true';
export const questionsAPI = platformMode ? '/api/classroom/pvz-quest/questions' : '/api/classroom/questions';
export const statusAPI = platformMode ? '/api/classroom/pvz-quest/ai-status' : '/api/classroom/ai-status';
