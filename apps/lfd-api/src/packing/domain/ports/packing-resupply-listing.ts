import type { SaleUnit } from "@lfd/money";

import type { PackingResupplyKind } from "../entities/packing-resupply.js";

/** Un réassort à coliser, tel que la liste du fournil l'inscrit. */
export interface ResupplyToDraw {
  readonly serviceDay: string;
  readonly resupplyId: string;
  readonly siteId: string;
  readonly siteLabel: string | null;
  /** Le nom du réassort (R1g) ; `null` : sans nom. */
  readonly name: string | null;
  /** `evening` : figé à l'arrêt ; `asap` : lancé dans la journée (la réserve du « au plus tôt », R4b). */
  readonly kind: PackingResupplyKind;
  readonly drawnAt: Date;
  /** Additionnées par article : une ligne par SKU. */
  readonly lines: readonly {
    readonly sku: string;
    readonly productName: string;
    /** Des pièces, ou des grammes si `saleUnit = "weight"`. */
    readonly quantity: number;
    /** L'unité figée par le fournil (L2b-3). */
    readonly saleUnit: SaleUnit;
  }[];
}

/**
 * **La liste des fiches de réassort, projetée des faits du fournil**
 * (réassort, la fiche au colisage, R3b). Des écritures ciblées, et c'est le cas que le §3.1 du
 * `CLAUDE.md` autorise : des projections de faits durables, sans règle qui
 * puisse les refuser — même figure que `PackingShadowLedger.drawOrder` et
 * `PackingListWithdrawal`.
 */
export abstract class PackingResupplyListing {
  /**
   * Inscrit la fiche et ses lignes si elles n'y sont pas ; ne réécrit jamais
   * une fiche vivante. Une fiche RETIRÉE par une réouverture est rétablie :
   * le nouvel arrêt refige le même réassort.
   */
  abstract draw(resupply: ResupplyToDraw): Promise<void>;

  /**
   * Retire de la journée les fiches DU SOIR de `resupplyIds` que personne n'a
   * entamées — aucune ligne saisie, pas close. Une fiche entamée reste : le
   * fournil a refusé la réouverture si le colisage avait commencé. Une fiche
   * « au plus tôt » reste toujours : le réassort lancé survit à la
   * réouverture du plan, et sa réservation avec.
   *
   * Retirer est un STATUT posé à `at`, pas un effacement (2026-11-02) : la
   * fiche est un agrégat que le poste, l'avancement et la réception lisent.
   *
   * @returns le nombre de fiches retirées ; zéro sur un rejeu.
   */
  abstract withdrawUntouched(
    serviceDay: string,
    resupplyIds: readonly string[],
    at: Date,
  ): Promise<number>;
}
