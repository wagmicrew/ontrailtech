const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');

module.exports = {
  apps: [
    {
      name: 'ontrail-api',
      cwd: path.join(rootDir, 'services/api'),
      script: 'uvicorn',
      args: 'main:app --host 127.0.0.1 --port 8100',
      interpreter: 'none',
    },
    {
      name: 'ontrail-web',
      cwd: path.join(rootDir, 'apps/web'),
      script: 'npm',
      args: 'run preview -- --port 3000',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'ontrail-expo',
      cwd: path.join(rootDir, 'apps/mobile'),
      script: path.join(rootDir, 'scripts', 'start-expo.js'),
      args: '--port 8082 --host localhost --strict-port',
      interpreter: 'node',
      env: {
        NODE_ENV: 'development',
        EXPO_DEVTOOLS_LISTEN_ADDRESS: '0.0.0.0',
        EXPO_NO_TELEMETRY: '1',
        EXPO_PACKAGER_PROXY_URL: 'https://expo.ontrail.tech',
        REACT_NATIVE_PACKAGER_HOSTNAME: 'expo.ontrail.tech',
        CI: '1',
      },
    },
  ],
};
