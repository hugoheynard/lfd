import { addMinutes, localToInstant } from "@lfd/contracts";

import { remainderUnderCeiling } from "./line-remainder.js";

/**
 * **La fournée automatique d'une ligne en toujours vert** (
 * `documentation/fournil/les-niveaux-de-suivi.md`) — des fonctions
 * pures.
 *
 * - Un palier est **échu** quand son heure plus la marge du réglage est
 *   passée ; seuls les paliers à heure comptent. Un palier « la journée »
 *   (`before: null`) n'échoit jamais : aucune heure n'est inventée.
 * - **La cible** est `min(cumul des paliers échus, compte, plafond)` ; **la
 *   quantité** à déclarer, `cible − sorti`, si elle est positive.
 * - L'`id` de la fournée est `auto-<jour>-<sku>-<n>`, `n` le nombre de
 *   fournées de la ligne, annulées comprises : `n` ne revient jamais en
 *   arrière, donc deux passages sur le même état rejouent la même charge, et
 *   un état nouveau donne un nouvel `id`.
 * - Une ligne **sans palier à heure** n'est pas complétée : elle reste à
 *   confirmer.
 */

/** L'auteur des fournées automatiques, rangé dans `production_batch.recorded_by`. */
export const ALWAYS_GREEN_AUTHOR = "system:always-green";

/** Un palier d'une ligne, tel que la fiche le sert : sa quantité propre, son heure. */
export interface AlwaysGreenDeadline {
  readonly quantity: number;
  /** `HH:mm`, ou `null` = la journée. */
  readonly before: string | null;
}

/** Ce que le calcul lit d'une ligne, sous le verrou de la journée. */
export interface AlwaysGreenLine {
  readonly serviceDay: string;
  readonly sku: string;
  /** La quantité au compte. */
  readonly counted: number;
  /** Les paliers de la ligne ; `null` : les besoins du jour sont illisibles. */
  readonly deadlines: readonly AlwaysGreenDeadline[] | null;
  readonly marginMinutes: number;
  /** Le sorti déclaré au dernier rouge ; `null` : jamais de rouge. */
  readonly ceiling: number | null;
  /** Ce qui est sorti, part corrigée déduite. */
  readonly output: number;
  /** Le nombre de fournées de la ligne, annulées comprises. */
  readonly batchCount: number;
}

/** Ce que le passage doit faire pour une ligne. */
export type AlwaysGreenStep =
  | { readonly kind: "no_deadline" }
  | { readonly kind: "nothing" }
  | { readonly kind: "record"; readonly batchId: string; readonly quantity: number };

/**
 * Ce que le passage a fait d'une ligne — la seule observabilité d'un geste
 * machine : une fournée déclarée (ou rejouée sur le même état), rien d'échu à
 * sortir de plus, ou pas de palier à heure (la ligne reste à confirmer).
 */
export type AlwaysGreenLineOutcome = "recorded" | "nothing" | "no_deadline";

/** La ligne a-t-elle au moins un palier à heure ? Sinon elle est à confirmer. */
export function hasTimedDeadline(deadlines: readonly AlwaysGreenDeadline[] | null): boolean {
  return deadlines !== null && deadlines.some((step) => timeOf(step) !== null);
}

/** Le cumul des paliers échus à `now` : heure du palier plus la marge, passée. */
export function dueCumulative(
  serviceDay: string,
  deadlines: readonly AlwaysGreenDeadline[],
  marginMinutes: number,
  now: Date,
): number {
  return deadlines.reduce((total, step) => {
    const time = timeOf(step);
    const at = time === null ? null : localToInstant(serviceDay, time);
    const due = at !== null && addMinutes(at, marginMinutes).getTime() <= now.getTime();
    return due ? total + step.quantity : total;
  }, 0);
}

/** Le pas d'une ligne : rien, à confirmer, ou la fournée à déclarer. */
export function alwaysGreenStep(line: AlwaysGreenLine, now: Date): AlwaysGreenStep {
  if (line.deadlines === null || !hasTimedDeadline(line.deadlines)) {
    return { kind: "no_deadline" };
  }
  const due = dueCumulative(line.serviceDay, line.deadlines, line.marginMinutes, now);
  const quantity = remainderUnderCeiling(Math.min(due, line.counted), line.ceiling, line.output);
  if (quantity <= 0) {
    return { kind: "nothing" };
  }
  return {
    kind: "record",
    batchId: `auto-${line.serviceDay}-${line.sku}-${String(line.batchCount)}`,
    quantity,
  };
}

/** L'heure d'un palier, ou `null` : la journée. */
function timeOf(step: AlwaysGreenDeadline): string | null {
  return step.before;
}

/**
 * **Ce que la fournée automatique ne complétera jamais** d'une ligne : la
 * part de son reste (sous le plafond) au-delà de ses paliers à heure. Un
 * palier « la journée » n'échoit jamais ; une ligne qui en porte un, seul ou
 * à côté de paliers à heure, garde cette part à confirmer à la main. Des
 * paliers illisibles (`null`) n'automatisent rien.
 */
export function unautomatedRemainder(line: {
  readonly counted: number;
  readonly deadlines: readonly AlwaysGreenDeadline[] | null;
  readonly ceiling: number | null;
  readonly output: number;
}): number {
  const target = line.ceiling === null ? line.counted : Math.min(line.counted, line.ceiling);
  const timed = (line.deadlines ?? [])
    .filter((step) => timeOf(step) !== null)
    .reduce((total, step) => total + step.quantity, 0);
  return Math.max(0, target - Math.max(line.output, Math.min(timed, target)));
}
