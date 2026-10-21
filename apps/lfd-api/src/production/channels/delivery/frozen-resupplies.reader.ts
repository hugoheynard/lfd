/** Une ligne d'un réassort figé : l'article, son nom figé, la quantité demandée. */
export interface FrozenResupplyLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/** Un réassort tel que l'arrêt du plan l'a figé. */
export interface FrozenResupply {
  readonly resupplyId: string;
  /** `AAAA-MM-JJ` — la journée qui l'a figé. */
  readonly serviceDay: string;
  /** Le point, opaque, et son nom figé à l'arrêt (`null` : inconnu). */
  readonly siteId: string;
  readonly siteLabel: string | null;
  /** Le nom du réassort (R1g), figé à l'arrêt ; `null` : sans nom. */
  readonly name: string | null;
  /** Le point est servi par un transfert interne, figé à l'arrêt (R3b). */
  readonly servedByTransfer: boolean;
  readonly lines: readonly FrozenResupplyLine[];
}

/**
 * **« Qu'a-t-on figé pour ces réassorts ? »** (réassort, lot R3c,
 * 2026-10-21 — `reassort-boutiques/plan-reapprovisionnement.md` §13.1
 * point 7, §13.3) — port que le fournil DÉCLARE et IMPLÉMENTE, que la
 * livraison lit pour attacher un réassort au transfert de son point et dire
 * ce qu'il contient.
 *
 * La copie FIGÉE à l'arrêt, jamais l'état vivant du commerce (objection
 * BLOQUANTE de `vitruve`) : la livraison part des `resupplyIds` du fait
 * `production.day_closed`, et lit ici le point et les lignes de chacun.
 * Même figure que `ClosedPlansReader` : `delivery → production` par ce
 * canal, `production → delivery` jamais.
 */
export abstract class FrozenResuppliesReader {
  /**
   * Les réassorts figés de cette journée parmi ces identifiants. Absent : pas
   * (ou plus — réouverture) au plan arrêté.
   */
  abstract frozenOf(
    serviceDay: string,
    resupplyIds: readonly string[],
  ): Promise<readonly FrozenResupply[]>;
}
