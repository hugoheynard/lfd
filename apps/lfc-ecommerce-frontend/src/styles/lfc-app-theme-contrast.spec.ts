import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Les contrastes du thème papier, lus dans la feuille elle-même (lot A4
 * d'accessibilité, 2026-10-26).
 *
 * Aucun outil ne voit un contraste : une teinte « adoucie » d'un cran passe le
 * typecheck, le build et les tests d'écran, et seul un audit la retrouve. Ce
 * test relit les VRAIES valeurs de `_lfc-app-theme.scss` — pas une copie qui
 * dériverait — et refuse qu'un rôle de texte repasse sous son seuil RGAA.
 *
 * Seul le bloc clair est lu : il n'y a pas de thème sombre
 * `prefers-color-scheme`, et le registre sombre (`[data-surface='chrome']`)
 * mêle des transparences qu'il faudrait composer avec leur fond.
 */
const THEME = readFileSync(resolve(process.cwd(), 'src/styles/_lfc-app-theme.scss'), 'utf8');

/** Le premier bloc `[data-theme='lfc-app'] { … }` : celui du papier. */
function lightBlock(): string {
  const start = THEME.indexOf("[data-theme='lfc-app'] {");
  const end = THEME.indexOf('\n}', start);
  return THEME.slice(start, end);
}

/** Toutes les déclarations du bloc, commentaires retirés. */
function declarations(): ReadonlyMap<string, string> {
  const body = lightBlock().replace(/\/\*[\s\S]*?\*\//g, '');
  const map = new Map<string, string>();
  for (const match of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      map.set(name, value.trim());
    }
  }
  return map;
}

const DECLARED = declarations();

/** Suit les `var(--x)` jusqu'à une couleur hexadécimale. */
function hex(token: string): string {
  const value = DECLARED.get(token);
  if (value === undefined) {
    throw new Error(`${token} n'est pas déclaré dans le bloc papier`);
  }
  const alias = /^var\((--[a-z0-9-]+)\)$/.exec(value);
  if (alias?.[1] !== undefined) {
    return hex(alias[1]);
  }
  if (!/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`${token} ne se résout pas en #rrggbb : ${value}`);
  }
  return value;
}

function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(color.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function ratio(foreground: string, background: string): number {
  const [light, dark] = [luminance(hex(foreground)), luminance(hex(background))].sort(
    (a, b) => b - a,
  );
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

const PAGE = '--fold-color-bg-page';
const CARD = '--fold-color-surface-card';
const BAND = '--fold-color-surface-band';
const SUNKEN = '--fold-color-surface-sunken';

/** Texte courant (RGAA 3.2, AA). */
const TEXT = 4.5;
/** Texte non informatif, contour de composant (RGAA 3.3). */
const GRAPHIC = 3;

describe('Thème papier — contrastes', () => {
  for (const surface of [PAGE, CARD, BAND, SUNKEN]) {
    it(`text-muted tient ${TEXT}:1 sur ${surface}`, () => {
      expect(ratio('--fold-color-text-muted', surface)).toBeGreaterThanOrEqual(TEXT);
    });

    /** Régression : « TTC » à 3,73:1 sur la carte, 85 fois sur la boutique. */
    it(`text-subtle tient ${TEXT}:1 sur ${surface}`, () => {
      expect(ratio('--lfc-color-text-subtle', surface)).toBeGreaterThanOrEqual(TEXT);
    });
  }

  for (const surface of [PAGE, CARD, BAND]) {
    it(`text-faded tient ${GRAPHIC}:1 sur ${surface}`, () => {
      expect(ratio('--fold-color-text-faded', surface)).toBeGreaterThanOrEqual(GRAPHIC);
    });

    it(`border-field tient ${GRAPHIC}:1 sur ${surface}`, () => {
      expect(ratio('--fold-color-border-field', surface)).toBeGreaterThanOrEqual(GRAPHIC);
    });
  }

  it('lit bien la feuille, et non une copie', () => {
    expect(hex('--fold-color-bg-page')).toBe(hex('--lfc-paper-50'));
  });
});
