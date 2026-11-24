import { useEffect, useState } from 'react';
import type { ThemeMode } from '../domain/ThemeController';
import { appServices } from '../services/ServiceContainer';

interface ThemeToggleProps {
  compact?: boolean;
  floating?: boolean;
}

export function ThemeToggle({ compact = false, floating = false }: ThemeToggleProps) {
  const [theme, setTheme] = useState<ThemeMode>(() => appServices.theme.getTheme());

  useEffect(() => {
    return appServices.theme.subscribe((next) => {
      setTheme(next);
    });
  }, []);

  const isDark = theme === 'dark';
  const nextLabel = isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';

  return (
    <button
      type="button"
      className={`theme-toggle${compact ? ' is-compact' : ''}${floating ? ' is-floating' : ''}`}
      onClick={() => appServices.theme.toggle()}
      aria-label={nextLabel}
      aria-pressed={isDark}
      title={nextLabel}
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {isDark ? '☀' : '☾'}
      </span>
      <span className="theme-toggle-text">{isDark ? 'Claro' : 'Oscuro'}</span>
    </button>
  );
}
