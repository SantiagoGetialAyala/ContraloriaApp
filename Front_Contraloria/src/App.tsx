import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AppLink } from './components/AppLink';
import { Layout, type FlashMessage } from './components/Layout';
import type { RouteMatch } from './domain/NavigationController';
import type { UsuarioSesion } from './domain/Usuario';
import type { CaseKind } from './domain/types';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { appServices } from './services/ServiceContainer';

const AuditPage = lazy(() => import('./pages/AuditPage').then((module) => ({ default: module.AuditPage })));
const CaseCreatePage = lazy(() => import('./pages/CaseCreatePage').then((module) => ({ default: module.CaseCreatePage })));
const CaseDetailPage = lazy(() => import('./pages/CaseDetailPage').then((module) => ({ default: module.CaseDetailPage })));
const CaseListPage = lazy(() => import('./pages/CaseListPage').then((module) => ({ default: module.CaseListPage })));
const CalendarPage = lazy(() => import('./pages/CalendarPage').then((module) => ({ default: module.CalendarPage })));
const ConfigPage = lazy(() => import('./pages/ConfigPage').then((module) => ({ default: module.ConfigPage })));
const HojasDeVidaPage = lazy(() => import('./pages/HojasDeVidaPage').then((module) => ({ default: module.HojasDeVidaPage })));
const PasswordPage = lazy(() => import('./pages/PasswordPage').then((module) => ({ default: module.PasswordPage })));
const ProcedurePage = lazy(() => import('./pages/ProcedurePage').then((module) => ({ default: module.ProcedurePage })));
const UsersPage = lazy(() => import('./pages/UsersPage').then((module) => ({ default: module.UsersPage })));
const VacationDashboardPage = lazy(() => import('./pages/VacationDashboardPage').then((module) => ({ default: module.VacationDashboardPage })));

