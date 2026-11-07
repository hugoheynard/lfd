/**
 * Command : mettre en service tous les brouillons des textes d'e-mails (C3).
 *
 * `withSectionOrders` : vrai pour l'écran des textes (`admin/mail-copy`), qui
 * publie aussi les ordres de sections ; faux pour l'éditeur par blocs, où le
 * document fait foi pour l'ordre (plan `plan-editeur-par-blocs.md`, § 21).
 */
export class PublishMailCopyCommand {
  constructor(
    readonly staffUserId: string,
    readonly withSectionOrders = true,
  ) {}
}
