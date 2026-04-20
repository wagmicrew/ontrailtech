const net = require('net');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const passthroughArgs = [];

let preferredPort = Number(process.env.EXPO_PORT || 8081);
let host = process.env.EXPO_HOST;
let strictPort = false;
let checkOnly = false;
let jsonOutput = false;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];

  if (arg === '--port' && args[index + 1]) {
    preferredPort = Number(args[index + 1]);
    index += 1;
    continue;
  }

  if (arg.startsWith('--port=')) {
    preferredPort = Number(arg.split('=')[1]);
    continue;
  }

  if (arg === '--host' && args[index + 1]) {
    host = args[index + 1];
    index += 1;
    continue;
  }

  if (arg.startsWith('--host=')) {
    host = arg.split('=')[1];
    continue;
  }

  if (arg === '--strict-port') {
    strictPort = true;
    continue;
  }

  if (arg === '--check') {
    checkOnly = true;
    continue;
  }

  if (arg === '--json') {
    jsonOutput = true;
    continue;
  }

  passthroughArgs.push(arg);
}

if (!Number.isInteger(preferredPort) || preferredPort < 1024 || preferredPort > 65535) {
  console.error(`[start-expo] Invalid preferred port: ${preferredPort}`);
  process.exit(1);
}

function canBind(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port, '127.0.0.1');
  });
}

async function findPort(startPort) {
  const maxAttempts = strictPort ? 1 : 25;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = startPort + attempt;
    // eslint-disable-next-line no-await-in-loop
    if (await canBind(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function main() {
  const selectedPort = await findPort(preferredPort);
  const portBusy = selectedPort == null || selectedPort !== preferredPort;
  if (selectedPort == null) {
    const payload = {
      requestedPort: preferredPort,
      selectedPort: null,
      status: strictPort ? 'in-use' : 'no-free-port-found',
      message: strictPort
        ? `Port ${preferredPort} is already in use.`
        : `No free port found in range ${preferredPort}-${preferredPort + 24}.`,
    };
    if (jsonOutput) {
      console.log(JSON.stringify(payload, null, 2));
    }
    if (strictPort) {
      console.error(`[start-expo] Port ${preferredPort} is already in use.`);
    } else {
      console.error(`[start-expo] No free port found in range ${preferredPort}-${preferredPort + 24}.`);
    }
    process.exit(1);
  }

  const payload = {
    requestedPort: preferredPort,
    selectedPort,
    status: portBusy ? 'fallback-selected' : 'available',
    message: portBusy
      ? `Port ${preferredPort} is busy, using ${selectedPort} instead.`
      : `Port ${selectedPort} is available.`,
  };

  if (selectedPort !== preferredPort) {
    console.log(`[start-expo] Port ${preferredPort} is busy, using ${selectedPort} instead.`);
  } else {
    console.log(`[start-expo] Using port ${selectedPort}.`);
  }

  if (checkOnly) {
    if (jsonOutput) {
      console.log(JSON.stringify(payload, null, 2));
    }
    process.exit(0);
  }

  const expoArgs = ['expo', 'start', '--port', String(selectedPort)];
  if (host) {
    expoArgs.push('--host', host);
  }
  expoArgs.push(...passthroughArgs);

  const useShell = process.platform === 'win32';
  const command = 'npx';
  const child = spawn(command, expoArgs, {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: useShell,
    windowsHide: false,
    env: {
      ...process.env,
      EXPO_PORT: String(selectedPort),
    },
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error('[start-expo] Failed to start Expo:', error);
  process.exit(1);
});