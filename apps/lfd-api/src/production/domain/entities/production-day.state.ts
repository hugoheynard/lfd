import type { PackingOwner } from "../value-objects/packing-owner.js";
import type { ServiceDay } from "../value-objects/service-day.value-object.js";
import * as batching from "./production-day.batches.js";
import type { ProductionDayChanges } from "./production-day.changes.js";
import type { DayPlan } from "./production-day.plan.js";
import type {
  DoneMark,
  LaunchedResupplySnapshot,
  PackedMark,
  ProducedItemSnapshot,
  ProductionBatchSnapshot,
  ProductionDaySnapshot,
  ProductionOrderSnapshot,
  ProductionResupplySnapshot,
} from "./production-day.snapshot.js";
import type { PlanSigner } from "./plan-signer.js";

/**
 * **L'état d'une journée, et ce qu'on en lit sans le changer** — la base de
 * `ProductionDay` : ses champs, ses lectures, les gardes des fournées (qui
 * refusent sans muter) et l'instantané à écrire.
 *
 * Coupée de `production-day.ts` le 2026-11-02, quand l'agrégat passait cinq
 * cents lignes : l'agrégat garde ses fabriques et ses TRANSITIONS (arrêter,
 * reprendre, rouvrir, lancer, réviser, matérialiser), la seule partie où un
 * invariant peut casser. Abstraite : on ne fabrique jamais un état sans ses
 * transitions, toute journée est une `ProductionDay`.
 */
export abstract class ProductionDayState implements batching.BatchState {
  protected constructor(
    readonly day: ServiceDay,
    protected closedAtValue: Date | null,
    protected closedByValue: PlanSigner | null,
    protected retakenValue: PackedMark | null,
    protected retakenByNameValue: string | null,
    protected packingOwnerValue: PackingOwner,
    protected planValue: DayPlan,
    protected batchesValue: readonly ProductionBatchSnapshot[],
    protected reopenedValue: PackedMark | null,
  ) {}

  /**
   * Ce que les gestes ont touché depuis la lecture — l'adaptateur n'écrit que
   * ça. Les fournées n'y figurent pas : elles ont leur port, et l'appelant
   * écrit celles que `materialize` lui rend.
   */
  get changes(): ProductionDayChanges {
    return this.planValue.changes;
  }

  get isClosed(): boolean {
    return this.closedAtValue !== null;
  }

  get closedAt(): Date | null {
    return this.closedAtValue;
  }

  /** Qui a arrêté le plan, ou `null` (ouverte, ou arrêtée avant qu'on le garde). */
  get closedBy(): PlanSigner | null {
    return this.closedByValue;
  }

  /**
   * L'arrêt en cours est celui d'un **lancement** « au plus tôt » (Q5) et non
   * d'un arrêt du plan : son instant est celui d'un lancé. Une telle journée
   * n'a jamais publié `production.day_closed` ni envoyé de dossier (Q6), et
   * sa réannonce n'en publie pas non plus. Un arrêt ultérieur (après une
   * réouverture) porte un instant neuf, et redevient un arrêt du plan.
   *
   * ⚠️ **DÉDUIT, pas stocké** : le lancement qui ouvre la journée pose
   * `closedAt` à l'instant même du lancé (`launchResupply`), et c'est cette
   * égalité qu'on relit — aucune colonne ne dit « ouverte par un lancement ».
   * Elle ne ment que si un lancement sur une journée DÉJÀ arrêtée portait au
   * milliseconde près l'instant de l'arrêt : deux requêtes distinctes dont
   * l'horloge (gelée à l'entrée) tomberait sur la même milliseconde. Le
   * stocker demanderait une colonne (migration), non faite tant que ce cas
   * reste théorique (constaté le 2026-11-03).
   */
  get openedByLaunch(): boolean {
    const closedAt = this.closedAtValue;
    return (
      closedAt !== null &&
      this.planValue.launched.some(
        (resupply) => resupply.launched.at.getTime() === closedAt.getTime(),
      )
    );
  }

  /** Le nom, figé au retirage, de qui a complété ; `null` si inconnu. */
  get retakenByName(): string | null {
    return this.retakenByNameValue;
  }

  /** Le dernier retirage, ou `null` — la fiche dit quel tirage elle montre. */
  get retaken(): PackedMark | null {
    return this.retakenValue;
  }

  /** La dernière réouverture, ou `null` : jamais rouverte. */
  get reopened(): PackedMark | null {
    return this.reopenedValue;
  }

  /** Qui colise la journée — cf. `PackingOwner`. */
  get packingOwner(): PackingOwner {
    return this.packingOwnerValue;
  }

  get orders(): readonly ProductionOrderSnapshot[] {
    return this.planValue.orders;
  }

  /** Les réassorts « pour demain » figés à l'arrêt du soir — à part des commandes, au compte quand même. */
  get resupplies(): readonly ProductionResupplySnapshot[] {
    return this.planValue.resupplies;
  }

  /** Les réassorts « au plus tôt » lancés dans la journée — à part de ceux du soir, au compte aussi. */
  get launchedResupplies(): readonly LaunchedResupplySnapshot[] {
    return this.planValue.launched;
  }

  /** Tous les réassorts au plan : ceux du soir, puis les lancés — ce que les fournées servent. */
  get plannedResupplies(): readonly ProductionResupplySnapshot[] {
    return this.planValue.planned;
  }

  /** Le **compte à produire** : un article, une quantité, commandes et réassorts confondus. */
  get counts(): readonly ProducedItemSnapshot[] {
    return this.planValue.counts;
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

  /** La ligne qu'on s'apprête à cocher, sans muter — refus : `production-day.batches.ts`. */
  itemToMark(sku: string): ProducedItemSnapshot {
    return batching.itemToMark(this, sku);
  }

  /** L'état à écrire. Les getters de l'agrégat, jamais ses champs privés. */
  toSnapshot(): ProductionDaySnapshot {
    return {
      serviceDay: this.day.value,
      closedAt: this.closedAtValue,
      closedBy: this.closedByValue,
      retaken: this.retakenValue,
      retakenByName: this.retakenByNameValue,
      packingOwner: this.packingOwnerValue,
      orders: this.orders,
      resupplies: this.resupplies,
      launchedResupplies: this.launchedResupplies,
      counts: this.counts,
      batches: this.batchesValue,
      reopened: this.reopenedValue,
    };
  }
}
