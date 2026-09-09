import type { ResourceKind } from '../game/types';

/** Ícones da HUD — SVG inline, sem dependências externas. */

const S = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none' } as const;

export function IconCoin() {
  return (
    <svg {...S}>
      <circle cx="12" cy="12" r="8.5" fill="#f2c33d" />
      <circle cx="12" cy="12" r="6" fill="#d9a41f" />
      <path d="M12 8.2v7.6M9.8 10.2h4.4M9.8 13.8h4.4" stroke="#f7e2a0" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
export function IconGoldOre() {
  return (
    <svg {...S}>
      <path d="M4 17l3.5-8 6-2 5.5 4 1 6z" fill="#8a7f6a" />
      <circle cx="9" cy="12" r="2" fill="#f2c33d" />
      <circle cx="14.5" cy="14" r="1.5" fill="#f2c33d" />
      <circle cx="13" cy="9.5" r="1.2" fill="#ffe08a" />
    </svg>
  );
}
export function IconWood() {
  return (
    <svg {...S}>
      <rect x="3" y="8" width="18" height="5" rx="2.5" fill="#a5723f" />
      <rect x="3" y="14" width="14" height="5" rx="2.5" fill="#8a5d33" />
      <circle cx="4.5" cy="10.5" r="1.6" fill="#d9b06f" />
      <circle cx="4.5" cy="16.5" r="1.6" fill="#c39a5e" />
    </svg>
  );
}
export function IconPlanks() {
  return (
    <svg {...S}>
      <rect x="2.5" y="7" width="19" height="3.6" rx="1.2" fill="#c69457" />
      <rect x="2.5" y="11.4" width="19" height="3.6" rx="1.2" fill="#b1804a" />
      <rect x="2.5" y="15.8" width="19" height="3.6" rx="1.2" fill="#9c6d3d" />
    </svg>
  );
}
export function IconStone() {
  return (
    <svg {...S}>
      <path d="M3 17l4-8 6-2 5 4 3 6z" fill="#9aa2ab" />
      <path d="M7 9l6-2 1 6-7 4z" fill="#b7bec6" />
    </svg>
  );
}
export function IconBricks() {
  return (
    <svg {...S}>
      <rect x="3" y="7" width="8" height="4.4" rx="1" fill="#c8674a" />
      <rect x="12.5" y="7" width="8.5" height="4.4" rx="1" fill="#b3573c" />
      <rect x="3" y="12.6" width="8.5" height="4.4" rx="1" fill="#b3573c" />
      <rect x="13" y="12.6" width="8" height="4.4" rx="1" fill="#c8674a" />
    </svg>
  );
}
export function IconOre() {
  return (
    <svg {...S}>
      <path d="M4 17l3.5-8 6-2 5.5 4 1 6z" fill="#7d8794" />
      <circle cx="9.5" cy="12" r="1.8" fill="#c3ccd8" />
      <circle cx="14.5" cy="13.5" r="1.4" fill="#aab4c1" />
    </svg>
  );
}
export function IconIron() {
  return (
    <svg {...S}>
      <path d="M6 4l6 3 6-3v6l-6 10L6 10z" fill="#98a4b6" />
      <path d="M12 7l6-3v6l-6 10z" fill="#6d7a8e" />
    </svg>
  );
}
export function IconFood() {
  return (
    <svg {...S}>
      <path d="M12 3v18" stroke="#c9a94a" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 8c-3-2-5-1-5-1s1 3 5 4zM12 8c3-2 5-1 5-1s-1 3-5 4z" fill="#e0c661" />
      <path d="M12 14c-3-2-5-1-5-1s1 3 5 4zM12 14c3-2 5-1 5-1s-1 3-5 4z" fill="#d3b654" />
    </svg>
  );
}
export function IconPop() {
  return (
    <svg {...S}>
      <circle cx="9" cy="8" r="3.2" fill="#93a3ba" />
      <path d="M3.5 19c0-3.3 2.5-5.4 5.5-5.4s5.5 2.1 5.5 5.4z" fill="#93a3ba" />
      <circle cx="16" cy="9" r="2.6" fill="#6f8098" />
      <path d="M13.5 19c0-2.7 1.6-4.5 4-4.5s3.5 1.8 3.5 4.5z" fill="#6f8098" />
    </svg>
  );
}
export function IconWorker() {
  return (
    <svg {...S}>
      <circle cx="12" cy="7.5" r="3" fill="#e8c39a" />
      <path d="M6 19c0-3.4 2.7-5.6 6-5.6s6 2.2 6 5.6z" fill="#4d8ff0" />
      <path d="M4 6.5l3.5-2 1 1.7-3.5 2z" fill="#c8a06a" />
    </svg>
  );
}

export function IconCastle({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 20V9l2.2 1.6V7l2.4 1.2V6l2.4 1.4V6l2 1.2L14 6v1.4L16.4 6v2.2L18.8 7v3.6L21 9v11z" fill="currentColor" />
      <rect x="10.4" y="14" width="3.2" height="6" rx="1.6" fill="#0f1726" />
    </svg>
  );
}
export function IconMap({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 4v14M15 6v14" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
export function IconSave({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 5.6C4 4.7 4.7 4 5.6 4h10L20 8.4v10c0 .9-.7 1.6-1.6 1.6H5.6C4.7 20 4 19.3 4 18.4z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 4v5h7V4M8 20v-5h8v5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
export function IconHelp({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.6 9.6a2.5 2.5 0 114 2.4c-.8.6-1.6 1-1.6 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}
export function IconSword({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M18.5 3.5L9 13l2 2 9.5-9.5V3.5z" fill="currentColor" />
      <path d="M6 15l3 3-2.5 2.5-3-3z" fill="currentColor" />
      <path d="M4 12l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
export function IconHammer({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M13.5 3l7 7-3 3-7-7z" fill="currentColor" />
      <path d="M10.5 8L4 14.5V20h5.5L16 13.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
export function IconBug({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="7" y="7" width="10" height="12" rx="5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 11h3.5M17 11h3.5M4 17h3M17 17h3M9 6l1.5-2M15 6l-1.5-2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export const RESOURCE_ICON: Record<ResourceKind, () => JSX.Element> = {
  food: IconFood,
  wood: IconWood,
  stone: IconStone,
  ore: IconOre,
  goldOre: IconGoldOre,
  planks: IconPlanks,
  bricks: IconBricks,
  iron: IconIron,
  coin: IconCoin,
};

export const RESOURCE_LABEL: Record<ResourceKind, string> = {
  food: 'Comida',
  wood: 'Madeira',
  stone: 'Pedra',
  ore: 'Minério',
  goldOre: 'Minério de ouro',
  planks: 'Tábuas',
  bricks: 'Tijolos',
  iron: 'Ferro',
  coin: 'Ouro',
};

export const RESOURCE_HINT: Record<ResourceKind, string> = {
  food: 'Alimenta a população e o exército. Fazendas produzem.',
  wood: 'Bruto. A serraria converte em tábuas.',
  stone: 'Bruto. A olaria converte em tijolos.',
  ore: 'Bruto. A fundição converte em ferro.',
  goldOre: 'Bruto. A casa da moeda converte em ouro.',
  planks: 'Refinado. Base de quase toda construção.',
  bricks: 'Refinado. Oficinas, muralhas e prédios avançados.',
  iron: 'Refinado. Armas e tropas pesadas.',
  coin: 'Moeda. Salários, contratações e diplomacia.',
};
