/** Un réassort à coliser, tel que la liste du fournil l'inscrit. */
export interface ResupplyToDraw {
  readonly serviceDay: string;
  readonly resupplyId: string;
  readonly siteId: string;
  readonly siteLabel: string | null;
  /** Le nom du réassort (R1g) ; `null` : sans nom. */
  readonly name: string | null;
  readonly drawnAt: Date;
  /** Additionnées par article : une ligne par SKU. */
  readonly lines: readonly {
    readonly sku: string;
    readonly productName: string;
    readonly quantity: number;
  }[];
}

/**
 * **La liste des fiches de réassort, projetée des faits du fournil**
 * (réassort, lot R3b). Des écritures ciblées, et c'est le cas que le §3.1 du
 * `CLAUDE.md` autorise : des projections de faits durables, sans règle qui
 * puisse les refuser — même figure que `PackingShadowLedger.drawOrder` et
 * `PackingListWithdrawal`.
 */
export abstract class PackingResupplyListing {
  /** Inscrit la fiche et ses lignes si elles n'y sont pas ; ne réécrit jamais. */
  abstract draw(resupply: ResupplyToDraw): Promise<void>;

  /**
   * Retire de la journée les fiches de `resupplyIds` que personne n'a
   * entamées — aucune ligne saisie, pas close. Une fiche entamée reste : le
   * fournil a refusé la réouverture si le colisage avait commencé.
   *
   * @returns le nombre de fiches retirées ; zéro sur un rejeu.
   */
  abstract withdrawUntouched(serviceDay: string, resupplyIds: readonly string[]): Promise<number>;
}
