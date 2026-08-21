/**
 * PM2 Ecosystem Configuration for Uni-Smiles Kiosk Agent
 *
 * Usage:
 *   npm run daemon:start    — Start agent as PM2 daemon
 *   npm run daemon:stop     — Stop the daemon
 *   npm run daemon:restart  — Restart the daemon
 *   npm run daemon:logs     — View live logs
 *   npm run daemon:boot     — Enable auto-start on OS boot
 *
 * Requirements:
 *   npm install -g pm2
 */
module.exports = {
  apps: [{
    name: 'uni-smiles-kiosk-agent',
    script: 'src/agent.js',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    env: {
      NODE_ENV: 'production',
      LOCAL_BRIDGE_PORT: '3001',
      HEARTBEAT_INTERVAL: '20000',
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/agent-error.log',
    out_file: './logs/agent-out.log',
    merge_logs: true,
    // Restart delay to prevent rapid restart loops
    restart_delay: 3000,
    // Maximum restarts within a window before giving up
    max_restarts: 10,
    min_uptime: '10s',
  }],
};
