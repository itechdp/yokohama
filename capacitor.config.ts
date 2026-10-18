import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.itechdp.yokohama',
  appName: 'Crown Pvt. Ltd.',
  webDir: 'dist',
  server: {
    url: 'https://yokohama-rho.vercel.app',
    cleartext: false
  }
};

export default config;
