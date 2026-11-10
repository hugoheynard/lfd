/**
 * Les méthodes de connexion de la personne connectée.
 *
 * Elle se désigne par son `subject` et non par son `userId` : la liste est
 * tenue par le fournisseur d'identité, qui ne connaît que lui. Notre base n'en
 * garde rien (plan `plan-rattachement-depuis-le-profil.md`, R1).
 */
export class ListMyLoginMethodsQuery {
  constructor(readonly subject: string) {}
}
