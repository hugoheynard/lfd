/** Exempter une adresse pour une clé. Acte **staff**, auteur figé. Rend l'id de la ligne. */
export class AddFeatureExemptionCommand {
  constructor(
    readonly key: string,
    readonly email: string,
    readonly staffSub: string,
  ) {}
}
