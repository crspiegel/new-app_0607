import { spawn } from "node:child_process";
import http from "node:http";

const port = 5173;
const host = "127.0.0.1";
const url = `http://${host}:${port}`;

function waitForServer(targetUrl, timeoutMs = 30000) {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(targetUrl, (response) => {
        response.resume();
        resolve();
      });

      request.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timed out waiting for ${targetUrl}`));
          return;
        }
        setTimeout(attempt, 250);
      });
    };

    attempt();
  });
}

function spawnNode(args, options = {}) {
  return spawn(process.execPath, args, {
    stdio: "inherit",
    windowsHide: true,
    ...options,
  });
}

const server = spawnNode([
  "./node_modules/vite/bin/vite.js",
  "--host",
  host,
  "--port",
  String(port),
]);

let exitCode = 1;

try {
  await waitForServer(url);

  exitCode = await new Promise((resolve) => {
    const tests = spawnNode(["./node_modules/@playwright/test/cli.js", "test"]);
    tests.on("exit", (code) => resolve(code ?? 1));
  });
} finally {
  server.kill();
}

process.exit(exitCode);
