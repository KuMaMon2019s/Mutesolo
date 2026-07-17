import '../entrypoints/style.css';
import { Router } from '../lib/router';
import { LoginPage } from '../pages/LoginPage';
import { WorkloadPage } from '../pages/WorkloadPage';
import { DetailPage } from '../pages/DetailPage';
import { SettingsPage } from '../pages/SettingsPage';
import { store } from '../lib/store';

console.log('[Mutesolo] sidepanel bootstrap starting...');

const app = document.getElementById('app');
if (!app) {
  console.error('[Mutesolo] #app element not found!');
  throw new Error('App container #app not found');
}

console.log('[Mutesolo] #app element found, initializing router...');

// Pre-load shared data on startup
store.loadUser();
store.loadWorkloads();

const router = new Router(app, {
  login: LoginPage,
  workload: WorkloadPage,
  detail: DetailPage,
  settings: SettingsPage,
});

console.log('[Mutesolo] router created, starting...');
router.start();
console.log('[Mutesolo] router started, hash:', window.location.hash);
