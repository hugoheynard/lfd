/**
 * **« Rendu autrement »** (plan M2, §5.5) — l'équipe a rendu l'argent hors de
 * la plateforme (virement, espèces) : une demande arrêtée devient
 * `settled_elsewhere`, motif et fiche staff à l'appui, et une ligne `manual`
 * entre au carnet. Aucun argent ne bouge chez le prestataire.
 */
export class SettleCardRefundElsewhereCommand {
  constructor(
    readonly requestId: string,
    /** La fiche staff (jamais un `sub`). */
    readonly staffId: string,
    readonly reason: string,
  ) {}
}