export function App() {
  const [route, setRoute] = useState<RouteMatch>(
    () => appServices.navigation.getCurrentRoute().route,
  );
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [activeCaseKind, setActiveCaseKind] = useState<CaseKind | null>(null);
  const [messages, setMessages] = useState<FlashMessage[]>([]);
  const nextMsgId = useRef(1);
  const returnPath = useRef('/');
  const sessionExpired = useRef(false);

  const notify = useCallback((type: 'success' | 'error' | 'warning', text: string) => {
    const id = nextMsgId.current++;
    setMessages((prev) => [...prev.filter((m) => m.text !== text).slice(-3), { id, type, text }]);
  }, []);

  const dismissMessage = useCallback((id: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const sincronizarSesion = useCallback(async () => {
    try {
      const sesion = await appServices.auth.obtenerSesion();
      setConnectionError(false);
      setUsuario(sesion.usuario);
      if (sesion.autenticado) sessionExpired.current = false;
      setNeedsSetup(sesion.requiereConfiguracionInicial);
      if (sesion.requiereConfiguracionInicial) {
        if (appServices.navigation.getCurrentRoute().route.name !== 'setup') {
          appServices.navigation.navigate('/configurar', true);
        }
      } else if (!sesion.autenticado) {
        const current = appServices.navigation.getCurrentRoute().route;
        if (current.name !== 'login' && current.name !== 'setup') {
          returnPath.current = window.location.pathname + window.location.search;
        }
        if (appServices.navigation.getCurrentRoute().route.name !== 'login') {
          appServices.navigation.navigate('/ingresar', true);
        }
      } else {
        const currentName = appServices.navigation.getCurrentRoute().route.name;
        if (currentName === 'login' || currentName === 'setup') {
          appServices.navigation.navigate('/', true);
        }
      }
    } catch {
      setConnectionError(true);
    } finally {
      setInitializing(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = appServices.navigation.subscribe((newRoute) => {
      setRoute(newRoute);
    });
    void Promise.resolve().then(sincronizarSesion);
    const expired = () => {
      if (sessionExpired.current) return;
      sessionExpired.current = true;
      returnPath.current = window.location.pathname + window.location.search;
      setUsuario(null);
      setActiveCaseKind(null);
      setMessages([]);
      notify('warning', 'La sesión terminó. Ingrese nuevamente para continuar.');
      appServices.navigation.navigate('/ingresar', true, true);
    };
    window.addEventListener('talento:session-expired', expired);
    return () => {
      unsubscribe();
      window.removeEventListener('talento:session-expired', expired);
    };
  }, [notify, sincronizarSesion]);

  const handleAuthSuccess = async (msg: string) => {
    setMessages([]);
    notify('success', msg);
    await sincronizarSesion();
    appServices.navigation.navigate(returnPath.current, true);
    returnPath.current = '/';
  };

  const handleLogout = async () => {
    if (!appServices.navigation.canNavigate()) return;
    try {
      const msg = await appServices.auth.cerrarSesion();
      setUsuario(null);
      setActiveCaseKind(null);
      returnPath.current = '/';
      setMessages([]);
      notify('success', msg);
      appServices.navigation.navigate('/ingresar', true, true);
    } catch {
      notify('error', 'Error al cerrar la sesión.');
    }
  };

  if (initializing) {
    return (
      <main id="main" className="main">
        <section className="card empty large-empty">
          <span className="empty-icon">▣</span>
          <h3>Iniciando sistema de Talento Humano…</h3>
        </section>
      </main>
    );
  }

  if (connectionError && !usuario) {
    return <main id="main" className="connection-state"><section className="card padded">
      <h1>No se pudo conectar con el servidor</h1>
      <p>Compruebe que el backend esté iniciado y vuelva a intentar.</p>
      <button type="button" className="btn primary" onClick={() => { setInitializing(true); void sincronizarSesion(); }}>Reintentar conexión</button>
    </section></main>;
  }

  if (!usuario) {
    return (
      <AuthPage
        setupMode={needsSetup}
        messages={messages}
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  const renderPage = () => {
    const adminRoute = ['users', 'user_access', 'audit'].includes(route.name);
    const personnelRoute = ['hojas_de_vida', 'hoja_de_vida_detail'].includes(route.name);
    if ((adminRoute && !usuario.esAdministrador()) ||
        (personnelRoute && !usuario.esAdministrador() && !usuario.tieneRol('talento')) ||
        (route.name === 'configuration' && !usuario.puedeVerAdministracion())) {
      return <section className="card padded"><h1>Acceso restringido</h1><p>Su usuario no tiene permisos para esta sección.</p><AppLink className="btn secondary" to="/">Volver al inicio</AppLink></section>;
    }
    switch (route.name) {
      case 'dashboard':
        return <DashboardPage usuario={usuario} onNotify={notify} />;
      case 'case_list':
        if (route.kind === 'vacaciones') {
          return <VacationDashboardPage key="vac-dash" usuario={usuario} initialTab="cases" onNotify={notify} />;
        }
        return <CaseListPage key={route.kind} kind={route.kind} onNotify={notify} />;
      case 'case_create':
        return <CaseCreatePage key={route.kind} kind={route.kind} onNotify={notify} />;
      case 'case_detail':
        return (
          <CaseDetailPage
            key={route.caseId}
            caseId={route.caseId}
            onActiveKindChange={setActiveCaseKind}
            onNotify={notify}
          />
        );
      case 'vacation_calendar':
        return <VacationDashboardPage key="vac-cal" usuario={usuario} initialTab="calendar" onNotify={notify} />;
      case 'compensatory_calendar':
        return <CalendarPage onNotify={notify} />;
      case 'procedure':
        return <ProcedurePage onNotify={notify} />;
      case 'configuration':
        return <ConfigPage onNotify={notify} />;
      case 'users':
        return <UsersPage onNotify={notify} />;
      case 'user_access':
        return <UsersPage selectedUserId={route.userId} onNotify={notify} />;
      case 'hojas_de_vida':
        return <HojasDeVidaPage key="hv-list" usuario={usuario} onNotify={notify} />;
      case 'hoja_de_vida_detail':
        return (
          <HojasDeVidaPage
            key={`hv-${route.userId}`}
            selectedUserId={route.userId}
            usuario={usuario}
            onNotify={notify}
          />
        );
      case 'audit':
        return <AuditPage onNotify={notify} />;
      case 'password_change':
        return <PasswordPage onNotify={notify} />;
      default:
        return (
          <section className="card empty large-empty">
            <span className="empty-icon">▣</span>
            <h1>No encontramos este recurso</h1>
            <p>Compruebe la dirección y los permisos de su usuario.</p>
            <AppLink className="btn primary" to="/">
              Volver al inicio
            </AppLink>
          </section>
        );
    }
  };

  return (
    <Layout
      usuario={usuario}
      route={route}
      activeCaseKind={activeCaseKind}
      messages={messages}
      onDismissMessage={dismissMessage}
      onLogout={handleLogout}
    >
      <Suspense fallback={<section className="card padded" role="status">Cargando sección…</section>}>{renderPage()}</Suspense>
    </Layout>
  );
}

export default App;
