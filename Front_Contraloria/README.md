# Interfaz de Talento Humano

React, TypeScript y Vite. Requiere el backend Django de la carpeta superior.

```powershell
cd "C:\Users\isamu\Desktop\Contraloria\ContraloriaApp\Front_Contraloria"
npm ci
npm run dev
```

Abra http://localhost:5173. Vite dirige API, documentos y reportes a http://127.0.0.1:8000. La sesión utiliza cookies de Django y protección CSRF.

La configuración inicial se ofrece si la base está vacía. En instalaciones existentes, use una cuenta registrada. Administración gestiona accesos; Administración y Talento Humano gestionan hojas de vida. Aprobar etapas requiere el rol operativo correspondiente.

```powershell
npm run build
npm run lint
npx playwright install chromium
npm run test:e2e
```

Playwright crea una base temporal y utiliza los puertos 8011 y 5177. Las cuentas de tests/e2e_server.py pertenecen exclusivamente a esa base. Las capturas se guardan en test-results/, excluido de Git.

npm run preview permite revisar el build con Django iniciado. TALENTO_API_TARGET permite configurar otro backend local. Un despliegue institucional requiere HTTPS, servidor WSGI y proxy del mismo origen; Vite sirve para desarrollo y revisión local.

Consulte [las instrucciones completas](../README.md) y [la revisión funcional](../docs/revision-aplicacion.md).
