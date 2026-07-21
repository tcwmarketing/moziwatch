module.exports = {
  apps: [
    {
      name: "moziwatch",
      cwd: __dirname,
      script: "./node_modules/next/dist/bin/next",
      args: "start --hostname 127.0.0.1 --port 4288",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      kill_timeout: 10000,
      listen_timeout: 15000,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
