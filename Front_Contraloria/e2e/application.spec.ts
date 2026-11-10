import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.exposeFunction('assertNoRuntimeErrors', () => expect(errors).toEqual([]));
});

test.afterEach(async ({ page }) => {
  if (page.url().startsWith('http://localhost:5177')) {
    await page.evaluate(() => (window as unknown as { assertNoRuntimeErrors: () => Promise<void> }).assertNoRuntimeErrors());
  }
});

async function login(page: Page, username = 'persona.e2e', path = '/') {
  await page.goto(path);
  await page.getByLabel(/^Usuario/).fill(username);
  await page.getByLabel(/^Contraseña/).fill('Pruebas-interfaz-2026');
  await page.getByRole('button', { name: 'Ingresar al sistema' }).click();
  await expect(page.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeVisible();
}

test('login conserva el destino, persiste al recargar y logout impide volver al contenido privado', async ({ page }) => {
  await login(page, 'persona.e2e', '/modulos/viatico');
  await expect(page).toHaveURL(/\/modulos\/viatico$/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Inicio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toHaveCount(0);
});

test('inicio prioriza pendientes y mantiene informes plegados', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: 'Pendientes a mi cargo' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recursos en seguimiento' })).toBeHidden();
  await page.getByText('Resumen e indicadores', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recursos en seguimiento' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/inicio-desktop.png', fullPage: true });
});

