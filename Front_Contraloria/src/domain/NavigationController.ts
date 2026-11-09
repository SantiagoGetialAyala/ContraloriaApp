import type { CaseKind } from './types';

export type RouteMatch =
  | { name: 'dashboard' }
  | { name: 'login' }
  | { name: 'setup' }
  | { name: 'password_change' }
  | { name: 'case_list'; kind: CaseKind }
  | { name: 'case_create'; kind: CaseKind }
  | { name: 'case_detail'; caseId: string }
  | { name: 'compensatory_calendar' }
  | { name: 'procedure' }
  | { name: 'configuration' }
  | { name: 'users' }
  | { name: 'user_access'; userId: number }
  | { name: 'audit' }
  | { name: 'not_found' };

type RouteListener = (route: RouteMatch, searchParams: URLSearchParams) => void;

/**
 * Controlador de navegación orientado a objetos basado en el patrón Observer
 * y la API History del navegador.
 */
export class NavigationController {
  private readonly listeners: Set<RouteListener> = new Set();

  public constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', () => {
        this.notificar();
      });
    }
  }

  public navigate(path: string, replace = false): void {
    if (typeof window === 'undefined') return;
    if (replace) {
      window.history.replaceState({}, '', path);
    } else {
      window.history.pushState({}, '', path);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.notificar();
  }

  public subscribe(listener: RouteListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getCurrentRoute(): { route: RouteMatch; searchParams: URLSearchParams } {
    if (typeof window === 'undefined') {
      return { route: { name: 'dashboard' }, searchParams: new URLSearchParams() };
    }
    return {
      route: this.parsePathname(window.location.pathname),
      searchParams: new URLSearchParams(window.location.search),
    };
  }

  private notificar(): void {
    const { route, searchParams } = this.getCurrentRoute();
    for (const listener of this.listeners) {
      listener(route, searchParams);
    }
  }

  private isCaseKind(val: string): val is CaseKind {
    return (
      val === 'incapacidad' ||
      val === 'viatico' ||
      val === 'compensatorio' ||
      val === 'vacaciones'
    );
  }

  public parsePathname(pathname: string): RouteMatch {
    const clean = pathname.replace(/\/+$/, '') || '/';
    if (clean === '/') return { name: 'dashboard' };
    if (clean === '/ingresar') return { name: 'login' };
    if (clean === '/configurar') return { name: 'setup' };
    if (clean === '/cuenta/clave') return { name: 'password_change' };
    if (clean === '/compensatorios/calendario') return { name: 'compensatory_calendar' };
    if (clean === '/procedimientos') return { name: 'procedure' };
    if (clean === '/parametros') return { name: 'configuration' };
    if (clean === '/administracion/usuarios') return { name: 'users' };
    if (clean === '/administracion/auditoria') return { name: 'audit' };

    const moduleCreateMatch = clean.match(/^\/modulos\/([^/]+)\/nuevo$/);
    if (moduleCreateMatch && this.isCaseKind(moduleCreateMatch[1])) {
      return { name: 'case_create', kind: moduleCreateMatch[1] };
    }

    const moduleListMatch = clean.match(/^\/modulos\/([^/]+)$/);
    if (moduleListMatch && this.isCaseKind(moduleListMatch[1])) {
      return { name: 'case_list', kind: moduleListMatch[1] };
    }

    const caseDetailMatch = clean.match(/^\/expedientes\/([0-9a-fA-F-]{36})$/);
    if (caseDetailMatch) {
      return { name: 'case_detail', caseId: caseDetailMatch[1] };
    }

    const userAccessMatch = clean.match(/^\/administracion\/usuarios\/(\d+)$/);
    if (userAccessMatch) {
      return { name: 'user_access', userId: Number(userAccessMatch[1]) };
    }

    return { name: 'not_found' };
  }
}
