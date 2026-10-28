import type { WorkshopLine } from '@lfd/contracts';

/**
 * **Les paliers d'une ligne, côté écran** (plan
 * `documentation/fournil/plan-fournee-v3.md` §2, SPEC v3 §1).
 *
 * Le serveur sert les paliers NON cumulés (`WorkshopLine.deadlines`) ; l'écran
 * les cumule, et les fournées les remplissent dans l'ordre, sans attribution
 * manuelle : une plaque sortie compte d'abord pour l'échéance la plus proche.
 *
 * Fonctions pures. « Maintenant » est un nombre de minutes depuis minuit, donné
 * par l'horloge de la fiche — jamais lu ici.
 */
export interface DeadlineStep {
  /** La quantité de CE palier. */
  readonly q: number;
  /** `HH:mm`, ou `null` = « la journée » : aucune heure n'est inventée. */
  readonly before: string | null;
  /** Le cumul avant ce palier. */
  readonly from: number;
  /** Le cumul à la fin de ce palier : il est tenu quand `produced ≥ to`. */
  readonly to: number;
}

/** `"07:00"` → 420. Une heure illisible compte pour la fin de journée. */
export function minutesOf(before: string): number {
  const [hours, minutes] = before.split(':').map(Number);
  if (hours === undefined || minutes === undefined || Number.isNaN(hours + minutes)) {
    return Number.POSITIVE_INFINITY;
  }
  return hours * 60 + minutes;
}

/** `"07:00"` → « 7 h 00 », la façon dont le fournil dit l'heure. */
export function clockLabel(before: string): string {
  const [hours = '', minutes = ''] = before.split(':');
  return `${String(Number(hours))} h ${minutes}`;
}

/** « avant 7 h 00 », ou « dans la journée » sans échéance. */
export function beforeLabel(before: string | null): string {
  return before === null ? 'dans la journée' : `avant ${clockLabel(before)}`;
}

/**
 * Les paliers cumulés. La somme vaut toujours la quantité de la ligne : un
 * écart entre les paliers servis et la quantité (dérive lue après le calcul)
 * va au **dernier** palier, et un excédent se rogne en partant du dernier.
 * Une ligne sans palier servi en a un seul, « dans la journée ».
 */
export function steps(line: WorkshopLine): readonly DeadlineStep[] {
  const served = line.deadlines ?? [];
  if (line.quantity <= 0) {
    return [];
  }
  if (served.length === 0) {
    return [{ q: line.quantity, before: null, from: 0, to: line.quantity }];
  }
  const result: DeadlineStep[] = [];
  let acc = 0;
  served.forEach((deadline, index) => {
    const last = index === served.length - 1;
    const q = last ? line.quantity - acc : Math.min(deadline.quantity, line.quantity - acc);
    if (q > 0) {
      result.push({ q, before: deadline.before, from: acc, to: acc + q });
      acc += q;
    }
  });
  return result;
}

/** Le premier palier non tenu, ou `null` quand la ligne est faite. */
export function currentStep(line: WorkshopLine, produced: number): DeadlineStep | null {
  return steps(line).find((step) => produced < step.to) ?? null;
}

/** Ce qui manque au palier en cours (`to − produced`) ; `0` si la ligne est faite. */
export function stepRemaining(line: WorkshopLine, produced: number): number {
  const step = currentStep(line, produced);
  return step === null ? 0 : step.to - produced;
}

/** Le palier est-il non tenu ET son heure passée ? Un palier tenu n'est jamais en retard. */
export function isLate(step: DeadlineStep | null, produced: number, now: number): boolean {
  return (
    step !== null && produced < step.to && step.before !== null && minutesOf(step.before) < now
  );
}

/** De combien de minutes l'heure du palier est dépassée ; `0` s'il ne l'est pas. */
export function lateMinutes(step: DeadlineStep | null, now: number): number {
  if (step === null || step.before === null) {
    return 0;
  }
  return Math.max(0, now - minutesOf(step.before));
}

/** L'état d'une tranche, dans la vue par tranche (SPEC §4). */
export type SlotState = 'over' | 'next' | 'upcoming' | 'met';

/** Un produit dans une tranche : son palier à cette heure-là. */
export interface SlotRow {
  readonly line: WorkshopLine;
  readonly step: DeadlineStep;
  /** Rang du palier dans la ligne, à partir de 0. */
  readonly index: number;
  /** Combien de paliers porte la ligne. */
  readonly count: number;
  /** Ce qui manque POUR CE PALIER. */
  readonly missing: number;
  /** Ce qui est sorti pour ce palier. */
  readonly got: number;
}

/** Une carte de la vue par tranche : une heure limite et ses produits. */
export interface DeadlineSlot {
  readonly before: string | null;
  readonly state: SlotState;
  /** Minutes de dépassement, pour « Dépassée · 11 min ». */
  readonly lateBy: number;
  readonly missing: number;
  readonly total: number;
  readonly rows: readonly SlotRow[];
}

function rowOf(line: WorkshopLine, step: DeadlineStep, index: number, count: number): SlotRow {
  const missing = Math.max(0, Math.min(step.q, step.to - line.produced));
  return { line, step, index, count, missing, got: step.q - missing };
}

function slotState(missing: number, before: string | null, now: number): SlotState {
  if (missing === 0) {
    return 'met';
  }
  return before !== null && minutesOf(before) < now ? 'over' : 'upcoming';
}

/**
 * Les tranches d'une fiche : une par heure limite, dans l'ordre chronologique
 * (« dans la journée » en dernier). **Une seule « La prochaine »** : la première
 * non tenue et non dépassée. Dans une tranche non tenue, les produits déjà
 * tenus passent en bas.
 */
export function slots(lines: readonly WorkshopLine[], now: number): readonly DeadlineSlot[] {
  const byHour = new Map<string | null, SlotRow[]>();
  for (const line of lines) {
    const all = steps(line);
    all.forEach((step, index) => {
      const rows = byHour.get(step.before) ?? [];
      rows.push(rowOf(line, step, index, all.length));
      byHour.set(step.before, rows);
    });
  }
  const ordered = [...byHour.entries()].sort(
    ([a], [b]) =>
      (a === null ? Number.POSITIVE_INFINITY : minutesOf(a)) -
      (b === null ? Number.POSITIVE_INFINITY : minutesOf(b)),
  );
  let nextTaken = false;
  return ordered.map(([before, rows]) => {
    const missing = rows.reduce((sum, row) => sum + row.missing, 0);
    let state = slotState(missing, before, now);
    if (state === 'upcoming' && !nextTaken) {
      state = 'next';
      nextTaken = true;
    }
    const sorted =
      state === 'met'
        ? rows
        : [...rows.filter((row) => row.missing > 0), ...rows.filter((row) => row.missing === 0)];
    return {
      before,
      state,
      lateBy: state === 'over' && before !== null ? now - minutesOf(before) : 0,
      missing,
      total: rows.reduce((sum, row) => sum + row.step.q, 0),
      rows: sorted,
    };
  });
}
