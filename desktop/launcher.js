const { spawn } = require('child_process');
const path = require('path');

const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

const electronBin = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');

const child = spawn(electronBin, [__dirname], {
  env,
  stdio: 'ignore',
  detached: true,
  windowsHide: false,
});

child.unref(); // PowerShell 꺼도 Electron 계속 실행
process.exit(0);
