/** Une promotion qui nomme une zone, telle que le refus la cite. */
export interface ZoneTargetingPromotion {
  readonly id: string;
  /** Le nom interne de la promotion. */
  readonly name: string;
  readonly archived: boolean;
}

/**
 * **« Quelles promotions nomment cette zone ? »** — archivées comprises (plan
 * `documentation/promotions/plan-acheminements-a-cocher.md`, § 9) : une
 * promotion garde la trace de ses zones. Déclaré par les zones de livraison,
 * implémenté par les promotions, relié par `appBootstrap`.
 *
 * Lu dans la transaction de la suppression, la zone verrouillée.
 */
export abstract class PromotionsTargetingZoneReader {
  /** Rangées par nom, non archivées d'abord. */
  abstract targeting(zoneId: string): Promise<readonly ZoneTargetingPromotion[]>;
}
