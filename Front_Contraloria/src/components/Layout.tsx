import { useEffect, useState, type ReactNode } from 'react';
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

const modules: Array<{ kind: CaseKind; label: string; icon: string }> = [
  { kind: 'incapacidad', label: 'Incapacidades', icon: '✚' },
  { kind: 'viatico', label: 'Viáticos y viajes', icon: '↗' },
  { kind: 'vacaciones', label: 'Vacaciones', icon: '☀' },
  { kind: 'compensatorio', label: 'Compensatorios', icon: '◷' },
];

export function Layout({ usuario, route, activeCaseKind, messages, onDismissMessage, onLogout, children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const personnel = usuario.esAdministrador() || usuario.tieneRol('talento');
  const isModuleActive = (kind: CaseKind) =>
    (route.name === 'case_detail' && activeCaseKind === kind) ||
    ((route.name === 'case_list' || route.name === 'case_create') && route.kind === kind) ||
    (kind === 'vacaciones' && route.name === 'vacation_calendar') ||
    (kind === 'compensatorio' && route.name === 'compensatory_calendar');
  const closeSidebar = () => setSidebarOpen(false);

  useEffect(() => {
    if (!sidebarOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
        document.getElementById('menu-toggle')?.focus();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [sidebarOpen]);

  useEffect(() => {
    const titles: Record<string, string> = {
      dashboard: 'Inicio', users: 'Usuarios y permisos', user_access: 'Permisos de usuario',
      hojas_de_vida: 'Hojas de vida', hoja_de_vida_detail: 'Hoja de vida',
      procedure: 'Procedimientos', configuration: 'Parámetros y normativa',
      audit: 'Auditoría', password_change: 'Cambiar contraseña',
      vacation_calendar: 'Calendario de vacaciones', compensatory_calendar: 'Calendario de compensatorios',
      case_detail: 'Expediente', case_create: 'Nueva solicitud',
    };
    const title = route.name === 'case_list' ? modules.find((m) => m.kind === route.kind)?.label : titles[route.name];
    document.title = `${title || 'Talento Humano'} · Contraloría de Pasto`;
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [route]);

  return <>
    <a className="skip" href="#main">Ir al contenido</a>
    {sidebarOpen && <button type="button" className="sidebar-backdrop" aria-label="Cerrar menú" onClick={closeSidebar} />}
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} id="sidebar" aria-label="Menú de trabajo">
      <AppLink className="brand" to="/" onClick={closeSidebar}>
        <span className="brand-mark" aria-hidden="true">TH</span>
        <span>Talento Humano<small>Contraloría Municipal de Pasto</small></span>
      </AppLink>
      <nav aria-label="Navegación principal">
        <AppLink to="/" onClick={closeSidebar} className={`nav-item ${route.name === 'dashboard' ? 'active' : ''}`} aria-current={route.name === 'dashboard' ? 'page' : undefined}>
          <span aria-hidden="true">◫</span> Inicio
        </AppLink>
        <div className="side-section">Trámites</div>
        {modules.map((mod) => <AppLink key={mod.kind} to={`/modulos/${mod.kind}`} onClick={closeSidebar} className={`nav-item ${isModuleActive(mod.kind) ? 'active' : ''}`} aria-current={isModuleActive(mod.kind) ? 'page' : undefined}>
          <span aria-hidden="true">{mod.icon}</span>{mod.label}
        </AppLink>)}
        {personnel && <AppLink to="/hojas-de-vida" onClick={closeSidebar} className={`nav-item ${route.name.startsWith('hoja') ? 'active' : ''}`} aria-current={route.name.startsWith('hoja') ? 'page' : undefined}>
          <span aria-hidden="true">▤</span> Hojas de vida
        </AppLink>}
        <div className="side-section">Consulta y configuración</div>
        <AppLink to="/procedimientos" onClick={closeSidebar} className={`nav-item ${route.name === 'procedure' ? 'active' : ''}`} aria-current={route.name === 'procedure' ? 'page' : undefined}>
          <span aria-hidden="true">≋</span> Procedimientos
        </AppLink>
        {usuario.puedeVerAdministracion() && <AppLink to="/parametros" onClick={closeSidebar} className={`nav-item ${route.name === 'configuration' ? 'active' : ''}`}>
          <span aria-hidden="true">⚙</span> Parámetros y normativa
        </AppLink>}
        {usuario.esAdministrador() && <>
          <AppLink to="/administracion/usuarios" onClick={closeSidebar} className={`nav-item ${route.name === 'users' || route.name === 'user_access' ? 'active' : ''}`}>
            <span aria-hidden="true">♧</span> Usuarios y permisos
          </AppLink>
          <AppLink to="/administracion/auditoria" onClick={closeSidebar} className={`nav-item ${route.name === 'audit' ? 'active' : ''}`}>
            <span aria-hidden="true">▧</span> Auditoría
          </AppLink>
        </>}
      </nav>
      <div className="side-bottom">
        <AppLink to="/cuenta/clave" onClick={closeSidebar} className="account">
          <span className="avatar" aria-hidden="true">{usuario.getInicialAvatar()}</span>
          <span>{usuario.nombreCompleto}<small>{usuario.dependencia || 'Sin dependencia registrada'}</small></span>
        </AppLink>
        <AppLink to="/cuenta/clave" className="account-settings" onClick={closeSidebar}>Cambiar contraseña</AppLink>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="topbar-left">
          <button id="menu-toggle" className="icon-button mobile-menu" type="button" aria-label={sidebarOpen ? 'Cerrar menú' : 'Abrir menú'} aria-controls="sidebar" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen((v) => !v)}>☰</button>
          <span className="organization">Contraloría Municipal de Pasto</span>
        </div>
        <div className="topbar-right">
          <div className="session-identity"><strong>{usuario.nombreCompleto}</strong><small>{usuario.etiquetasRol.join(' · ') || 'Personal autorizado'}</small></div>
          <button className="btn secondary logout-button" type="button" disabled={loggingOut} onClick={async () => { setLoggingOut(true); try { await onLogout(); } finally { setLoggingOut(false); } }}>
            {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </button>
        </div>
      </header>
      <main id="main" className="main" tabIndex={-1}>
        {messages.length > 0 && <div className="messages" aria-live="polite" aria-atomic="false">
          {messages.map((m) => <div key={m.id} className={`message ${m.type === 'error' ? 'error' : m.type === 'warning' ? 'warning' : ''}`} role={m.type === 'error' ? 'alert' : 'status'}>
            <span>{m.text}</span><button type="button" className="dismiss-message" onClick={() => onDismissMessage(m.id)} aria-label="Cerrar aviso">×</button>
          </div>)}
        </div>}
        {children}
        <footer className="footer"><span>Contraloría Municipal de Pasto · Talento Humano</span><span>Información de acceso restringido</span></footer>
      </main>
    </div>
  </>;
}
