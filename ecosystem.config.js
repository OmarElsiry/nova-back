// PM2 Configuration for Production Deployment
module.exports = {
  apps: [{
    name: 'nova-ton-backend',
    script: './dist/index.js',
    interpreter: 'bun',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5001
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '500M',
    restart_delay: 3000,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s',
    listen_timeout: 3000,
    kill_timeout: 5000,
    wait_ready: true,
    combine_logs: true,
    merge_logs: true
  }]
};
