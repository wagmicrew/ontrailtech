module.exports = {
  apps: [
    {
      name: 'ontrail-api',
      cwd: './services/api',
      script: 'uvicorn',
      args: 'main:app --host 127.0.0.1 --port 8100',
      interpreter: 'none',
    },
    {
      name: 'ontrail-web',
      cwd: './apps/web',
      script: 'npm',
      args: 'run preview -- --port 3000',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'ontrail-expo',
      cwd: './apps/mobile',
      script: 'npx',
      args: 'expo start --port 8081 --tunnel --non-interactive',
      interpreter: 'none',
      env: { NODE_ENV: 'development' },
    },
  ],
};
