import type { Clock } from "../../../platform/time/clock.js";
import { LegalEntityNotFoundError } from "../domain/errors/accounting-errors.js";
import type { BillableOrdersReader } from "../domain/ports/billable-orders.reader.js";
import type { CreditorReader } from "../domain/ports/creditor.reader.js";
import { cycleAt } from "../domain/services/billing-cycle.js";
import { cycleTagOf, renderPain008 } from "../domain/services/pain008.js";

/**
 * Le brouillon du cycle, **construit une seule fois pour deux sorties**.
 *
 * 🔴 Le XML et son CSV de contrôle passent par ici tous les deux, et c'est la
 * condition pour que le contrôle vaille quelque chose : si l'audit rendait le
 * fichier par un autre chemin, il attesterait un fichier que personne ne
 * télécharge. Le rendu est déterministe, mais deux chemins finiraient par
 * diverger — c'est toujours ainsi que ça se passe.
 *
 * Ce n'est pas un handler : c'est le geste partagé par deux lectures, sur le
 * modèle de `legal-entity-support.ts`.
 */
export interface CycleDraftDeps {
  readonly creditors: CreditorReader;
  readonly billable: BillableOrdersReader;
  readonly clock: Clock;
}

export interface CycleDraft {
  readonly xml: string;
  /** `202609` — le mois COUVERT, pas celui de la clôture. */
  readonly cycleTag: string;
}

/** @throws {LegalEntityNotFoundError} l'entité n'existe pas. */
export async function buildCycleDraft(
  deps: CycleDraftDeps,
  legalEntityId: string,
): Promise<CycleDraft> {
  // `CreditorReader` REFUSE de rendre une copie pour une entité qui ne peut pas
  // encaisser : l'incomplétude du bloc créancier est donc inexprimable ici, et
  // il n'y a aucune branche à écrire — donc aucune à oublier.
  const creditor = await deps.creditors.snapshot(legalEntityId);
  if (creditor === null) {
    throw new LegalEntityNotFoundError(legalEntityId);
  }

  const now = deps.clock.now();
  const cycle = cycleAt(now, null);
  const lines = await deps.billable.billableBetween(cycle.startsAt, cycle.closesAt);

  return {
    xml: renderPain008({
      creditor,
      cycleStart: cycle.startsAt,
      cycleEnd: cycle.closesAt,
      createdAt: now,
      lines,
    }),
    cycleTag: cycleTagOf(cycle.closesAt),
  };
}
