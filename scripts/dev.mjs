import { spawn } from 'node:child_process';
const children = [spawn(process.execPath, ['server/index.mjs'], { stdio: 'inherit', env: { ...process.env, PORT: '8791', HOST: '127.0.0.1' } }), spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' })];
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; children.forEach(c => c.kill('SIGTERM')); setTimeout(() => process.exit(code), 500).unref(); }
children.forEach(c => c.on('exit', code => stop(code || 0)));
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
