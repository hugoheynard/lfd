/**
 * Masque l'article de la vitrine **publique**, ou l'y remet — une intention du
 * back-office, distincte de son homologue professionnelle.
 *
 * Deux commandes et non un champ d'audience sur une seule : ce sont deux gestes
 * que le journal doit pouvoir raconter séparément, et deux refus possibles qui
 * ne sont pas les mêmes.
 */
export class SetPublicVisibilityCommand {
  constructor(
    readonly sku: string,
    readonly hidden: boolean,
    readonly decidedBy: string | null,
  ) {}
}
