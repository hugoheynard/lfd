/**
 * **La clé publique du compte qui encaisse un type de sujet** — une requête
 * du canal (plan M2, §4.2), pour l'écran des mandats SEPA qui l'affiche : une
 * clé de carte sur cet écran parce que l'écran l'affiche, pas parce que le
 * bloc encaisse le prélèvement. Rend la clé (`pk_…`), publique par
 * construction.
 *
 * @throws {NoCardAccountForSubjectTypeError} aucun compte pour ce type.
 * @throws {CardAccountUnavailableError} compte non configuré.
 */
export class GetCardPublishableKeyQuery {
  constructor(readonly subjectType: string) {}
}
