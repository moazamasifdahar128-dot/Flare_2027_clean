import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const child = spawn('npx', ['vite', 'build', ...args], {
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
