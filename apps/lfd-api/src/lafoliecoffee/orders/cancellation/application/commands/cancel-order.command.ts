/**
 * **L'équipe annule une commande** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, lot C3).
 *
 * `staffUserId` est l'id de la FICHE, reçu de la porte (`@StaffUserId()`) —
 * jamais un `sub`, jamais lu du corps. `reason` est brut : le domaine le
 * valide (`CancellationReason`).
 */
export class CancelOrderCommand {
  constructor(
    readonly orderId: string,
    readonly staffUserId: string,
    readonly reason: string,
  ) {}
}
