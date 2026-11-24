/**
 * **Le tarif convenu d'un payeur** (plan `plan-clients-publics-chorus.md`,
 * § 6 sexies, QD8) : ce qu'un payeur sur devis de période a le droit de
 * commander. Déclaré par la commande, implémenté par la tarification, qui
 * possède la mercuriale ; `appBootstrap/negotiated-scope.module.ts` les relie.
 */
export abstract class NegotiatedScope {
  /**
   * Les SKU cités par la mercuriale active du payeur au jour de livraison
   * (`AAAA-MM-JJ`, ou `null` : aujourd'hui), ou `null` quand le payeur n'est
   * pas sur devis de période — rien ne borne alors sa commande. Un payeur sur
   * devis sans mercuriale active rend un ensemble VIDE : rien n'est convenu.
   */
  abstract scopeFor(
    payerCompanyId: string,
    day: string | null,
  ): Promise<ReadonlySet<string> | null>;
}

/** Qui paie la commande, et pour quel jour : la question posée au tarif convenu. */
export interface NegotiatedPayer {
  /** Le payeur copié sur la commande (`billedCompanyId`) ; `null` sans société. */
  readonly payerCompanyId: string | null;
  readonly day: string | null;
}
