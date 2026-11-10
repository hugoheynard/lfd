import type { FooterContent } from "@lfd/contracts";

/**
 * Command : enregistrer le pied de page.
 *
 * Elle porte QUI écrit, et pas seulement quoi : un texte de vitrine est lu par
 * des clients, et savoir qui l'a changé fait partie de ce qu'on doit pouvoir
 * répondre dans six mois.
 */
export class SaveFooterContentCommand {
  constructor(
    readonly content: FooterContent,
    readonly staffUserId: string,
  ) {}
}
