import { settingsStore } from '../lib/settings';

async function main() {
  console.log('Initializing default settings...');
  const settings = await settingsStore.getSettings();
  console.log('Settings initialized:', settings);
  process.exit(0);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
