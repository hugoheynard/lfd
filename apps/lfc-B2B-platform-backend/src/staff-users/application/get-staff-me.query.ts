/** Query : l'identité et l'effectif de la personne qui appelle. */
export class GetStaffMeQuery {
  constructor(readonly staffUserId: string) {}
}
