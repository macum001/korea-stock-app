module.exports = {
  apps: [{
    name: 'korea-stock-backend',
    script: './node_modules/.bin/ts-node',
    args: '-r tsconfig-paths/register src/server.ts',
    cwd: 'C:\\Users\\macum\\Desktop\\korea-stock-app\\backend',
    interpreter: 'none',
    env: {
      NODE_ENV: 'development',
    },
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
  }]
};
