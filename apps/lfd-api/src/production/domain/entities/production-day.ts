import type { ProducibleOrder } from "../../channels/commerce/day-orders.reader.js";
import type { PlacedResupply } from "../../channels/commerce/day-resupplies.reader.js";
import {
  ProductionDayAlreadyClosedError,
  ProductionDayEmptyError,
  ProductionDayNotClosedError,
} from "../errors/production-errors.js";
import { LEGACY_PACKING_OWNER, PACKING_PACKING_OWNER } from "../value-objects/packing-owner.js";
import { ServiceDay } from "../value-objects/service-day.value-object.js";
import * as batching from "./production-day.batches.js";
import { ProductionDayState } from "./production-day.state.js";
import { type ProductionDayChanges, UNCHANGED_DAY, WHOLE_DAY } from "./production-day.changes.js";
import {
  assertNotReopened,
  assertNotLaunched,
  assertNothingElseToFreeze,
  launchedOf,
  type PendingPlan,
  type ResupplyLaunchGesture,
} from "./production-day.launch.js";
import { assertReopenable, type DownstreamProgress } from "./production-day.reopening.js";
import { DayPlan, withoutWithdrawn } from "./production-day.plan.js";
import type { RaisedLine, RevisedLine } from "./production-day.revision.js";
import type { ProductionBatchSnapshot, ProductionDaySnapshot } from "./production-day.snapshot.js";
import { type PlanSigner, staffSigner } from "./plan-signer.js";

// La forme de la journée vit à côté ; réexportée : l'agrégat reste le point d'entrée.
export type { ProductionDayChanges } from "./production-day.changes.js";
export type { DownstreamProgress } from "./production-day.reopening.js";
export type { RaisedLine, RevisedLine } from "./production-day.revision.js";
export {
  NOTHING_PENDING,
  type PendingPlan,
  type ResupplyLaunchGesture,
} from "./production-day.launch.js";
export type {
  DoneMark,
  LaunchedResupplySnapshot,
  ProductionBatchSnapshot,
  PackedMark,
  ProducedItemSnapshot,
  ProductionDaySnapshot,
  ProductionLineSnapshot,
  ProductionOrderSnapshot,
  ProductionResupplySnapshot,
} from "./production-day.snapshot.js";

/**
 * **Une journée de fabrication** — l'agrégat de la production. Deux refus le
 * justifient : une journée arrêtée ne se recalcule pas, une journée vide ne
 * s'arrête pas. Le calcul du plan vit dans {@link DayPlan} ; l'agrégat garde le
 * cycle et les refus. Pourquoi, et ce qu'il ne contient pas :
 * `documentation/fournil/architecture-contexte-production.md`, « La journée, un
 * agrégat ».
 */
export class ProductionDay extends ProductionDayState {
  /**
   * Une journée qu'on n'a jamais arrêtée. C'est l'état de départ, et le seul
   * qu'on puisse fabriquer sans lire la base ; rien n'en est écrit, donc rien
   * n'a changé ({@link changes}).
   */
  static open(day: ServiceDay): ProductionDay {
    const plan = DayPlan.of(DayPlan.EMPTY);
    return new ProductionDay(day, null, null, null, null, LEGACY_PACKING_OWNER, plan, [], null);
  }

  /**
   * Rehydrate une journée relue en base par l'adaptateur lui-même : rien n'a
   * changé depuis, et `save` n'écrira que ce que les gestes suivants touchent.
   */
  static restore(snapshot: ProductionDaySnapshot): ProductionDay {
    return ProductionDay.rehydrate(snapshot, UNCHANGED_DAY);
  }

  /**
   * Rehydrate un état dont la base n'est pas connue (une lecture composée, un
   * semis) : `save` l'écrira EN ENTIER. Les value objects revalident au passage.
   */
  static fromSnapshot(snapshot: ProductionDaySnapshot): ProductionDay {
    return ProductionDay.rehydrate(snapshot, WHOLE_DAY);
  }

  private static rehydrate(
    snapshot: ProductionDaySnapshot,
    changes: ProductionDayChanges,
  ): ProductionDay {
    const plan = DayPlan.of({
      orders: snapshot.orders,
      resupplies: snapshot.resupplies ?? [],
      launched: snapshot.launchedResupplies ?? [],
      counts: snapshot.counts,
      changes,
    });
    return new ProductionDay(
      ServiceDay.of(snapshot.serviceDay),
      snapshot.closedAt,
      snapshot.closedBy,
      snapshot.retaken,
      snapshot.retakenByName,
      snapshot.packingOwner,
      plan,
      snapshot.batches,
      snapshot.reopened ?? null,
    );
  }

