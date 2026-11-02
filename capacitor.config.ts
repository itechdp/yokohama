import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.itechdp.yokohama',
  appName: 'Crown Pvt. Ltd.',
  webDir: 'dist',
  server: {
    url: 'https://crown-pvt-ltd.vercel.app',
    cleartext: false
  }
};

export default config;
