import { setTheme, useTheme } from '../theme.js';
import { useT } from '../locale.js';
import Icon from './Icon.jsx';

export default function ThemeSwitch({ labelId }) {
  const theme = useTheme();
  const t = useT();
  const options = [
    { value: 'dark', label: t.themeDark, title: t.themeDarkTitle, icon: 'moon' },
    { value: 'light', label: t.themeLight, title: t.themeLightTitle, icon: 'sun' },
    { value: 'lite', label: t.themeLite, title: t.themeLiteTitle, icon: 'feather' },
    { value: 'simple', label: t.themeSimple, title: t.themeSimpleTitle, icon: 'simple' },
  ];
  return (
    <div className="theme-switch labeled" role="radiogroup" aria-labelledby={labelId} aria-label={labelId ? undefined : t.theme}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          className={`theme-option theme-${o.value}${theme === o.value ? ' active' : ''}`}
          title={o.title}
          onClick={() => setTheme(o.value)}
        >
          <Icon name={o.icon} size={20} />
          <span className="theme-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
