/**
 * Multi-Kiosk Agent Runner
 * Spawns multiple kiosk-agent instances simultaneously, one per kiosk.
 * For development/demo purposes where all kiosks run on the same machine.
 */
const { spawn } = require('child_process');
const path = require('path');

// ──────────────────────────────────────────────────────────────
// Kiosk registry — one entry per registered kiosk
// ──────────────────────────────────────────────────────────────
const KIOSKS = [
  {
    name: 'Local Photobooth',
    // Removed hardcoded credentials so it reads from kiosk-agent/.env
    // which is updated by the Photobooth Settings UI.
  },
];

const AGENT_ENTRY = path.join(__dirname, 'kiosk-agent', 'src', 'agent.js');
const BACKEND_URL = 'http://127.0.0.1:8000';

const COLORS = ['\x1b[34m', '\x1b[35m', '\x1b[32m', '\x1b[33m'];
const RESET = '\x1b[0m';

function spawnAgent(kiosk, colorCode) {
  const env = {
    ...process.env,
    BACKEND_URL,
    HEARTBEAT_INTERVAL: '20000',
  };

  if (kiosk.DEVICE_ID) env.DEVICE_ID = kiosk.DEVICE_ID;
  if (kiosk.DEVICE_TOKEN) {
    env.DEVICE_TOKEN = kiosk.DEVICE_TOKEN;
    env.KIOSK_API_KEY = kiosk.DEVICE_TOKEN;
  }
  if (kiosk.LOCAL_BRIDGE_PORT) env.LOCAL_BRIDGE_PORT = kiosk.LOCAL_BRIDGE_PORT;

  const label = `[${kiosk.name}]`;

  const child = spawn(process.execPath, [AGENT_ENTRY], {
    cwd: path.join(__dirname, 'kiosk-agent'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (data) => {
    data.toString().split('\n').filter(Boolean).forEach(line => {
      process.stdout.write(`${colorCode}${label}${RESET} ${line}\n`);
    });
  });

  child.stderr.on('data', (data) => {
    data.toString().split('\n').filter(Boolean).forEach(line => {
      process.stderr.write(`${colorCode}${label}${RESET} \x1b[31m${line}\x1b[0m\n`);
    });
  });

  child.on('exit', (code) => {
    console.log(`${colorCode}${label}${RESET} Process exited with code ${code}. Restarting in 3s...`);
    setTimeout(() => spawnAgent(kiosk, colorCode), 3000);
  });

  child.on('error', (err) => {
    console.error(`${colorCode}${label}${RESET} Spawn error: ${err.message}`);
  });

  return child;
}

console.log('=======================================================');
console.log('  Uni-Smiles Multi-Kiosk Agent Runner');
console.log(`  Running ${KIOSKS.length} agents simultaneously`);
console.log('=======================================================');

KIOSKS.forEach((kiosk, i) => {
  spawnAgent(kiosk, COLORS[i % COLORS.length]);
});

// Keep process alive
process.on('SIGINT', () => {
  console.log('\nShutting down all kiosk agents...');
  process.exit(0);
});
