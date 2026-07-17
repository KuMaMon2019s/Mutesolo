import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Mutesolo',
    description: 'Mutesolo Chrome Extension — Agent Task Manager',
    permissions: ['sidePanel', 'storage'],
    host_permissions: ['http://localhost:8787/*'],
    side_panel: {
      default_path: 'sidepanel.html',
    },
    action: {
      default_title: 'Mutesolo',
      default_icon: {
        '16': 'icon16.png',
        '48': 'icon48.png',
        '128': 'icon128.png',
      },
    },
    icons: {
      '16': 'icon16.png',
      '48': 'icon48.png',
      '128': 'icon128.png',
    },
  },
});
