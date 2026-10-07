import {
  BIN_MAX_STACK_MAX,
  BIN_MAX_STACK_MIN,
  BIN_TYPE_DIMENSION_MAX_MM,
  BIN_TYPE_DIMENSION_MIN_MM,
  BIN_TYPE_NAME_MAX_LENGTH,
  type BinTypeDimensions,
  type BinTypePayload,
  type BinTypeView,
} from '@lfd/contracts';

/**
 * **Les types de bacs** — la logique pure de l'écran « Bacs » et de son
 * dialogue (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`, lot 4
 * bis v2, tranche A).
 *
 * Les bornes sont celles du contrat : le domaine les tient et refuse de toute
 * façon, l'écran ne fait que les dire AVANT l'envoi, avec des mots qu'on lit.
 *
 * **Le contrat parle en millimètres, l'écran en centimètres à une décimale**
 * (2026-10-07 : une manne à pain mesure 66,5 cm). La saisie reste en cm — c'est
 * ce qu'on mesure au mètre ruban — et se convertit en mm à l'envoi.
 */

/** Millimètres dans un centimètre. */
export const MM_PER_CM = 10;

/** Les bornes du contrat, dites en centimètres. */
export const BIN_TYPE_DIMENSION_MIN_CM = BIN_TYPE_DIMENSION_MIN_MM / MM_PER_CM;
export const BIN_TYPE_DIMENSION_MAX_CM = BIN_TYPE_DIMENSION_MAX_MM / MM_PER_CM;

/** Trois dimensions en saisie, en CENTIMÈTRES (une décimale) : `null` tant que le champ est vide. */
export interface DimensionsDraft {
  readonly lengthCm: number | null;
  readonly widthCm: number | null;
  readonly heightCm: number | null;
}

/** Le formulaire d'un type de bac, tel qu'on le tape. */
export interface BinTypeDraft {
  readonly name: string;
  readonly outer: DimensionsDraft;
  readonly inner: DimensionsDraft;
  readonly isotherm: boolean;
  readonly maxStack: number | null;
  readonly divisible: boolean;
}

export type BinTypeReading =
  | { readonly ok: true; readonly payload: BinTypePayload }
  | { readonly ok: false; readonly issue: string };

const EMPTY_DIMENSIONS: DimensionsDraft = { lengthCm: null, widthCm: null, heightCm: null };

const AXES = [
  { key: 'lengthCm', mm: 'lengthMm', word: 'longueur' },
  { key: 'widthCm', mm: 'widthMm', word: 'largeur' },
  { key: 'heightCm', mm: 'heightMm', word: 'hauteur' },
] as const;

/**
 * Des centimètres saisis en millimètres entiers, ou `null` s'ils portent plus
 * d'une décimale. `66.5 × 10` vaut `665` à l'arrondi flottant près : on
 * arrondit, puis on vérifie qu'on n'a rien jeté.
 */
export function cmToMm(cm: number): number | null {
  const mm = Math.round(cm * MM_PER_CM);
  return Math.abs(mm - cm * MM_PER_CM) < 1e-6 ? mm : null;
}

/** Des millimètres en centimètres pour la saisie : `665` → `66.5`. */
export function mmToCm(mm: number): number {
  return mm / MM_PER_CM;
}

function draftOfMm(dimensions: BinTypeDimensions): DimensionsDraft {
  return {
    lengthCm: mmToCm(dimensions.lengthMm),
    widthCm: mmToCm(dimensions.widthMm),
    heightCm: mmToCm(dimensions.heightMm),
  };
}

/** Le formulaire prérempli par un type existant, ou vide. */
export function binDraftOf(bin: BinTypeView | undefined): BinTypeDraft {
  if (bin === undefined) {
    return {
      name: '',
      outer: EMPTY_DIMENSIONS,
      inner: EMPTY_DIMENSIONS,
      isotherm: false,
      maxStack: null,
      divisible: false,
    };
  }
  return {
    name: bin.name,
    outer: draftOfMm(bin.outer),
    inner: draftOfMm(bin.inner),
    isotherm: bin.isotherm,
    maxStack: bin.maxStack,
    divisible: bin.divisible,
  };
}

