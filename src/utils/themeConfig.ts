import type { AppColorTheme, UiScaleLevel } from '../types/media';

export interface UiScalePreset {
  id: UiScaleLevel;
  label: string;
  scaleFactor: number;
  percentLabel: string;
}

export const UI_SCALE_PRESETS: UiScalePreset[] = [
  { id: 'small', label: 'Pequeno', scaleFactor: 0.85, percentLabel: '85%' },
  { id: 'default', label: 'Padrão', scaleFactor: 1.0, percentLabel: '100%' },
  { id: 'large', label: 'Grande', scaleFactor: 1.15, percentLabel: '115%' },
  { id: 'extra_large', label: 'Extra Grande', scaleFactor: 1.3, percentLabel: '130%' },
];

export interface ColorThemePreset {
  id: AppColorTheme;
  label: string;
  accent: string;
  accentHover: string;
  accentDark: string;
  accentSoft: string;
  accentBorder: string;
  accentText: string;
  onAccent: string;
}

export const COLOR_THEME_PRESETS: ColorThemePreset[] = [
  {
    id: 'automotive_blue',
    label: 'Azul Automotivo (Padrão)',
    accent: '#38BDF8',
    accentHover: '#7DD3FC',
    accentDark: '#0284C7',
    accentSoft: 'rgba(56, 189, 248, 0.22)',
    accentBorder: 'rgba(56, 189, 248, 0.65)',
    accentText: '#7DD3FC',
    onAccent: '#06090F',
  },
  {
    id: 'sport_red',
    label: 'Vermelho Esportivo',
    accent: '#F43F5E',
    accentHover: '#FB7185',
    accentDark: '#BE123C',
    accentSoft: 'rgba(244, 63, 94, 0.24)',
    accentBorder: 'rgba(244, 63, 94, 0.65)',
    accentText: '#FDA4AF',
    onAccent: '#FFFFFF',
  },
  {
    id: 'emerald_green',
    label: 'Verde Esmeralda',
    accent: '#10B981',
    accentHover: '#34D399',
    accentDark: '#047857',
    accentSoft: 'rgba(16, 185, 129, 0.22)',
    accentBorder: 'rgba(16, 185, 129, 0.65)',
    accentText: '#6EE7B7',
    onAccent: '#04120D',
  },
  {
    id: 'amber_gold',
    label: 'Âmbar / Dourado',
    accent: '#F59E0B',
    accentHover: '#FBBF24',
    accentDark: '#B45309',
    accentSoft: 'rgba(245, 158, 11, 0.22)',
    accentBorder: 'rgba(245, 158, 11, 0.65)',
    accentText: '#FCD34D',
    onAccent: '#120C02',
  },
  {
    id: 'neon_purple',
    label: 'Roxo Neon',
    accent: '#A855F7',
    accentHover: '#C084FC',
    accentDark: '#7E22CE',
    accentSoft: 'rgba(168, 85, 247, 0.24)',
    accentBorder: 'rgba(168, 85, 247, 0.65)',
    accentText: '#D8B4FE',
    onAccent: '#FFFFFF',
  },
  {
    id: 'graphite_gray',
    label: 'Cinza Grafite',
    accent: '#CBD5E1',
    accentHover: '#E2E8F0',
    accentDark: '#64748B',
    accentSoft: 'rgba(203, 213, 225, 0.20)',
    accentBorder: 'rgba(203, 213, 225, 0.58)',
    accentText: '#E2E8F0',
    onAccent: '#090D16',
  },
];

export function getUiScalePreset(id: UiScaleLevel): UiScalePreset {
  return UI_SCALE_PRESETS.find((p) => p.id === id) ?? UI_SCALE_PRESETS[1];
}

export function getColorThemePreset(id: AppColorTheme): ColorThemePreset {
  return COLOR_THEME_PRESETS.find((p) => p.id === id) ?? COLOR_THEME_PRESETS[0];
}
