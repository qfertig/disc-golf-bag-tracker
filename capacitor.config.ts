import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.discit.bagtracker',
  appName: 'Bag Tracker',
  webDir: 'out',
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK'
    }
  }
};

export default config;
