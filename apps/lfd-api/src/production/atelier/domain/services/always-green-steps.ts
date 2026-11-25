import { localToInstant } from "@lfd/contracts";

import { type AlwaysGreenDeadline, dueCumulative, hasTimedDeadline } from "./always-green.js";

/**
 * **L'étape d'un poste en toujours vert** (
 * `documentation/fournil/un-produit-sur-plusieurs-postes.md`, § 2.4) — une
 * fonction pure.
 *
 * Une étape ne compte aucune pièce : elle n'avance pas par paliers, elle se
 * coche d'un coup, **à l'échéance de la ligne** — quand tous ses paliers à
 * heure sont échus, marge comprise. Sans palier à heure, elle est « à
 * confirmer », comme la fournée : aucune heure n'est inventée. Un palier « la
 * journée », ou à une heure qui n'existe pas ce jour-là, n'est pas attendu.
 *
 * Le plafond d'un rouge ne la retient pas : il porte sur ce qui sort, que le
 * poste qui finit déclare.
 */

/** Ce que le passage fait d'une étape : rien encore, à confirmer, ou la cocher. */
export type AlwaysGreenStepCheck = "nothing" | "no_deadline" | "check";

/** Ce que le calcul lit de la ligne d'une étape. */
export interface AlwaysGreenStepLine {
  readonly serviceDay: string;
  /** Les paliers de la ligne ; `null` : les besoins du jour sont illisibles. */
  readonly deadlines: readonly AlwaysGreenDeadline[] | null;
  readonly marginMinutes: number;
}

export function alwaysGreenStepCheck(line: AlwaysGreenStepLine, now: Date): AlwaysGreenStepCheck {
  if (line.deadlines === null || !hasTimedDeadline(line.deadlines)) {
    return "no_deadline";
  }
  const timed = line.deadlines
    .filter((step) => step.before !== null && localToInstant(line.serviceDay, step.before) !== null)
    .reduce((total, step) => total + step.quantity, 0);
  const due = dueCumulative(line.serviceDay, line.deadlines, line.marginMinutes, now);
  return due >= timed ? "check" : "nothing";
}
