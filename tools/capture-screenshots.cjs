const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outDir = path.resolve(__dirname, '..', 'screenshots');
const userDataDir = path.resolve(__dirname, '..', '.tmp-chrome-screenshots');
const port = Number(process.env.DEBUG_PORT || 9333);
const baseUrl = 'http://127.0.0.1:3001';

const screens = [
  ['01-catalog', 'Catalog'],
  ['02-my-bags', 'My Bags'],
  ['03-throw-log', 'Throw Log'],
  ['04-scorecard', 'Scorecard'],
  ['05-rangefinder', 'Rangefinder'],
  ['06-wishlist', 'Wishlist'],
  ['07-my-courses', 'My Courses'],
  ['08-location-pins', 'Location Pins'],
  ['09-data', 'Data'],
  ['10-stats', 'Stats'],
  ['11-dictionary', 'Dictionary'],
  ['12-about', 'About'],
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function waitForDebug() {
  for (let i = 0; i < 80; i++) {
    try {
      return await getJson(`http://127.0.0.1:${port}/json/version`);
    } catch {
      await sleep(250);
    }
  }
  throw new Error('Chrome debugging endpoint did not start');
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  };
  const opened = new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  return {
    async send(method, params = {}) {
      await opened;
      const callId = ++id;
      ws.send(JSON.stringify({ id: callId, method, params }));
      return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }));
    },
    close() {
      ws.close();
    },
  };
}

async function evalJs(client, expression) {
  return client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
}

async function clickNav(client, label) {
  const expression = `
    (() => {
      const wanted = ${JSON.stringify(label)};
      const buttons = [...document.querySelectorAll('button')];
      const button = buttons.find((el) => {
        const text = el.innerText.trim();
        return text === wanted || text.includes(wanted) || text.toLowerCase().includes(wanted.toLowerCase());
      });
      if (!button) return { ok: false, buttons: buttons.map((el) => el.innerText.trim()).filter(Boolean).slice(0, 60) };
      button.click();
      return { ok: true };
    })()
  `;
  const result = await evalJs(client, expression);
  if (!result.result.value?.ok) {
    throw new Error(`Could not find nav button "${label}": ${JSON.stringify(result.result.value)}`);
  }
}

async function waitForApp(client) {
  for (let i = 0; i < 60; i++) {
    const result = await evalJs(client, `
      (() => {
        const text = document.body.innerText || '';
        return {
          ready: [...document.querySelectorAll('button')].some((el) => el.innerText.includes('Catalog')),
          text: text.slice(0, 200),
        };
      })()
    `);
    if (result.result.value?.ready) return;
    await sleep(1000);
  }
  const result = await evalJs(client, `document.body.innerText`);
  throw new Error(`App did not become ready. Body text: ${result.result.value}`);
}

async function screenshot(client, name) {
  const { data } = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    fromSurface: true,
  });
  await fs.writeFile(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
  console.log(`wrote screenshots/${name}.png`);
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  await fs.rm(userDataDir, { recursive: true, force: true });

  const chromeProcess = spawn(chrome, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-proxy-server',
    '--disable-extensions',
    '--disable-component-extensions-with-background-pages',
    '--disable-gpu',
    '--hide-scrollbars',
    'about:blank',
  ], { stdio: 'ignore', detached: false });

  try {
    await waitForDebug();
    let target;
    try {
      target = await getJson(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(baseUrl)}`, { method: 'PUT' });
    } catch {
      const targets = await getJson(`http://127.0.0.1:${port}/json/list`);
      target = targets.find((item) => item.type === 'page') || targets[0];
    }
    const client = cdp(target.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1100,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send('Page.navigate', { url: baseUrl });
    await sleep(2500);
    await waitForApp(client);

    for (const [fileName, label] of screens) {
      await clickNav(client, label);
      await sleep(900);
      await screenshot(client, fileName);
    }

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await client.send('Page.navigate', { url: baseUrl });
    await sleep(1800);
    await waitForApp(client);
    await screenshot(client, '13-mobile-catalog');
    await clickNav(client, 'More');
    await sleep(500);
    await screenshot(client, '14-mobile-more-drawer');
    client.close();
  } finally {
    chromeProcess.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
