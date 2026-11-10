/**
 * **Le point de retrait qu'une société préfère** — sa préférence
 * d'acheminement (« Mon compte », fiche client), et rien d'autre.
 *
 * Lu quand une commande ou un devis arrive SANS point choisi : le point
 * préféré est la première règle de la présélection (`preselectedPickupId`,
 * Hugo 2026-10-15). Un port étroit plutôt que le garde complet : la caisse
 * n'a besoin que de cet identifiant (ISP).
 */
export abstract class PreferredPickupReader {
  /** L'identifiant du point préféré, ou `null` : aucun, ou société inconnue. */
  abstract preferredPickupOf(companyId: string): Promise<string | null>;
}
