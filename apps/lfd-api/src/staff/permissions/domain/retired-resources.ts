import { STAFF_RESOURCE_LABELS, isRetiredStaffResource, type StaffResource } from "@lfd/contracts";

import { DomainError } from "../../../platform/shared/errors/app-error.js";

/**
 * Accorder une ressource **retirée** est refusé (400) : elle ne s'accorde plus,
 * et la ligne qui la porte encore ne peut que rester telle quelle ou partir
 * (`RETIRED_STAFF_RESOURCES`, `plan-droit-lfc-catalog.md`, L2).
 */
export class RetiredStaffResourceGrantedError extends DomainError {
  constructor(readonly resource: StaffResource) {
    super(
      "staff.resource_retired",
      `« ${STAFF_RESOURCE_LABELS[resource]} » est retiré et ne s'accorde plus. ` +
        "Retirez-le, et accordez à la place le droit qui le remplace " +
        "(Catalogue publié pour le catalogue).",
    );
  }
}

/** Une ligne de droit, de rôle ou de dérogation : ce qui suffit à la comparer. */
interface ResourceLine {
  readonly resource: StaffResource;
}

/**
 * Le **seul geste** permis sur une ressource retirée est de la laisser telle
 * quelle ou de la retirer. Une ligne voulue qui la porte doit exister, à
 * l'identique, dans l'état stocké — sinon c'est un accord, et il est refusé.
 *
 * C'est ce qui laisse une fiche ou un rôle qui la porte encore s'enregistrer
 * entier (l'écran renvoie l'état complet) sans jamais en créer de nouvelle.
 *
 * @param keyOf l'identité COMPLÈTE d'une ligne (niveau, effet compris) : une
 *   ligne au niveau changé est un nouvel accord.
 * @throws {RetiredStaffResourceGrantedError} une ligne retirée nouvelle ou changée.
 */
export function assertRetiredLinesUnchanged<T extends ResourceLine>(
  stored: readonly T[],
  wanted: readonly T[],
  keyOf: (line: T) => string,
): void {
  const kept = new Set(stored.map(keyOf));
  const added = wanted.find(
    (line) => isRetiredStaffResource(line.resource) && !kept.has(keyOf(line)),
  );
  if (added !== undefined) {
    throw new RetiredStaffResourceGrantedError(added.resource);
  }
}
