// Starts the dashboard as "npm start" does, with the same stop on Control+C,
// but with a made-up data folder, any free port, a hidden Chrome and the
// pretend Amazon pages (fake-amazon.mjs), for the login tests: nothing reaches
// Amazon. It prints one line of JSON per event: "log" for each line the
// dashboard writes in the Terminal window, "ready" once the login has
// been checked by itself. A "log-in" line on its input presses "Log in to
// Amazon", then logs in by hand on the pretend login page with "Keep me
// signed in" ticked, as a person would, and prints "logged-in". With
// "slow-start", Amazon's first page after the window opens shows no name even
// with the login saved (fake-amazon.mjs's slowStart).
// Run by test/amazon-login.test.mjs: node run-dashboard.mjs <data folder> [slow-start]

import { createInterface } from 'node:readline';
import { startDashboard, stopOnSignals } from '../../../serve.mjs';
import { createGate } from '../../../amazon/browsers.js';
import { fakeAmazon } from './fake-amazon.mjs';

const say = (e) => process.stdout.write(`${JSON.stringify(e)}\n`);
const site = fakeAmazon();
site.slowStart = process.argv.includes('slow-start');
const app = await startDashboard({
  port: 0,
  dataDir: process.argv[2],
  // What the dashboard writes in the Terminal window, as "log" lines.
  log: (says) => say({ event: 'log', says }),
  liveOptions: { headless: true, routes: site.handler, gate: createGate({ gapMs: 200 }), labelUrl: 'data:text/html,<title>Live Amazon Browser</title>' },
});
stopOnSignals(app.stop);
await app.loginChecked;
say({ event: 'ready', login: app.login.view(), visits: site.visits.map((v) => v.url) });

createInterface({ input: process.stdin }).on('line', async (line) => {
  if (line.trim() !== 'log-in') return;
  await app.login.logIn();
  const started = Date.now();
  await app.live.page.check('#remember');
  await app.live.page.click('#log-in');
  while (app.login.view().state !== 'in' && Date.now() - started < 10_000) await new Promise((r) => setTimeout(r, 50));
  say({ event: 'logged-in', login: app.login.view(), ms: Date.now() - started });
});
