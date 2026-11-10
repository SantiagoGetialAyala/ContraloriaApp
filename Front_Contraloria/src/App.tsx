import { useCallback, useEffect, useRef, useState } from 'react';
import { AppLink } from './components/AppLink';
import { Layout, type FlashMessage } from './components/Layout';
import type { RouteMatch } from './domain/NavigationController';
import type { UsuarioSesion } from './domain/Usuario';
import type { CaseKind } from './domain/types';
import { AuditPage } from './pages/AuditPage';
import { AuthPage } from './pages/AuthPage';
import { CaseCreatePage } from './pages/CaseCreatePage';
import { CaseDetailPage } from './pages/CaseDetailPage';
import { CaseListPage } from './pages/CaseListPage';
import { ConfigPage } from './pages/ConfigPage';
import { DashboardPage } from './pages/DashboardPage';
import { PasswordPage } from './pages/PasswordPage';
import { ProcedurePage } from './pages/ProcedurePage';
import { UsersPage } from './pages/UsersPage';
import { VacationDashboardPage } from './pages/VacationDashboardPage';
import { appServices } from './services/ServiceContainer';

export function App() {
  const [route, setRoute] = useState<RouteMatch>(
    () => appServices.navigation.getCurrentRoute().route,
  );
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [activeCaseKind, setActiveCaseKind] = useState<CaseKind | null>(null);
  const [messages, setMessages] = useState<FlashMessage[]>([]);
  const nextMsgId = useRef(1);

  const notify = useCallback((type: 'success' | 'error' | 'warning', text: string) => {
    const id = nextMsgId.current++;
    setMessages((prev) => [...prev, { id, type, text }]);
  }, []);

  const dismissMessage = useCallback((id: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const sincronizarSesion = useCallback(async () => {
    try {
      const sesion = await appServices.auth.obtenerSesion();
      setUsuario(sesion.usuario);
      setNeedsSetup(sesion.requiereConfiguracionInicial);
      if (sesion.requiereConfiguracionInicial) {
        if (appServices.navigation.getCurrentRoute().route.name !== 'setup') {
          appServices.navigation.navigate('/configurar', true);
        }
      } else if (!sesion.autenticado) {
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
      notify('error', 'No se pudo conectar con el servidor de Talento Humano.');
    } finally {
      setInitializing(false);
    }
  }, [notify]);

  useEffect(() => {
    const unsubscribe = appServices.navigation.subscribe((newRoute) => {
      setRoute(newRoute);
    });
    appServices.auth
      .obtenerSesion()
      .then((sesion) => {
        setUsuario(sesion.usuario);
        setNeedsSetup(sesion.requiereConfiguracionInicial);
        if (sesion.requiereConfiguracionInicial) {
          if (appServices.navigation.getCurrentRoute().route.name !== 'setup') {
            appServices.navigation.navigate('/configurar', true);
          }
        } else if (!sesion.autenticado) {
          if (appServices.navigation.getCurrentRoute().route.name !== 'login') {
            appServices.navigation.navigate('/ingresar', true);
          }
        } else {
          const currentName = appServices.navigation.getCurrentRoute().route.name;
          if (currentName === 'login' || currentName === 'setup') {
            appServices.navigation.navigate('/', true);
          }
        }
      })
      .catch(() => {
        notify('error', 'No se pudo conectar con el servidor de Talento Humano.');
      })
      .finally(() => {
        setInitializing(false);
      });
    return unsubscribe;
  }, [notify]);

  const handleAuthSuccess = async (msg: string) => {
    setMessages([]);
    notify('success', msg);
    await sincronizarSesion();
    appServices.navigation.navigate('/');
  };

  const handleLogout = async () => {
    try {
      const msg = await appServices.auth.cerrarSesion();
      setUsuario(null);
      setMessages([]);
      notify('success', msg);
      appServices.navigation.navigate('/ingresar');
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
    switch (route.name) {
      case 'dashboard':
        return <DashboardPage usuario={usuario} onNotify={notify} />;
      case 'case_list':
        if (route.kind === 'vacaciones') {
          return <VacationDashboardPage key="vac-dash" initialTab="calendar" onNotify={notify} />;
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
      case 'compensatory_calendar':
        return <VacationDashboardPage key="vac-cal" initialTab="calendar" onNotify={notify} />;
      case 'procedure':
        return <ProcedurePage onNotify={notify} />;
      case 'configuration':
        return <ConfigPage onNotify={notify} />;
      case 'users':
        return <UsersPage onNotify={notify} />;
      case 'user_access':
        return <UsersPage selectedUserId={route.userId} onNotify={notify} />;
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
      {renderPage()}
    </Layout>
  );
}

export default App;
