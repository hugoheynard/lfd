import type { SalesTermsHeading } from "@lfd/contracts";

/**
 * Command : renommer les CGV, dans les trois langues d'un coup.
 *
 * Elle porte QUI écrit : le titre est ce que la boutique affiche sur le lien du
 * pied de page, et savoir qui l'a changé fait partie de ce qu'on doit pouvoir
 * répondre dans six mois.
 */
export class SetSalesTermsTitleCommand {
  constructor(
    readonly heading: SalesTermsHeading,
    readonly staffUserId: string,
  ) {}
}
