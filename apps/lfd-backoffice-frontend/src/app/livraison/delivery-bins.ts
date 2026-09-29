import {
  BIN_DIMENSION_MAX_CM,
  BIN_DIMENSION_MIN_CM,
  BIN_MAX_STACK_MAX,
  BIN_MAX_STACK_MIN,
  BIN_TYPE_NAME_MAX_LENGTH,
  type BinDimensions,
  type BinTypePayload,
  type BinTypeView,
} from '@lfd/contracts';

/**
 * **Les types de bacs** — la logique pure de l'écran « Bacs » et de son
 * dialogue (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 4
 * bis v2, tranche A).
 *
 * Les bornes sont celles du contrat : le domaine les tient et refuse de toute
 * façon, l'écran ne fait que les dire AVANT l'envoi, avec des mots qu'on lit.
 */

/** Trois dimensions en saisie : `null` tant que le champ est vide. */
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
  { key: 'lengthCm', word: 'longueur' },
  { key: 'widthCm', word: 'largeur' },
  { key: 'heightCm', word: 'hauteur' },
] as const;

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
    outer: { ...bin.outer },
    inner: { ...bin.inner },
    isotherm: bin.isotherm,
    maxStack: bin.maxStack,
    divisible: bin.divisible,
  };
}

function wholeWithin(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

/** Lit trois dimensions, ou dit laquelle manque ou déborde. */
function readDimensions(
  draft: DimensionsDraft,
  side: string,
):
  | { readonly ok: true; readonly value: BinDimensions }
  | { readonly ok: false; readonly issue: string } {
  for (const axis of AXES) {
    const value = draft[axis.key];
    if (value === null) {
      return { ok: false, issue: `Saisissez la ${axis.word} ${side}.` };
    }
    if (!wholeWithin(value, BIN_DIMENSION_MIN_CM, BIN_DIMENSION_MAX_CM)) {
      return {
        ok: false,
        issue: `La ${axis.word} ${side} va de ${String(BIN_DIMENSION_MIN_CM)} à ${String(BIN_DIMENSION_MAX_CM)} cm, en centimètres entiers.`,
      };
    }
  }
  return {
    ok: true,
    value: {
      lengthCm: draft.lengthCm ?? 0,
      widthCm: draft.widthCm ?? 0,
      heightCm: draft.heightCm ?? 0,
    },
  };
}

/** L'intérieur tient dans l'extérieur, dimension par dimension — ou la phrase qui le dit. */
function innerFitsIssue(outer: BinDimensions, inner: BinDimensions): string | null {
  for (const axis of AXES) {
    if (inner[axis.key] > outer[axis.key]) {
      return `La ${axis.word} intérieure (${String(inner[axis.key])} cm) dépasse la ${axis.word} extérieure (${String(outer[axis.key])} cm).`;
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
  const same = (a: BinDimensions, b: BinDimensions): boolean =>
    a.lengthCm === b.lengthCm && a.widthCm === b.widthCm && a.heightCm === b.heightCm;
  return (
    bin.name === payload.name &&
    same(bin.outer, payload.outer) &&
    same(bin.inner, payload.inner) &&
    bin.isotherm === payload.isotherm &&
    bin.maxStack === payload.maxStack &&
    bin.divisible === payload.divisible
  );
}

const CUBIC_CM_PER_LITER = 1_000;

/**
 * Le volume intérieur en litres, arrondi à l'inférieur — la règle du serveur
 * (`BinTypeView.innerVolumeLiters`), montrée en direct pendant la saisie ;
 * `null` tant qu'une dimension manque.
 */
export function draftInnerVolumeLiters(inner: DimensionsDraft): number | null {
  const { lengthCm, widthCm, heightCm } = inner;
  if (lengthCm === null || widthCm === null || heightCm === null) {
    return null;
  }
  return Math.floor((lengthCm * widthCm * heightCm) / CUBIC_CM_PER_LITER);
}

/** « 60 × 40 × 30 cm ». */
export function dimensionsLabel(dimensions: BinDimensions): string {
  return `${String(dimensions.lengthCm)} × ${String(dimensions.widthCm)} × ${String(dimensions.heightCm)} cm`;
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
