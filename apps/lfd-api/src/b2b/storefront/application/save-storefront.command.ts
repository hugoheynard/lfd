import type { StorefrontPayload } from "@lfd/contracts";

/**
 * Enregistre la vitrine **entière** — pages, objets, gabarits — contre la
 * révision que l'éditeur avait chargée (plan, D6). Enregistrer publie : il n'y
 * a pas de brouillon.
 *
 * `staffUserId` : la fiche INTERNE de qui enregistre, rangée en
 * `updated_by_staff_id` — jamais un `sub` Auth0.
 */
export class SaveStorefrontCommand {
  constructor(
    readonly payload: StorefrontPayload,
    readonly staffUserId: string,
  ) {}
}
