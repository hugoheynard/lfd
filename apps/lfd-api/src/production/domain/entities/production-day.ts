import type { ProducibleOrder } from "../../channels/commerce/day-orders.reader.js";
import type { PlacedResupply } from "../../channels/commerce/day-resupplies.reader.js";
import {
  ProductionDayAlreadyClosedError,
  ProductionDayEmptyError,
  ProductionDayNotClosedError,
} from "../errors/production-errors.js";
import {
  absorbArrivals,
  countOf,
  floorCounts,
  freezeOrder,
  freezeResupply,
} from "../services/production-count.js";
import {
  LEGACY_PACKING_OWNER,
  PACKING_PACKING_OWNER,
  type PackingOwner,
} from "../value-objects/packing-owner.js";
import { ServiceDay } from "../value-objects/service-day.value-object.js";
import * as batching from "./production-day.batches.js";
import {
  assertNotLaunched,
  assertNothingElseToFreeze,
  launchedOf,
  type PendingPlan,
  type ResupplyLaunchGesture,
} from "./production-day.launch.js";
import { assertReopenable, type DownstreamProgress } from "./production-day.reopening.js";
import { type RaisedLine, type RevisedLine, revisedPlanOf } from "./production-day.revision.js";
import type {
  DoneMark,
  LaunchedResupplySnapshot,
  PackedMark,
  ProductionBatchSnapshot,
  ProducedItemSnapshot,
  ProductionDaySnapshot,
  ProductionOrderSnapshot,
  ProductionResupplySnapshot,
} from "./production-day.snapshot.js";
import { type PlanSigner, staffSigner } from "./plan-signer.js";

