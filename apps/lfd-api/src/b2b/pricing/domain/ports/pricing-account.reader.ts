/**
 * **Le compte dont le tarif s'applique**, à un instant (`plan-sous-comptes.md`,
 * §2.2).
 *
 * Un sous-compte qui suit le tarif de son principal paie la mercuriale et les
 * engagements du principal ; il retombe sur les siens — ou le tarif public —
 * dès qu'il cesse de le suivre, sans copie (R4). La réponse est **datée** : une
 * relecture applique le suivi d'alors, jamais celui d'aujourd'hui
 * (`lint:dated-decisions`).
 *
 * Un port de la tarification, et non celui de `account/` : la tarification ne
 * connaît pas l'agrégat des suivis, seulement la clé qu'il en déduit.
 */
export abstract class PricingAccountReader {
  /** Le principal suivi en `pricing` à `at`, ou la société elle-même. */
  abstract pricingAccountOf(companyId: string, at: Date): Promise<string>;
}
