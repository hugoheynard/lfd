/**
 * LA table des formats d'image du back-office — la seule.
 *
 * 🔴 Ces valeurs ne se décident pas ici : elles RECOPIENT ce que la boutique
 * applique dans ses feuilles de style (`apps/lfc-ecommerce-frontend`, vérifié
 * le 2026-10-10) — tuile de rayon et ouverture de fiche en 4/3
 * (`product-sheet.scss`), cartes d'info de la vitrine en 16/9 ; le 21/9 des
 * grandes bannières et des opérations est décidé (plan médiathèque, D9) et pas
 * encore bâti côté boutique. Le jour où une feuille de style de la boutique
 * change de ratio, cette table change avec elle — sans quoi l'écran annonce une
 * forme que personne n'affiche, ce qui est arrivé : « Ouverture (3/2) » a été
 * écrit ici alors que la boutique coupait en 4/3 (D8).
 */

/** Un format : ce qu'on en dit, et sa valeur largeur / hauteur. */
export interface MediaFormat {
  /** Le nom court, tel qu'on l'écrit — « 4/3 ». */
  readonly short: string;
  /** Pour `aspect-ratio` en CSS — « 4 / 3 ». */
  readonly css: string;
  readonly ratio: number;
}

function format(width: number, height: number): MediaFormat {
  return {
    short: `${String(width)}/${String(height)}`,
    css: `${String(width)} / ${String(height)}`,
    ratio: width / height,
  };
}

export const FORMAT_4_3 = format(4, 3);
export const FORMAT_1_1 = format(1, 1);
export const FORMAT_16_9 = format(16, 9);
export const FORMAT_21_9 = format(21, 9);

/** Ce qu'un usage de fiche attend : son nom, son format (`null` = aucun). */
export interface MediaRoleFormat {
  /** Le libellé, sans le format. */
  readonly label: string;
  /** L'usage avec son article, pour une phrase — « l'ouverture ». */
  readonly phrase: string;
  readonly format: MediaFormat | null;
}

/** Par rôle de visuel de fiche (les cinq `MEDIA_ROLES` du domaine). */
export const MEDIA_ROLE_FORMATS: Readonly<Record<string, MediaRoleFormat>> = {
  hero: { label: 'Ouverture', phrase: "l'ouverture", format: FORMAT_4_3 },
  thumbnail: { label: 'Vignette de rayon', phrase: 'la vignette de rayon', format: FORMAT_4_3 },
  gallery: { label: 'Galerie', phrase: 'la galerie', format: null },
  lifestyle: { label: 'Mise en situation', phrase: 'la mise en situation', format: FORMAT_16_9 },
  print: { label: 'Tirage papier', phrase: 'le tirage papier', format: FORMAT_1_1 },
};

/** Le libellé d'un usage, son format dit entre parenthèses quand il en a un. */
export function roleLabel(entry: MediaRoleFormat): string {
  return entry.format === null ? entry.label : `${entry.label} (${entry.format.short})`;
}

/** Les cadres que montrent les aperçus du panneau de l'image — ce que le point focal décide. */
export const PREVIEW_FRAMES: readonly { readonly label: string; readonly format: MediaFormat }[] = [
  { label: 'Ouverture et vignette', format: FORMAT_4_3 },
  { label: 'Carré', format: FORMAT_1_1 },
  { label: "Carte d'info", format: FORMAT_16_9 },
  { label: 'Bannière', format: FORMAT_21_9 },
];

/**
 * L'écart au-delà duquel on le DIT : 8 % entre les deux ratios.
 *
 * En dessous, `object-fit: cover` rogne moins de 4 % de chaque bord — invisible
 * sur une tuile, et signaler là ferait crier au loup sur des recadrages
 * d'appareil (1,30 au lieu de 1,33). Au-dessus, on attrape le cas qui a motivé
 * le signal : un 3/2 posé en 4/3 (12,5 %, ≈ 6 % par bord), un 16/10 en 16/9.
 */
export const FORMAT_TOLERANCE = 0.08;

/** Au-delà de cet écart, ce n'est plus un bord qui part : c'est une grande partie. */
const LARGE_GAP = 0.3;

/** Proximité pour NOMMER un ratio : 2 %, l'imprécision d'un recadrage à la main. */
const NAMING_TOLERANCE = 0.02;

const COMMON_RATIOS: readonly MediaFormat[] = [
  FORMAT_1_1,
  FORMAT_4_3,
  format(3, 2),
  FORMAT_16_9,
  FORMAT_21_9,
  format(3, 4),
  format(2, 3),
];

/** L'écart relatif, symétrique : 1,5 contre 1,33 vaut 1,33 contre 1,5. */
function relativeGap(a: number, b: number): number {
  return Math.max(a, b) / Math.min(a, b) - 1;
}

/** Une décimale à la française — « 1,50 ». */
export function decimal(ratio: number): string {
  return ratio.toFixed(2).replace('.', ',');
}

/** Le nom courant d'un ratio s'il en est proche, sa décimale sinon. */
export function ratioName(ratio: number): string {
  const named = COMMON_RATIOS.find((known) => relativeGap(ratio, known.ratio) <= NAMING_TOLERANCE);
  return named === undefined ? decimal(ratio) : named.short;
}

/** Ce qu'on sait d'un écart signalé. */
export interface FormatGap {
  /** « 3/2 » ou « 1,62 ». */
  readonly actual: string;
  readonly actualRatio: number;
  readonly large: boolean;
}

/**
 * L'image s'écarte-t-elle du format attendu ? `null` = rien à dire : format
 * attendu absent, dimensions inconnues, ou écart dans la tolérance. Une image
 * non mesurée ne se signale jamais — un signal faux serait pire que rien.
 */
export function formatGap(
  width: number | null | undefined,
  height: number | null | undefined,
  target: MediaFormat | null,
): FormatGap | null {
  if (target === null || typeof width !== 'number' || typeof height !== 'number') {
    return null;
  }
  if (!(width > 0) || !(height > 0)) {
    return null;
  }
  const actualRatio = width / height;
  const gap = relativeGap(actualRatio, target.ratio);
  if (gap <= FORMAT_TOLERANCE) {
    return null;
  }
  return { actual: ratioName(actualRatio), actualRatio, large: gap > LARGE_GAP };
}

/** La phrase du signalement — jamais un refus. */
export function formatGapSentence(gap: FormatGap, role: MediaRoleFormat): string {
  const expected = role.format;
  const expectedText = expected === null ? '' : `${expected.short} (${decimal(expected.ratio)})`;
  const actual = gap.actual.includes('/')
    ? `${gap.actual} (≈ ${decimal(gap.actualRatio)})`
    : `≈ ${gap.actual}`;
  const loss = gap.large ? 'une grande partie sera coupée' : 'un bord sera coupé';
  return `Cette image est en ${actual}, ${role.phrase} attend du ${expectedText} : ${loss}. Vérifiez son point focal dans la médiathèque.`;
}
