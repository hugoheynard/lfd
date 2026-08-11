/** Requête **staff** : les règles vues depuis un compte (global + dérogation + effectif). */
export class GetAccountAlertRulesQuery {
  constructor(readonly companyId: string) {}
}
