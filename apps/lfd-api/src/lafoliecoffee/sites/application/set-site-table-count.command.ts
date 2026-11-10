/** Commande **staff** : le nombre de tables de la salle d'un site. */
export class SetSiteTableCountCommand {
  constructor(
    readonly siteId: string,
    readonly count: number,
  ) {}
}
