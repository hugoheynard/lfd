/** Une commande citée par un e-mail, que le compte présumé a le droit de voir. */
export interface PresumedOrder {
  readonly id: string;
  readonly number: string;
  /** La société de la commande, `null` pour une commande personnelle. */
  readonly companyId: string | null;
}

/**
 * Port de **lecture** : la commande d'un numéro cité par l'objet d'un e-mail,
 * SEULEMENT si ce compte peut la voir — la règle d'accès d'une commande, pas
 * une seconde (plan `plan-reponses-par-e-mail.md`, §2). Sinon `null` : un
 * numéro deviné ne relie à rien.
 */
export abstract class PresumedOrderReader {
  abstract visibleByNumber(orderNumber: string, userId: string): Promise<PresumedOrder | null>;
}
