/**
 * **Le contraste de deux couleurs**, selon la formule des WCAG 2.x reprise
 * par le RGAA (critère 3.2) : `(L1 + 0,05) / (L2 + 0,05)`, L la luminance
 * relative. Un texte courant demande au moins {@link MIN_TEXT_CONTRAST}.
 */
export const MIN_TEXT_CONTRAST = 4.5;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/u;

/** Une couleur `#rrggbb` ? La seule forme qu'une charte accepte. */
export function isHexColor(candidate: string): boolean {
  return HEX_COLOR.test(candidate);
}

function channel(hex: string, offset: number): number {
  const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** Le rapport de contraste de deux couleurs `#rrggbb`, de 1 à 21. */
export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
