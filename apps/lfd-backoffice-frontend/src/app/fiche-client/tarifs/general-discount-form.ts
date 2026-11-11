import type {
  GeneralDiscountModeValue,
  GeneralDiscountPayload,
  GeneralDiscountTargetValue,
  GeneralDiscountView,
} from '@lfd/contracts';

/**
 * **La saisie de la remise générale** (`documentation/pricing/mercuriales/la-remise-generale.md`,
 * « Un taux par famille ») : le formulaire, ses refus dits avant l'envoi, et
 * l'aller-retour formulaire ↔ corps envoyé ↔ vue relue. Pur.
 */

/** Une ligne en cours de saisie : un taux pas encore tapé n'est pas une exclusion. */
export interface DiscountLineForm {
  readonly target: GeneralDiscountTargetValue;
  readonly targetId: string;
  readonly excluded: boolean;
  /** En points de base ; `null` = pas encore saisi. Ignoré si `excluded`. */
  readonly bp: number | null;
}

export interface GeneralDiscountForm {
  readonly mode: GeneralDiscountModeValue;
  /** Gardé quand on passe en « Seulement… » ; n'est envoyé qu'en « Tout sauf ». */
  readonly baseBp: number | null;
  readonly lines: readonly DiscountLineForm[];
}

/** Ce qu'ouvre l'interrupteur : « tout le catalogue », taux à saisir. */
export const NEW_GENERAL_DISCOUNT: GeneralDiscountForm = {
  mode: 'all_except',
  baseBp: null,
  lines: [],
};

const MIN_BP = 1;
const MAX_BP = 9_999;
/** 100 points de base font 1 %. */
export const BP_PER_PERCENT = 100;

export const DISCOUNT_MODE_LABELS: Readonly<Record<GeneralDiscountModeValue, string>> = {
  all_except: 'Tout le catalogue, sauf…',
  only: 'Seulement…',
};

/** Le champ rend des pourcents ; on garde des points de base entiers. */
export function bpOfPercent(percent: number | null): number | null {
  return percent === null ? null : Math.round(percent * BP_PER_PERCENT);
}

export function percentOfBp(bp: number | null): number | null {
  return bp === null ? null : bp / BP_PER_PERCENT;
}

/** Ce que la lecture rend, en saisie. */
export function discountFormOf(
  view: GeneralDiscountView | null | undefined,
): GeneralDiscountForm | null {
  if (view === null || view === undefined) {
    return null;
  }
  return {
    mode: view.mode,
    baseBp: view.baseBp,
    lines: view.rules.map((rule) => ({
      target: rule.target,
      targetId: rule.targetId,
      excluded: rule.bp === null,
      bp: rule.bp,
    })),
  };
}

function badRate(bp: number | null): boolean {
  return bp !== null && (bp < MIN_BP || bp > MAX_BP);
}

/** Ce qui manque pour l'envoyer — les refus du domaine, dits avant l'envoi. */
export function discountProblem(form: GeneralDiscountForm | null): string | null {
  if (form === null) {
    return null;
  }
  if (form.mode === 'all_except' && form.baseBp === null) {
    return 'Saisissez le taux de base de la remise générale.';
  }
  const rated = form.lines.filter((line) => !line.excluded);
  if (rated.some((line) => line.bp === null)) {
    return 'Une ligne de la remise n’a pas de taux : saisissez-le, ou marquez-la « exclue ».';
  }
  const rates = [
    ...(form.mode === 'all_except' ? [form.baseBp] : []),
    ...rated.map((line) => line.bp),
  ];
  if (rates.some(badRate)) {
    return 'Un taux de remise est compris entre 0,01 % et 99,99 %.';
  }
  if (form.mode === 'only' && rated.length === 0) {
    return 'En « Seulement… », au moins une ligne doit porter un taux.';
  }
  return null;
}

/** Le corps envoyé : le taux de base est toujours écrit, `null` en « Seulement… ». */
export function discountPayload(form: GeneralDiscountForm): GeneralDiscountPayload {
  return {
    mode: form.mode,
    baseBp: form.mode === 'all_except' ? form.baseBp : null,
    rules: form.lines.map((line) => ({
      target: line.target,
      targetId: line.targetId,
      bp: line.excluded ? null : line.bp,
    })),
  };
}

/** Le même corps, ou `null` sans remise ou tant qu'il manque quelque chose. */
export function discountViewOf(form: GeneralDiscountForm | null): GeneralDiscountView | null {
  return form === null || discountProblem(form) !== null ? null : discountPayload(form);
}

/** Deux remises disent-elles la même chose ? L'ordre des lignes ne compte pas. */
export function sameDiscount(
  a: GeneralDiscountView | null,
  b: GeneralDiscountView | null,
): boolean {
  const key = (view: GeneralDiscountView | null) =>
    view === null
      ? 'none'
      : JSON.stringify([
          view.mode,
          view.mode === 'all_except' ? view.baseBp : null,
          view.rules.map((rule) => `${rule.target}:${rule.targetId}:${String(rule.bp)}`).sort(),
        ]);
  return key(a) === key(b);
}

/** Ajoute une ligne ; une cible ne se règle qu'une fois. */
export function withDiscountLine(
  form: GeneralDiscountForm,
  target: GeneralDiscountTargetValue,
  targetId: string,
): GeneralDiscountForm {
  if (form.lines.some((line) => line.target === target && line.targetId === targetId)) {
    return form;
  }
  // En « tout sauf », on ajoute surtout pour exclure ; en « seulement », pour remiser.
  const excluded = form.mode === 'all_except';
  return { ...form, lines: [...form.lines, { target, targetId, excluded, bp: null }] };
}

export function withoutDiscountLine(
  form: GeneralDiscountForm,
  line: DiscountLineForm,
): GeneralDiscountForm {
  return { ...form, lines: form.lines.filter((candidate) => candidate !== line) };
}

export function withDiscountLineChange(
  form: GeneralDiscountForm,
  line: DiscountLineForm,
  change: Partial<Pick<DiscountLineForm, 'excluded' | 'bp'>>,
): GeneralDiscountForm {
  return {
    ...form,
    lines: form.lines.map((candidate) =>
      candidate === line ? { ...candidate, ...change } : candidate,
    ),
  };
}
