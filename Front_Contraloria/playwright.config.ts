import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://localhost:5177', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], timezoneId: 'America/Bogota' } }],
  webServer: [
    { command: '..\\.venv\\Scripts\\python.exe ..\\tests\\e2e_server.py', url: 'http://127.0.0.1:8011/api/session/',
      env: { TALENTO_E2E: '1', PYTHONUNBUFFERED: '1' }, reuseExistingServer: false, timeout: 60000 },
    { command: 'npm run dev -- --port 5177', url: 'http://localhost:5177',
      env: { TALENTO_API_TARGET: 'http://127.0.0.1:8011' }, reuseExistingServer: false },
  ],
});