function wholeWithin(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

/** Une dimension saisie, en mm — ou la phrase qui dit pourquoi elle ne part pas. */
function readDimension(
  value: number | null,
  word: string,
  side: string,
): { readonly ok: true; readonly mm: number } | { readonly ok: false; readonly issue: string } {
  if (value === null) {
    return { ok: false, issue: `Saisissez la ${word} ${side}.` };
  }
  const mm = cmToMm(value);
  if (mm === null || !wholeWithin(mm, BIN_TYPE_DIMENSION_MIN_MM, BIN_TYPE_DIMENSION_MAX_MM)) {
    return {
      ok: false,
      issue: `La ${word} ${side} va de ${centimetres(BIN_TYPE_DIMENSION_MIN_MM)} à ${centimetres(BIN_TYPE_DIMENSION_MAX_MM)} cm, au millimètre près (une décimale).`,
    };
  }
  return { ok: true, mm };
}

/** Lit trois dimensions en mm, ou dit laquelle manque ou déborde. */
function readDimensions(
  draft: DimensionsDraft,
  side: string,
):
  | { readonly ok: true; readonly value: BinTypeDimensions }
  | { readonly ok: false; readonly issue: string } {
  const value = { lengthMm: 0, widthMm: 0, heightMm: 0 };
  for (const axis of AXES) {
    const read = readDimension(draft[axis.key], axis.word, side);
    if (!read.ok) return read;
    value[axis.mm] = read.mm;
  }
  return { ok: true, value };
}

/** L'intérieur tient dans l'extérieur, dimension par dimension — ou la phrase qui le dit. */
function innerFitsIssue(outer: BinTypeDimensions, inner: BinTypeDimensions): string | null {
  for (const axis of AXES) {
    if (inner[axis.mm] > outer[axis.mm]) {
      return `La ${axis.word} intérieure (${centimetres(inner[axis.mm])} cm) dépasse la ${axis.word} extérieure (${centimetres(outer[axis.mm])} cm).`;
    }
  }
  return null;
}

/**
 * Le formulaire lu : la charge prête à partir, ou la PREMIÈRE raison de ne pas
 * l'envoyer — dans l'ordre du formulaire, pour qu'on corrige de haut en bas.
 */
export function readBinDraft(draft: BinTypeDraft): BinTypeReading {
  const name = draft.name.trim();
  if (name === '') return { ok: false, issue: 'Nommez le type de bac.' };
  if (name.length > BIN_TYPE_NAME_MAX_LENGTH) {
    return {
      ok: false,
      issue: `Nom trop long (${String(BIN_TYPE_NAME_MAX_LENGTH)} caractères au plus).`,
    };
  }
  const outer = readDimensions(draft.outer, 'extérieure');
  if (!outer.ok) return outer;
  const inner = readDimensions(draft.inner, 'intérieure');
  if (!inner.ok) return inner;
  const fits = innerFitsIssue(outer.value, inner.value);
  if (fits !== null) return { ok: false, issue: fits };
  if (draft.maxStack === null) {
    return { ok: false, issue: 'Dites combien de bacs tiennent dans une pile.' };
  }
  if (!wholeWithin(draft.maxStack, BIN_MAX_STACK_MIN, BIN_MAX_STACK_MAX)) {
    return {
      ok: false,
      issue: `Une pile compte de ${String(BIN_MAX_STACK_MIN)} à ${String(BIN_MAX_STACK_MAX)} bacs.`,
    };
  }
  return {
    ok: true,
    payload: {
      name,
      outer: outer.value,
      inner: inner.value,
      isotherm: draft.isotherm,
      maxStack: draft.maxStack,
      divisible: draft.divisible,
    },
  };
}

/** La correction n'écrirait rien : la charge est celle du type. */
export function sameBinPayload(bin: BinTypeView, payload: BinTypePayload): boolean {
  const same = (a: BinTypeDimensions, b: BinTypeDimensions): boolean =>
    a.lengthMm === b.lengthMm && a.widthMm === b.widthMm && a.heightMm === b.heightMm;
  return (
    bin.name === payload.name &&
    same(bin.outer, payload.outer) &&
    same(bin.inner, payload.inner) &&
    bin.isotherm === payload.isotherm &&
    bin.maxStack === payload.maxStack &&
    bin.divisible === payload.divisible
  );
}

const CUBIC_MM_PER_LITER = 1_000_000;

/**
 * Le volume intérieur en litres, arrondi à l'inférieur — la règle du serveur
 * (`BinTypeView.innerVolumeLiters`, en mm³), montrée en direct pendant la
 * saisie ; `null` tant qu'une dimension manque ou ne se lit pas au millimètre.
 */
export function draftInnerVolumeLiters(inner: DimensionsDraft): number | null {
  const { lengthCm, widthCm, heightCm } = inner;
  if (lengthCm === null || widthCm === null || heightCm === null) {
    return null;
  }
  const [length, width, height] = [cmToMm(lengthCm), cmToMm(widthCm), cmToMm(heightCm)];
  if (length === null || width === null || height === null) {
    return null;
  }
  return Math.floor((length * width * height) / CUBIC_MM_PER_LITER);
}

/** Des millimètres en centimètres à la française : `665` → « 66,5 », `460` → « 46 ». */
export function centimetres(mm: number): string {
  return mmToCm(mm).toLocaleString('fr-FR', { maximumFractionDigits: 1, useGrouping: false });
}

/** « 66,5 × 46 × 71,5 cm » — la décimale seulement si elle n'est pas nulle. */
export function dimensionsLabel(dimensions: BinTypeDimensions): string {
  return `${centimetres(dimensions.lengthMm)} × ${centimetres(dimensions.widthMm)} × ${centimetres(dimensions.heightMm)} cm`;
}

/** « 54 L ». */
export function litersLabel(liters: number): string {
  return `${liters.toLocaleString('fr-FR')} L`;
}

/** « Isotherme · pile de 5 · cloisonnable » — « Sec » quand il n'est pas isotherme. */
export function binTraitsLabel(bin: BinTypeView): string {
  return [
    bin.isotherm ? 'Isotherme' : 'Sec',
    `pile de ${String(bin.maxStack)} au plus`,
    ...(bin.divisible ? ['cloisonnable en deux demi-bacs'] : []),
  ].join(' · ');
}

/** Le catalogue coupé en deux : ce qu'on propose, et ce qui a été archivé. */
export interface BinCatalogue {
  readonly active: readonly BinTypeView[];
  /** Les archivés, le plus récemment archivé en tête. */
  readonly archived: readonly BinTypeView[];
}

export function splitBins(types: readonly BinTypeView[]): BinCatalogue {
  return {
    active: types.filter((bin) => bin.archivedAt === null),
    archived: types
      .filter((bin) => bin.archivedAt !== null)
      .sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? '')),
  };
}

const ARCHIVED_DAY = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeZone: 'Europe/Paris',
});

/** « archivé le 12 septembre 2026 » — le jour à Paris. */
export function archivedOnLabel(archivedAt: string): string {
  return `archivé le ${ARCHIVED_DAY.format(new Date(archivedAt))}`;
}

/** « 1 type proposé », « 3 types proposés ». */
export function activeBinsLabel(count: number): string {
  return count === 1 ? '1 type proposé' : `${String(count)} types proposés`;
}
