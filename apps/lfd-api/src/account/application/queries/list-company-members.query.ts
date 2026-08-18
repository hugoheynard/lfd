/**
 * Les personnes qui **accèdent** à l'espace d'une société — le gestionnaire et
 * son équipe.
 *
 * À ne pas confondre avec ses `CompanyContact` : un contact est quelqu'un qu'on
 * appelle, un membre est quelqu'un qui se connecte et voit les prix négociés.
 */
export class ListCompanyMembersQuery {
  constructor(readonly companyId: string) {}
}
