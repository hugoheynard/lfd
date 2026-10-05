import type { ProducibleOrder } from "../../channels/commerce/day-orders.reader.js";
import {
  ProductionDayAlreadyClosedError,
  ProductionDayEmptyError,
  ProductionDayNotClosedError,
} from "../errors/production-errors.js";
import { absorbArrivals, countOf, freezeOrder } from "../services/production-count.js";
import {
  LEGACY_PACKING_OWNER,
  PACKING_PACKING_OWNER,
  type PackingOwner,
} from "../value-objects/packing-owner.js";
import { ServiceDay } from "../value-objects/service-day.value-object.js";
import * as batching from "./production-day.batches.js";
import type {
  DoneMark,
  PackedMark,
  ProductionBatchSnapshot,
  ProducedItemSnapshot,
  ProductionDaySnapshot,
  ProductionOrderSnapshot,
} from "./production-day.snapshot.js";

// La forme de la journée vit à côté ; réexportée : l'agrégat reste le point d'entrée.
export type {
  DoneMark,
  ProductionBatchSnapshot,
  PackedMark,
  ProducedItemSnapshot,
  ProductionDaySnapshot,
  ProductionLineSnapshot,
  ProductionOrderSnapshot,
} from "./production-day.snapshot.js";

/**
 * **Une journée de fabrication** — l'agrégat de la production.
 *
 * ## Pourquoi un agrégat, et pas un CRUD
 *
 * La question de tri du `CLAUDE.md` est « existe-t-il une règle qui peut REFUSER
 * cette écriture ? ». Ici il y en a deux, et elles coûtent cher si on les rate :
 *
 * 1. **Une journée arrêtée ne se recalcule pas.** Le compte à produire est un
 *    instantané pris à la clôture ; les commandes bougent après. Le refaire
 *    donnerait un autre nombre que celui sur lequel le fournil a lancé ses
 *    fournées — et c'est le seul document de tout ce dossier qui ne se
 *    refabrique pas.
 * 2. **Une journée sans commande ne s'arrête pas.** Fermer le vide écrirait un
 *    fait — « ce jour-là on a produit ceci » — là où il n'y a rien eu, et le
 *    compte à produire du lendemain hériterait d'un zéro qu'on croirait mesuré.
 *
 * ## Ce que l'agrégat CONTIENT
 *
 * Les commandes et leurs lignes sont **dedans**, pas à côté : elles n'ont aucun
 * cycle de vie propre, elles naissent et meurent avec la journée. Il n'y a donc
 * ni `ProductionOrderRepository` ni règle qui leur soit propre — les sortir
 * ferait trois agrégats là où l'invariant est un.
 *
 * ## Ce qu'il ne contient PAS
 *
 * **Aucun montant.** Le fournil fabrique, il ne facture pas. L'absence est
 * portée par les types de bout en bout : `ProducibleLine` n'a pas de champ de
 * prix, donc il n'y a rien à laisser vide et rien à remplir par distraction.
 */
export class ProductionDay {
  private constructor(
    readonly day: ServiceDay,
    private closedAtValue: Date | null,
    private retakenValue: PackedMark | null,
    private packingOwnerValue: PackingOwner,
    private ordersValue: readonly ProductionOrderSnapshot[],
    private countsValue: readonly ProducedItemSnapshot[],
    private batchesValue: readonly ProductionBatchSnapshot[],
  ) {}

  /**
   * Une journée qu'on n'a jamais arrêtée. C'est l'état de départ, et le seul
   * qu'on puisse fabriquer sans lire la base.
   */
  static open(day: ServiceDay): ProductionDay {
    return new ProductionDay(day, null, null, LEGACY_PACKING_OWNER, [], [], []);
  }

  /** Rehydrate depuis l'adaptateur. Les value objects revalident au passage. */
  static fromSnapshot(snapshot: ProductionDaySnapshot): ProductionDay {
    return new ProductionDay(
      ServiceDay.of(snapshot.serviceDay),
      snapshot.closedAt,
      snapshot.retaken,
      snapshot.packingOwner,
      snapshot.orders,
      snapshot.counts,
      snapshot.batches,
    );
  }

  get isClosed(): boolean {
    return this.closedAtValue !== null;
  }

  get closedAt(): Date | null {
    return this.closedAtValue;
  }

  /** Le dernier retirage, ou `null` — la fiche dit quel tirage elle montre. */
  get retaken(): PackedMark | null {
    return this.retakenValue;
  }

  /** Qui colise la journée — cf. `PackingOwner`. */
  get packingOwner(): PackingOwner {
    return this.packingOwnerValue;
  }

  get orders(): readonly ProductionOrderSnapshot[] {
    return this.ordersValue;
  }

  /** Le **compte à produire** : un article, une quantité, tous clients confondus. */
  get counts(): readonly ProducedItemSnapshot[] {
    return this.countsValue;
  }

  /** Les fournées du jour, annulées comprises — sans les implicites (§5.2). */
  get batches(): readonly ProductionBatchSnapshot[] {
    return this.batchesValue;
  }

  /** Sorti du four pour ce SKU, coches héritées comprises. Cf. `production-day.batches.ts`. */
  producedOf(sku: string): number {
    return batching.producedOf(this, sku);
  }

