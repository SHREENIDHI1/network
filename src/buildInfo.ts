declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;

/** Version + git commit injected at build/dev time (see vite.config.ts). */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const APP_COMMIT = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'unknown';