test('vacaciones no inventa registros y la simulación de otra persona no permite crear una solicitud propia', async ({ page }) => {
  await login(page, 'admin.e2e', '/modulos/vacaciones');
  await expect(page.getByRole('heading', { name: 'Aún no hay expedientes de vacaciones radicados' })).toBeVisible();
  await expect(page.getByText(/Plan Anual Demo|Expedientes BD/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Simular fechas y cruces' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Funcionario de referencia').selectOption({ label: 'Funcionario de prueba · Dependencia de prueba' });
  await expect(dialog.getByRole('button', { name: /Solo consulta/ })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('compensatorios abre su calendario y hay una sola entrada de vacaciones', async ({ page }) => {
  await login(page, 'admin.e2e');
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  await expect(nav.getByRole('link', { name: 'Vacaciones', exact: true })).toHaveCount(1);
  await nav.getByRole('link', { name: 'Compensatorios', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Compensatorios/i }).first()).toBeVisible();
  await page.goto('/compensatorios/calendario');
  await expect(page.getByRole('heading', { name: 'Calendario de compensatorios' })).toBeVisible();
});

test('un funcionario no tiene acceso a administración ni a hojas de vida de otros usuarios', async ({ page }) => {
  await login(page);
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  await expect(nav.getByRole('link', { name: 'Hojas de vida' })).toHaveCount(0);
  for (const path of ['/administracion/usuarios', '/hojas-de-vida']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Acceso restringido' })).toBeVisible();
  }
});

test('el historial filtra consultas y conservar los cambios no guardados al consultar accesos', async ({ page }) => {
  await login(page, 'persona.e2e', '/modulos/incapacidad');
  await page.getByRole('link', { name: /^INC-/ }).first().click();
  await page.getByRole('navigation', { name: 'Secciones del expediente' }).getByRole('link', { name: 'Historial', exact: true }).click();
  await expect(page.getByText('Borrador creado', { exact: true })).toBeVisible();
  await expect(page.getByText('Expediente consultado', { exact: true })).toHaveCount(0);
  const observations = page.getByLabel('Observaciones (evite incluir diagnósticos)');
  await page.getByRole('link', { name: 'Gestión de etapa', exact: true }).click();
  await observations.fill('Cambios pendientes de guardar');
  await page.getByRole('navigation', { name: 'Secciones del expediente' }).getByRole('link', { name: 'Historial', exact: true }).click();
  await page.getByLabel('Incluir consultas, descargas y controles de acceso').check();
  await expect(page.getByText('Expediente consultado', { exact: true }).first()).toBeVisible();
  await expect(observations).toHaveValue('Cambios pendientes de guardar');
  await page.getByRole('link', { name: 'Gestión de etapa', exact: true }).click();
  await expect(page.getByText('Tiene cambios sin guardar.')).toBeVisible();
  await expect(page.getByText('Consultar etapas del procedimiento')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/expediente-desktop.png', fullPage: true });
});

test('la sesión vencida lleva al acceso y conserva el destino', async ({ page }) => {
  await login(page);
  // Expira realmente la sesión del servidor mediante otra petición del mismo contexto.
  const response = await page.request.get('/api/session/');
  const csrf = response.headers()['set-cookie']?.match(/csrftoken=([^;]+)/)?.[1];
  // session/ puede conservar la cookie; el token se obtiene de un nuevo contexto de respuesta si hace falta.
  const cookies = await page.context().cookies();
  const token = csrf || cookies.find((cookie) => cookie.name === 'csrftoken')?.value;
  await page.request.post('/api/auth/logout/', { headers: { 'X-CSRFToken': token || '', Origin: 'http://localhost:5177' }, data: {} });
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Viáticos y viajes' }).click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByText('La sesión terminó. Ingrese nuevamente para continuar.')).toBeVisible();
});

test('menú móvil accesible y sin desbordamiento horizontal a 360 y 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await login(page, 'admin.e2e');
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Vacaciones', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gestión de vacaciones' })).toBeVisible();
  for (const width of [360, 320]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
  await page.screenshot({ path: 'test-results/vacaciones-mobile.png', fullPage: true });
});

test('crea un borrador de incapacidad, adjunta su certificado y lo envía a revisión', async ({ page }) => {
  await login(page, 'persona.e2e', '/modulos/incapacidad/nuevo');
  await page.getByLabel('Fecha de inicio / salida').fill('2026-11-02');
  await page.getByLabel('Fecha de terminación / regreso').fill('2026-11-03');
  await page.getByLabel('Tipo de incapacidad o licencia').selectOption('comun');
  await page.getByLabel('EPS, ARL o entidad responsable').fill('Entidad E2E');
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page).toHaveURL(/\/expedientes\//);
  await page.getByRole('navigation', { name: 'Secciones del expediente' }).getByRole('link', { name: /^Documentos/ }).click();
  await page.getByLabel('Tipo de documento').selectOption('certificado');
  await page.getByLabel('Archivo PDF, JPG o PNG').setInputFiles({ name: 'certificado.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nPrueba E2E\n%%EOF') });
  await page.getByRole('button', { name: 'Adjuntar al expediente' }).click();
  await expect(page.getByRole('link', { name: 'Ver certificado.pdf', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Gestión de etapa', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /Enviar a revisión/ }).click();
  await expect(page.getByRole('heading', { name: 'Verificación de requisitos', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Secciones del expediente' }).getByRole('link', { name: 'Historial', exact: true }).click();
  await expect(page.getByText('Etapa completada', { exact: true }).first()).toBeVisible();
});

test('el formulario de vacaciones calcula con backend y guarda las mismas fechas', async ({ page }) => {
  await login(page, 'persona.e2e', '/modulos/vacaciones/nuevo');
  await page.getByLabel('Fecha de inicio / salida').fill('2026-11-24');
  await page.getByLabel('Días hábiles a disfrutar').fill('5');
  await expect(page.getByText(/Disfrute estimado:/)).toBeVisible();
  await expect(page.getByText(/Reintegro previsto:/).first()).toContainText(/01.*dic/);
  const savedResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/cases/vacaciones/'));
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  const saved = await (await savedResponse).json();
  expect(saved.data.case.data.end_date).toBe('2026-11-30');
  expect(saved.data.case.data.return_date).toBe('2026-12-01');
  await expect(page).toHaveURL(/\/expedientes\//);
  await page.getByRole('navigation', { name: 'Secciones del expediente' }).getByRole('link', { name: 'Historial', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Historial de actuaciones' })).toBeVisible();
});