  /** La fournée à déclarer, sans muter — refus : `production-day.batches.ts`. */
  batchToRecord(
    id: string,
    sku: string,
    quantity: number,
    recorded: DoneMark,
  ): ProductionBatchSnapshot {
    return batching.batchToRecord(this, id, sku, quantity, recorded);
  }

  /** Rejeu ou conflit d'une déclaration (D3) — cf. `assertSameCharge`. */
  acknowledge(
    requested: ProductionBatchSnapshot,
    storedDay: string,
    stored: ProductionBatchSnapshot,
  ): void {
    batching.assertSameCharge(this.day.value, requested, storedDay, stored);
  }

  /** L'ancien « cocher » : le reste de la ligne, ou `null` si complète (D3). */
  batchToComplete(sku: string, recorded: DoneMark): ProductionBatchSnapshot | null {
    return batching.batchToComplete(this, this.itemToMark(sku), recorded);
  }

  /** Garde de l'annulation, sans muter — refus : `production-day.batches.ts`. */
  batchToCancel(id: string): ProductionBatchSnapshot | null {
    return batching.batchToCancel(this, id);
  }

  /** L'ancien « décocher » : toutes les fournées de la ligne, sans muter (D3). */
  batchesToUncheck(sku: string): readonly ProductionBatchSnapshot[] {
    this.itemToMark(sku);
    return batching.batchesToUncheck(this, sku);
  }

  /**
   * **Matérialise** les coches héritées (§5.3) et les rend pour que l'appelant
   * les écrive — raisons : `inheritedBatchesOf`, `production-day.batches.ts`.
   */
  materialize(sku?: string): readonly ProductionBatchSnapshot[] {
    const inherited = batching.inheritedBatchesOf(this, sku);
    this.batchesValue = [...this.batchesValue, ...inherited];
    return inherited;
  }

  /**
   * **Arrête la journée** : fige les commandes et calcule le compte à produire.
   *
   * L'instant vient du port d'horloge, jamais du mur — deux clôtures de la même
   * journée doivent porter le même instant que ce que le journal en dira.
   *
   * Depuis K2, la journée naît au COLISAGE (`packing`, §13 B1) — sans
   * interrupteur, décision de Hugo du 2026-10-04. Une journée `legacy` ne naît
   * plus : elle ne se relit que depuis la base (`fromSnapshot`).
   *
   * @throws {ProductionDayAlreadyClosedError} elle l'est déjà — cf. l'en-tête.
   * @throws {ProductionDayEmptyError} rien à produire ce jour-là.
   */
  close(orders: readonly ProducibleOrder[], at: Date): void {
    if (this.isClosed) {
      throw new ProductionDayAlreadyClosedError(this.day.value);
    }
    if (orders.length === 0) {
      throw new ProductionDayEmptyError(this.day.value);
    }
    this.ordersValue = orders.map(freezeOrder);
    this.countsValue = countOf(orders);
    this.closedAtValue = at;
    // Écrit ici et nulle part ailleurs (colisage, §13, B1) : la journée garde
    // le propriétaire qu'elle a reçu en s'arrêtant.
    this.packingOwnerValue = PACKING_PACKING_OWNER;
  }

  /** La ligne qu'on s'apprête à cocher, sans muter — refus : `production-day.batches.ts`. */
  itemToMark(sku: string): ProducedItemSnapshot {
    return batching.itemToMark(this, sku);
  }

  /**
   * **Le retirage** : absorber ce qui est arrivé depuis que le plan est arrêté.
   *
   * Il ne contredit pas l'invariant de l'en-tête : c'est un recalcul ATTESTÉ,
   * signé par `retakenBy` — la raison complète est au-dessus d'`absorbArrivals`.
   *
   * Ce qu'il absorbe exactement — par `orderId` — est calculé par
   * `absorbArrivals` dans `services/production-count.ts`. Il ne recopie plus
   * les coches héritées : l'appelant les a matérialisées ({@link materialize})
   * AVANT, sous le verrou de la journée, et les fournées ne dépendent pas du
   * compte (§5.3–5.4 des fournées).
   *
   * @returns le nombre de commandes réellement absorbées. Zéro = rien n'était
   *   arrivé, et c'est une information, pas une erreur.
   * @throws {ProductionDayNotClosedError} il n'y a pas de tirage à reprendre.
   */
  retake(orders: readonly ProducibleOrder[], at: Date, by: string): number {
    if (!this.isClosed) {
      throw new ProductionDayNotClosedError(this.day.value);
    }
    const absorbed = absorbArrivals(this.ordersValue, this.countsValue, orders);
    if (absorbed.count === 0) {
      return 0;
    }
    this.ordersValue = absorbed.orders;
    this.countsValue = absorbed.counts;
    this.retakenValue = { at, by };
    return absorbed.count;
  }

  /** L'état à écrire. Les getters de l'agrégat, jamais ses champs privés. */
  toSnapshot(): ProductionDaySnapshot {
    return {
      serviceDay: this.day.value,
      closedAt: this.closedAtValue,
      retaken: this.retakenValue,
      packingOwner: this.packingOwnerValue,
      orders: this.ordersValue,
      counts: this.countsValue,
      batches: this.batchesValue,
    };
  }
}