  /**
   * **Matérialise** les coches héritées (§5.3) et les rend pour que l'appelant
   * les écrive — raisons : `inheritedBatchesOf`, `production-day.batches.ts`.
   *
   * Ne marque PAS {@link changes}, et c'est voulu : `changes` ne décrit que
   * ce que `ProductionDayRepository.save` écrit, et les fournées ont leur port
   * (`ProductionBatchRepository.recordInherited`). L'appelant écrit donc
   * lui-même ce qui est rendu ici, dans la même unité de travail. Ce que le
   * domaine impose : un geste qui refait le compte refuse une coche héritée
   * encore vivante, non matérialisée (`assertChecksCarried`) — le compte
   * réécrit l'effacerait. Qu'elle soit ensuite ÉCRITE reste à l'appelant.
   */
  materialize(sku?: string): readonly ProductionBatchSnapshot[] {
    const inherited = batching.inheritedBatchesOf(this, sku);
    this.batchesValue = [...this.batchesValue, ...inherited];
    return inherited;
  }

  /**
   * **Arrête la journée** : fige les commandes et calcule le compte à produire.
   * Elle naît au colisage (`packing`) — décision de Hugo du 2026-10-04 ; une
   * journée `legacy` ne se relit que depuis la base.
   *
   * @param orders les commandes du commerce, lues par l'appelant SOUS le verrou.
   * @param withdrawn les commandes retirées par une annulation staff
   *   (`documentation/commandes/annulation/annulation-par-le-staff.md`), lues
   *   sous le même verrou : l'agrégat les écarte.
   * @param at l'instant du port d'horloge, celui que le journal dira.
   * @param by qui arrête — `null` quand on ne le sait pas (un semis) : le
   *   dossier dit alors « Arrêté le … », sans inventer d'auteur.
   * @param resupplies les réassorts « pour demain » envoyés et non annulés,
   *   lus sous le verrou : figés à part des commandes, comptés au plan.
   * @throws {ProductionDayAlreadyClosedError} elle l'est déjà — cf. l'en-tête.
   * @throws {ProductionDayEmptyError} rien à produire, retraits ôtés : ni
   *   commande, ni réassort du soir, ni réassort lancé gardé d'une réouverture
   *   (celui-là suffit au plan).
   */
  close(
    orders: readonly ProducibleOrder[],
    withdrawn: ReadonlySet<string>,
    at: Date,
    by: PlanSigner | null,
    resupplies: readonly PlacedResupply[] = [],
  ): void {
    if (this.isClosed) {
      throw new ProductionDayAlreadyClosedError(this.day.value);
    }
    batching.assertChecksCarried(this);
    const kept = withoutWithdrawn(orders, withdrawn);
    if (this.planValue.isEmptyWith(kept, resupplies)) {
      throw new ProductionDayEmptyError(this.day.value);
    }
    this.planValue = this.planValue.frozen(kept, resupplies);
    this.closedAtValue = at;
    this.closedByValue = by;
    this.packingOwnerValue = PACKING_PACKING_OWNER;
  }

  /**
   * **Le retirage** : absorber ce qui est arrivé depuis que le plan est arrêté.
   *
   * Il ne contredit pas l'invariant de l'en-tête : c'est un recalcul ATTESTÉ,
   * signé par `by` — la raison complète est au-dessus d'`absorbArrivals`.
   * L'appelant a matérialisé les coches héritées ({@link materialize}) AVANT,
   * sous le verrou de la journée. Les commandes `withdrawn` ne sont pas
   * absorbées — même règle qu'à l'arrêt.
   *
   * @returns le nombre de commandes absorbées. Zéro = rien n'était arrivé,
   *   et c'est une information, pas une erreur : rien ne change.
   * @throws {ProductionDayNotClosedError} il n'y a pas de tirage à reprendre.
   * @throws {UncarriedInheritedChecksError} une coche héritée non matérialisée.
   */
  retake(
    orders: readonly ProducibleOrder[],
    withdrawn: ReadonlySet<string>,
    at: Date,
    by: string,
    byName: string | null,
  ): number {
    if (!this.isClosed) {
      throw new ProductionDayNotClosedError(this.day.value);
    }
    batching.assertChecksCarried(this);
    const { plan, count } = this.planValue.absorbed(withoutWithdrawn(orders, withdrawn));
    if (count === 0) {
      return 0;
    }
    this.planValue = plan;
    this.retakenValue = { at, by };
    this.retakenByNameValue = byName;
    return count;
  }

