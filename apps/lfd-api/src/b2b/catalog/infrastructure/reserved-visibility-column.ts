import { RESERVED_VISIBILITIES, type ReservedVisibility } from "@lfd/contracts";

import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/** La colonne porte une valeur que le CHECK de la migration aurait dû refuser. */
export class UnknownReservedVisibilityError extends TechnicalError {
  constructor(readonly value: string) {
    super(
      "catalog.reservation.unknown_visibility",
      `La visibilité réservée « ${value} » n'est pas connue : la contrainte de la table a été levée, à rétablir avant toute écriture.`,
    );
  }
}

/** Relit `reserved_visibility` ; une ligne sans décision vaut le défaut de la base. */
export function reservedVisibilityOf(raw: string | undefined): ReservedVisibility {
  if (raw === undefined) {
    return "hidden";
  }
  const known = RESERVED_VISIBILITIES.find((visibility) => visibility === raw);
  if (known === undefined) {
    throw new UnknownReservedVisibilityError(raw);
  }
  return known;
}
