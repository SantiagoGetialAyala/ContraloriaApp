export type ThemeMode = 'light' | 'dark';

type ThemeListener = (theme: ThemeMode) => void;

const STORAGE_KEY = 'contraloria-theme';
const THEME_META_COLOR: Record<ThemeMode, string> = {
  light: '#085066',
  dark: '#08181E',
};

/**
 * Controlador orientado a objetos (patrón Observer) que gestiona el tema visual
 * (modo claro y modo oscuro), sincroniza `data-theme`, `localStorage`, la
 * preferencia del sistema (`prefers-color-scheme`) y el `<meta name="theme-color">`.
 */
export class ThemeController {
  private theme: ThemeMode;
  private userExplicitChoice: boolean;
  private readonly listeners: Set<ThemeListener> = new Set();

  public constructor() {
    const stored = this.readStoredTheme();
    this.userExplicitChoice = stored !== null;
    this.theme = stored ?? this.readSystemTheme();
    this.applyToDocument();
    this.bindSystemPreferenceListener();
  }

  public getTheme(): ThemeMode {
    return this.theme;
  }

  public isDark(): boolean {
    return this.theme === 'dark';
  }

  public setTheme(next: ThemeMode): void {
    this.userExplicitChoice = true;
    this.theme = next;
    this.persistTheme(next);
    this.applyToDocument();
    this.notify();
  }

  public toggle(): ThemeMode {
    const next: ThemeMode = this.theme === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
    return next;
  }

  public subscribe(listener: ThemeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private readStoredTheme(): ThemeMode | null {
    if (typeof window === 'undefined') return null;
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  }

  private persistTheme(value: ThemeMode): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Modo privado o almacenamiento restringido: el estado en memoria sigue activo.
    }
  }

  private readSystemTheme(): ThemeMode {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return 'light';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private bindSystemPreferenceListener(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      if (this.userExplicitChoice) return;
      this.theme = event.matches ? 'dark' : 'light';
      this.applyToDocument();
      this.notify();
    };
    media.addEventListener('change', onChange);
  }

  private applyToDocument(): void {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = this.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', THEME_META_COLOR[this.theme]);
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.theme);
    }
  }
}