  /**
   * **Rouvre la journée** (Hugo, 2026-10-14) : l'arrêt est défait, le plan du
   * soir effacé (commandes, réassorts « pour demain », compte, retirage), et
   * la trace `reopened` posée. L'appelant lit {@link resupplies} AVANT pour
   * les nommer dans le fait. Restent : les fournées annulées (l'historique du
   * four) et les réassorts LANCÉS — le comptoir ne peut plus les annuler, le
   * prochain arrêt les remet au compte.
   *
   * @returns les commandes que le plan portait, pour le fait et le journal.
   * @throws {ProductionDayNotClosedError} rien n'est arrêté.
   * @throws les refus d'`assertReopenable` : quelque chose a commencé.
   */
  reopen(progress: DownstreamProgress, at: Date, by: string): readonly string[] {
    if (!this.isClosed) {
      throw new ProductionDayNotClosedError(this.day.value);
    }
    assertReopenable(this.day.value, this.counts, this.batchesValue, progress);
    const released = this.orders.map((order) => order.orderId);
    this.closedAtValue = null;
    this.closedByValue = null;
    this.retakenValue = null;
    this.retakenByNameValue = null;
    this.planValue = this.planValue.cleared();
    this.reopenedValue = { at, by };
    return released;
  }

  /**
   * **Lance un réassort « au plus tôt »** (`reassort-boutiques/au-plus-tot.md`) :
   * le réassort, lu par l'appelant SOUS le verrou, entre au plan à part de
   * ceux du soir, et ses lignes au compte. L'appelant a matérialisé les
   * coches héritées avant ({@link materialize}).
   *
   * Sur une journée JAMAIS arrêtée (Q5), le lancement l'ARRÊTE avec ce seul
   * réassort, signé de qui lance — s'il n'y a rien d'autre à figer
   * (`pending`). Une journée rouverte ne s'ouvre pas ainsi (D1).
   *
   * @returns `true` si la journée vient d'être arrêtée par ce lancement.
   * @throws {ResupplyAlreadyLaunchedError} @throws {ResupplyLaunchOnUnarrestedPlanError}
   * @throws {ResupplyLaunchOnReopenedPlanError}
   */
  launchResupply(
    resupply: PlacedResupply,
    gesture: ResupplyLaunchGesture,
    pending: PendingPlan,
  ): boolean {
    assertNotLaunched(this.day.value, this.planValue.launched, resupply.resupplyId);
    batching.assertChecksCarried(this);
    const opening = !this.isClosed;
    if (opening) {
      assertNotReopened(this.day.value, this.reopenedValue);
      assertNothingElseToFreeze(this.day.value, pending);
    }
    this.planValue = this.planValue.withLaunched(launchedOf(resupply, gesture));
    if (opening) {
      this.closedAtValue = gesture.at;
      this.closedByValue = staffSigner(gesture.staffUserId, gesture.name);
      this.packingOwnerValue = PACKING_PACKING_OWNER;
    }
    return opening;
  }

  /**
   * **Révise le dû d'une commande inscrite**
   * (`documentation/commandes/modification/plan-a2-modifier-une-commande-inscrite.md`,
   * § 7) : ses lignes disent la quantité révisée, dans les deux sens ; le
   * compte du jour ne baisse jamais. L'appelant a matérialisé les coches
   * héritées avant ({@link materialize}), sous le verrou de la journée.
   *
   * @returns les lignes montées — vide si rien n'a monté (une baisse, ou rien).
   * @throws {ProductionDayNotClosedError} rien n'est arrêté : rien n'est inscrit.
   * @throws les refus de `revisedPlanOf` : commande absente, articles changés.
   */
  reviseOrder(orderId: string, lines: readonly RevisedLine[]): readonly RaisedLine[] {
    if (!this.isClosed) {
      throw new ProductionDayNotClosedError(this.day.value);
    }
    batching.assertChecksCarried(this);
    const { plan, raised } = this.planValue.revised(this.day.value, orderId, lines);
    this.planValue = plan;
    return raised;
  }
}