// La forme de la journée vit à côté ; réexportée : l'agrégat reste le point d'entrée.
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
 * 2. **Une journée sans commande ni réassort ne s'arrête pas** (réassorts :
 *    lot R3a, 2026-10-21). Fermer le vide écrirait un
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
    private closedByValue: PlanSigner | null,
    private retakenValue: PackedMark | null,
    private retakenByNameValue: string | null,
    private packingOwnerValue: PackingOwner,
    private ordersValue: readonly ProductionOrderSnapshot[],
    private countsValue: readonly ProducedItemSnapshot[],
    private batchesValue: readonly ProductionBatchSnapshot[],
    private reopenedValue: PackedMark | null = null,
    private resuppliesValue: readonly ProductionResupplySnapshot[] = [],
    private launchedValue: readonly LaunchedResupplySnapshot[] = [],
  ) {}

  /**
   * Une journée qu'on n'a jamais arrêtée. C'est l'état de départ, et le seul
   * qu'on puisse fabriquer sans lire la base.
   */
  static open(day: ServiceDay): ProductionDay {
    return new ProductionDay(day, null, null, null, null, LEGACY_PACKING_OWNER, [], [], []);
  }

  /** Rehydrate depuis l'adaptateur. Les value objects revalident au passage. */
  static fromSnapshot(snapshot: ProductionDaySnapshot): ProductionDay {
    return new ProductionDay(
      ServiceDay.of(snapshot.serviceDay),
      snapshot.closedAt,
      snapshot.closedBy,
      snapshot.retaken,
      snapshot.retakenByName,
      snapshot.packingOwner,
      snapshot.orders,
      snapshot.counts,
      snapshot.batches,
      snapshot.reopened ?? null,
      snapshot.resupplies ?? [],
      snapshot.launchedResupplies ?? [],
    );
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
    return this.ordersValue;
  }

  /** Les réassorts figés à l'arrêt (lot R3a) — à part des commandes, au compte quand même. */
  get resupplies(): readonly ProductionResupplySnapshot[] {
    return this.resuppliesValue;
  }

  /** Les réassorts « au plus tôt » lancés (R4a) — à part de ceux du soir, au compte aussi. */
  get launchedResupplies(): readonly LaunchedResupplySnapshot[] {
    return this.launchedValue;
  }

  /** Tous les réassorts au plan : ceux du soir, puis les lancés — ce que les fournées servent. */
  get plannedResupplies(): readonly ProductionResupplySnapshot[] {
    return [...this.resuppliesValue, ...this.launchedValue];
  }

  /** Le **compte à produire** : un article, une quantité, commandes et réassorts confondus. */
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
   * @param withdrawn les commandes RETIRÉES par une annulation staff (doc
   *   `documentation/commandes/annulation/annulation-par-le-staff.md`, C3.4) : l'appelant les lit sous
   *   le verrou, l'agrégat les écarte. Les commandes du commerce sont lues
   *   avant le verrou ; une annulation validée entre les deux y figure encore.
   * @param by qui arrête — `null` quand on ne le sait pas (un semis) : le
   *   dossier dit alors « Arrêté le … », sans inventer d'auteur.
   * @throws {ProductionDayAlreadyClosedError} elle l'est déjà — cf. l'en-tête.
   * @param resupplies les réassorts « pour demain » envoyés et non annulés
   *   (lot R3a), lus par l'appelant SOUS le verrou : ils sont figés à part
   *   des commandes, et leurs lignes entrent au compte à produire.
   * @throws {ProductionDayEmptyError} rien à produire ce jour-là, retraits ôtés
   *   — ni commande, ni réassort.
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
    const kept = withoutWithdrawn(orders, withdrawn);
    // Un réassort lancé avant une réouverture (R4a) survit : il suffit au plan.
    if (kept.length === 0 && resupplies.length === 0 && this.launchedValue.length === 0) {
      throw new ProductionDayEmptyError(this.day.value);
    }
    this.ordersValue = kept.map(freezeOrder);
    this.resuppliesValue = resupplies.map(freezeResupply);
    this.countsValue = countOf([...kept, ...this.plannedResupplies]);
    this.closedAtValue = at;
    this.closedByValue = by;
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
   * Les commandes `withdrawn` (annulées par l'équipe, C3.4) ne sont pas
   * absorbées — même règle et même raison qu'à la clôture.
   *
   * @returns le nombre de commandes réellement absorbées. Zéro = rien n'était
   *   arrivé, et c'est une information, pas une erreur.
   * @throws {ProductionDayNotClosedError} il n'y a pas de tirage à reprendre.
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
    const kept = withoutWithdrawn(orders, withdrawn);
    const absorbed = absorbArrivals(this.ordersValue, kept);
    if (absorbed.count === 0) {
      return 0;
    }
    this.ordersValue = absorbed.orders;
    this.recount();
    this.retakenValue = { at, by };
    this.retakenByNameValue = byName;
    return absorbed.count;
  }

  /**
   * **Rouvre la journée** (Hugo, 2026-10-14) : l'arrêt est défait, le plan
   * effacé (commandes, réassorts du soir — lot R3a —, compte, retirage), et la trace
   * `reopened` posée. Les réassorts dégelés redeviennent annulables au
   * commerce : la journée n'est plus arrêtée. L'appelant lit
   * {@link resupplies} AVANT pour les nommer dans le fait. Les
   * fournées annulées restent : elles sont l'historique du four, pas du plan.
   * Les réassorts LANCÉS restent aussi (R4a, S4 de `vitruve`) : le comptoir
   * ne peut plus les annuler, et le ré-arrêt les remet au compte.
   * Le prochain arrêt refait un instantané neuf, avec un nouvel instant.
   *
   * @returns les commandes que le plan portait, pour le fait et le journal.
   * @throws {ProductionDayNotClosedError} rien n'est arrêté.
   * @throws les refus d'`assertReopenable` : quelque chose a commencé.
   */
  reopen(progress: DownstreamProgress, at: Date, by: string): readonly string[] {
    if (!this.isClosed) {
      throw new ProductionDayNotClosedError(this.day.value);
    }
    assertReopenable(this.day.value, this.countsValue, this.batchesValue, progress);
    const released = this.ordersValue.map((order) => order.orderId);
    this.closedAtValue = null;
    this.closedByValue = null;
    this.retakenValue = null;
    this.retakenByNameValue = null;
    this.ordersValue = [];
    this.resuppliesValue = [];
    this.countsValue = [];
    this.reopenedValue = { at, by };
    return released;
  }

  /**
   * **Lance un réassort « au plus tôt »** (R4a, `reassort-boutiques/plan-au-plus-tot.md`
   * §2) : un geste à part du retirage, qui n'absorbe que des commandes. Le
   * réassort, lu par l'appelant SOUS le verrou de la journée, entre au plan
   * à part de ceux du soir, et ses lignes au compte (décision B). Le compte se
   * refait par la même fonction que l'arrêt — l'appelant a matérialisé les
   * coches héritées avant ({@link materialize}).
   *
   * Sur une journée qui n'est pas arrêtée (Q5), le lancement l'ARRÊTE avec ce
   * seul réassort, signé de qui lance — à condition qu'il n'y ait rien
   * d'autre à figer (`pending`, lu par l'appelant).
   *
   * @returns `true` si la journée vient d'être arrêtée par ce lancement.
   * @throws {ResupplyAlreadyLaunchedError} @throws {ResupplyLaunchOnUnarrestedPlanError}
   */
  launchResupply(
    resupply: PlacedResupply,
    gesture: ResupplyLaunchGesture,
    pending: PendingPlan,
  ): boolean {
    assertNotLaunched(this.day.value, this.launchedValue, resupply.resupplyId);
    const opening = !this.isClosed;
    if (opening) {
      assertNothingElseToFreeze(this.day.value, pending);
    }
    this.launchedValue = [...this.launchedValue, launchedOf(resupply, gesture)];
    this.recount();
    if (opening) {
      this.closedAtValue = gesture.at;
      this.closedByValue = staffSigner(gesture.staffUserId, gesture.name);
      this.packingOwnerValue = PACKING_PACKING_OWNER;
    }
    return opening;
  }

  /**
   * **Révise le dû d'une commande inscrite** (plan A2,
   * `documentation/commandes/modification/plan-a2-modifier-une-commande-inscrite.md`,
   * § 7, B3) : ses lignes disent la quantité révisée, dans les deux sens ; le
   * compte du jour ne baisse jamais ({@link recount}). L'appelant a
   * matérialisé les coches héritées avant ({@link materialize}), sous le
   * verrou de la journée.
   *
   * @returns les lignes montées — vide si rien n'a monté (une baisse, ou rien).
   * @throws {ProductionDayNotClosedError} rien n'est arrêté : rien n'est inscrit.
   * @throws les refus de `revisedPlanOf` : commande absente, articles changés.
   */
  reviseOrder(orderId: string, lines: readonly RevisedLine[]): readonly RaisedLine[] {
    if (!this.isClosed) {
      throw new ProductionDayNotClosedError(this.day.value);
    }
    const revised = revisedPlanOf(this.day.value, this.ordersValue, orderId, lines);
    this.ordersValue = revised.orders;
    this.recount();
    return revised.raised;
  }

  /**
   * **Le compte d'une journée arrêtée, refait** — la méthode unique du
   * retirage, du lancement d'un réassort et de la révision (plan A2, § 7,
   * B3) : toutes les commandes et tous les réassorts au plan, sans qu'aucun
   * article ne descende sous ce qui a déjà été demandé au four. L'arrêt, lui,
   * part d'un compte vide et passe par `countOf` seul.
   */
  private recount(): void {
    this.countsValue = floorCounts(
      this.countsValue,
      countOf([...this.ordersValue, ...this.plannedResupplies]),
    );
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
      orders: this.ordersValue,
      resupplies: this.resuppliesValue,
      launchedResupplies: this.launchedValue,
      counts: this.countsValue,
      batches: this.batchesValue,
      reopened: this.reopenedValue,
    };
  }
}

/**
 * Les commandes du commerce, moins celles que l'équipe a retirées — la règle
 * d'écartement, écrite une fois pour la clôture et le retirage.
 */
function withoutWithdrawn(
  orders: readonly ProducibleOrder[],
  withdrawn: ReadonlySet<string>,
): readonly ProducibleOrder[] {
  return orders.filter((order) => !withdrawn.has(order.orderId));
}
