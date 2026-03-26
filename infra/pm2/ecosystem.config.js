module.exports = {
  apps: [
    {
      name: 'ontrail-api',
      cwd: './services/api',
      script: 'uvicorn',
      args: 'main:app --host 0.0.0.0 --port 8000',
      interpreter: 'none',
      env: {
        DATABASE_URL: 'postgresql+asyncpg://ontrail:ontrail_dev@localhost:5432/ontrail',
        REDIS_URL: 'redis://localhost:6379/0',
      },
    },
    {
      name: 'ontrail-web',
      cwd: './apps/web',
      script: 'npm',
      args: 'run preview -- --port 3000',
      env: { NODE_ENV: 'production' },
    },
  ],
};
