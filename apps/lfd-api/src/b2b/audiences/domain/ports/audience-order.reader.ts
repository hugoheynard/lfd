import type { AudienceDimension } from "@lfd/contracts";

/**
 * Une ligne d'agrégat, telle que la base la rend pour une coupe : la clé
 * BRUTE de la case (code NAF, index de tranche, code postal…) et ses totaux.
 * Le domaine la nomme et la regroupe (`audience-dimensions.ts`).
 */
export interface AudienceTally {
  readonly rawKey: string;
  /** Un libellé lu en base (nom du point de retrait, commune), sinon `null`. */
  readonly rawLabel: string | null;
  readonly clients: number;
  readonly orders: number;
  readonly revenueHtCents: number;
  readonly revenueTtcCents: number;
}

/** Le CA HT des lignes d'un article dans une case brute. */
export interface AudienceSkuRevenue {
  readonly rawKey: string;
  readonly sku: string;
  readonly revenueHtCents: number;
}

/**
 * Port de **lecture** des commandes, pour les audiences — déclaré ici,
 * implémenté par la commande (`b2b/orders`).
 *
 * 🔴 Il ne rend QUE des agrégats, une ligne par case brute : ni commande, ni
 * client, ni société. Le seuil d'anonymat s'applique ensuite ; ce qui ne sort
 * pas d'ici ne peut pas fuir plus loin.
 *
 * `from` et `to` sont des jours métier `AAAA-MM-JJ` compris, jour de
 * PASSATION à Paris.
 */
export abstract class AudienceOrderReader {
  /** Clients distincts, commandes et CA par case brute de la coupe. */
  abstract tally(
    dimension: AudienceDimension,
    from: string,
    to: string,
  ): Promise<readonly AudienceTally[]>;

  /** Le CA HT par case brute et par article — d'où se tirent les familles en tête. */
  abstract skuRevenue(
    dimension: AudienceDimension,
    from: string,
    to: string,
  ): Promise<readonly AudienceSkuRevenue[]>;

  /**
   * Les mêmes totaux pour les commandes nées d'un ABONNEMENT, qui restent
   * hors des coupes (`audience-scope.ts`) ; `null` quand il n'y en a aucune.
   */
  abstract subscriptionTally(from: string, to: string): Promise<AudienceTally | null>;

  /** Le CA HT par article des commandes d'abonnement (clé brute `all`). */
  abstract subscriptionSkuRevenue(from: string, to: string): Promise<readonly AudienceSkuRevenue[]>;
}
