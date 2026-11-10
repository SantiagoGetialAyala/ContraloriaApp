import { useState, type ReactNode } from 'react';
import type { RouteMatch } from '../domain/NavigationController';
import type { UsuarioSesion } from '../domain/Usuario';
import type { CaseKind } from '../domain/types';
import { AppLink } from './AppLink';

export interface FlashMessage {
  id: number;
  type: 'success' | 'error' | 'warning';
  text: string;
}

interface LayoutProps {
  usuario: UsuarioSesion;
  route: RouteMatch;
  activeCaseKind?: CaseKind | null;
  messages: FlashMessage[];
  onDismissMessage: (id: number) => void;
  onLogout: () => Promise<void>;
  children: ReactNode;
}

export function Layout({
  usuario,
  route,
  activeCaseKind,
  messages,
  onDismissMessage,
  onLogout,
  children,
}: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isModuleActive = (kind: CaseKind) => {
    if (activeCaseKind === kind) return true;
    if ((route.name === 'case_list' || route.name === 'case_create') && route.kind === kind) {
      return true;
    }
    return false;
  };

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <>
      <a className="skip" href="#main">
        Ir al contenido
      </a>
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} id="sidebar">
        <AppLink className="brand" to="/" onClick={closeSidebar}>
          <span className="brand-mark">
            TH<span>✦</span>
          </span>
          <span>
            Talento Humano
            <small>CONTRALORÍA MUNICIPAL DE PASTO</small>
          </span>
        </AppLink>
        <div className="side-section">ESPACIO DE TRABAJO</div>
        <nav aria-label="Navegación principal">
          <AppLink
            to="/"
            onClick={closeSidebar}
            className={`nav-item ${route.name === 'dashboard' ? 'active' : ''}`}
          >
            <span aria-hidden="true">◫</span> Panel de gestión
          </AppLink>
          <AppLink
            to="/modulos/incapacidad"
            onClick={closeSidebar}
            className={`nav-item ${isModuleActive('incapacidad') ? 'active' : ''}`}
          >
            <span aria-hidden="true">✚</span> Incapacidades <span className="nav-arrow">›</span>
          </AppLink>
          <AppLink
            to="/modulos/viatico"
            onClick={closeSidebar}
            className={`nav-item ${isModuleActive('viatico') ? 'active' : ''}`}
          >
            <span aria-hidden="true">↗</span> Viáticos y viajes <span className="nav-arrow">›</span>
          </AppLink>
          <AppLink
            to="/modulos/vacaciones"
            onClick={closeSidebar}
            className={`nav-item ${isModuleActive('vacaciones') || route.name === 'vacation_calendar' ? 'active' : ''}`}
          >
            <span aria-hidden="true">☀</span> Gestión de vacaciones{' '}
            <span className="nav-arrow">›</span>
          </AppLink>
          <AppLink
            to="/vacaciones/calendario"
            onClick={closeSidebar}
            className={`nav-item ${route.name === 'vacation_calendar' ? 'active' : ''}`}
          >
            <span aria-hidden="true">▦</span> Plan anual y calendario
          </AppLink>
          <AppLink
            to="/procedimientos"
            onClick={closeSidebar}
            className={`nav-item ${route.name === 'procedure' ? 'active' : ''}`}
          >
            <span aria-hidden="true">≋</span> Procedimientos
          </AppLink>
          {usuario.puedeVerAdministracion() && (
            <>
              <div className="side-section">ADMINISTRACIÓN</div>
              <AppLink
                to="/parametros"
                onClick={closeSidebar}
                className={`nav-item ${route.name === 'configuration' ? 'active' : ''}`}
              >
                <span aria-hidden="true">⚙</span> Parámetros y normativa
              </AppLink>
            </>
          )}
          {usuario.esAdministrador() && (
            <>
              <AppLink
                to="/administracion/usuarios"
                onClick={closeSidebar}
                className={`nav-item ${route.name === 'users' || route.name === 'user_access' ? 'active' : ''}`}
              >
                <span aria-hidden="true">♧</span> Usuarios y permisos
              </AppLink>
              <AppLink
                to="/administracion/auditoria"
                onClick={closeSidebar}
                className={`nav-item ${route.name === 'audit' ? 'active' : ''}`}
              >
                <span aria-hidden="true">◷</span> Auditoría
              </AppLink>
            </>
          )}
        </nav>
        <div className="side-bottom">
          <div className="secure-icon">▣</div>
          <strong>Gestión con trazabilidad</strong>
          <p>Cada actuación, documento y decisión forma parte del expediente.</p>
          <div className="side-divider"></div>
          <AppLink to="/cuenta/clave" onClick={closeSidebar} className="account">
            <span className="avatar">{usuario.getInicialAvatar()}</span>
            <span>
              {usuario.nombreCompleto}
              <small>{usuario.dependencia}</small>
            </span>
          </AppLink>
          <button
            className="logout"
            type="button"
            onClick={() => {
              closeSidebar();
              void onLogout();
            }}
          >
            Cerrar sesión <span>↗</span>
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              id="menu-toggle"
              className="icon-button mobile-menu"
              type="button"
              aria-label="Abrir menú"
              aria-controls="sidebar"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen((v) => !v)}
            >
              ☰
            </button>
            <span className="organization">Contraloría Municipal de Pasto</span>
            <span className="topbar-divider">/</span>
            <span>Gestión de Talento Humano</span>
          </div>
          <div className="topbar-right">
            <span className="online-dot"></span> Espacio institucional{' '}
            {usuario.etiquetasRol.length > 0 && (
              <span className="badge" style={{ marginLeft: 6 }}>
                {usuario.etiquetasRol.join(' · ')}
              </span>
            )}
            <span className="avatar small">{usuario.getInicialAvatar()}</span>
          </div>
        </header>
        <main id="main" className="main">
          {messages.length > 0 && (
            <div className="messages" role="status">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`message ${m.type === 'error' ? 'error' : m.type === 'warning' ? 'warning' : ''}`}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
                >
                  <span>{m.text}</span>
                  <button
                    type="button"
                    onClick={() => onDismissMessage(m.id)}
                    style={{ background: 'none', border: 'none', color: 'inherit', fontSize: 14 }}
                    aria-label="Cerrar aviso"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {children}
          <footer className="footer">
            <span>Contraloría Municipal de Pasto · Talento Humano</span>
            <span>Información de acceso restringido</span>
          </footer>
        </main>
      </div>
    </>
  );
}
