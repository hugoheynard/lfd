import type { ProducibleOrder } from "../../channels/commerce/day-orders.reader.js";
import {
  OrderAlreadyPackedError,
  ProducedItemNotFoundError,
  ProductionDayAlreadyClosedError,
  ProductionDayEmptyError,
  ProductionDayNotClosedError,
} from "../errors/production-errors.js";
import { absorbArrivals, countOf, freezeOrder } from "../services/production-count.js";
import type { ContainerStep } from "../value-objects/container-step.js";
import { ServiceDay } from "../value-objects/service-day.value-object.js";
import * as packing from "./production-day.packing.js";
import type {
  PackedMark,
  ProducedItemSnapshot,
  ProductionDaySnapshot,
  ProductionLineSnapshot,
  ProductionOrderSnapshot,
} from "./production-day.snapshot.js";

// La forme de la journée vit à côté ; on la réexporte pour que l'agrégat reste
// le seul point d'entrée — un appelant n'a pas à savoir comment il est rangé.
export type {
  DoneMark,
  PackedLineMark,
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
    private ordersValue: readonly ProductionOrderSnapshot[],
    private countsValue: readonly ProducedItemSnapshot[],
  ) {}

  /**
   * Une journée qu'on n'a jamais arrêtée. C'est l'état de départ, et le seul
   * qu'on puisse fabriquer sans lire la base.
   */
  static open(day: ServiceDay): ProductionDay {
    return new ProductionDay(day, null, null, [], []);
  }

  /** Rehydrate depuis l'adaptateur. Les value objects revalident au passage. */
  static fromSnapshot(snapshot: ProductionDaySnapshot): ProductionDay {
    return new ProductionDay(
      ServiceDay.of(snapshot.serviceDay),
      snapshot.closedAt,
      snapshot.retaken,
      snapshot.orders,
      snapshot.counts,
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

  get orders(): readonly ProductionOrderSnapshot[] {
    return this.ordersValue;
  }

  /** Le **compte à produire** : un article, une quantité, tous clients confondus. */
  get counts(): readonly ProducedItemSnapshot[] {
    return this.countsValue;
  }

  /**
   * **Le bac est fait** — le colisage d'une commande de cette journée.
   *
   * ## Pourquoi c'est un fait de la PRODUCTION
   *
   * C'est le fournil qui ferme le bac : personne d'autre ne peut le constater.
   * Le commerce en tire le sien — `ready`, « prête pour le client » — par un
   * événement. Deux faits distincts, chacun chez celui qui l'observe ; les
   * confondre reviendrait à faire écrire au fournil dans les tables du commerce.
   *
   * ## Les trois refus, et ce que chacun évite
   *
   * - **journée non arrêtée** : une commande qu'aucune clôture n'a inscrite
   *   n'est pas à fabriquer aujourd'hui ;
   * - **référence inconnue** : elle n'est pas dans cette journée-là ;
   * - **déjà colisée** : deux mains sur la même feuille est le cas NORMAL au
   *   fournil, et le premier scan est le seul vrai. Le second ne doit pas
   *   réécrire l'heure ni changer l'identité qui l'a déclaré.
   *
   * ⚠️ Aucun refus sur une commande ANNULÉE, et c'est un fait, pas un oubli :
   * rien n'annule une commande dans ce système — `cancelled` est une valeur que
   * l'énuméré accepte et que personne n'écrit. Le jour où l'annulation existera,
   * elle devra se propager jusqu'ici, sinon le fournil colisera pour rien.
   *
   * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
   * @throws {AtelierSheetNotFoundError} aucune commande sous cette référence.
   * @throws {OrderAlreadyPackedError} le bac est déjà fait.
   */
  pack(reference: string, at: Date, by: string): ProductionOrderSnapshot {
    const target = packing.sheetToPack(this, reference);
    if (target.packed !== null) {
      throw new OrderAlreadyPackedError(reference);
    }
    const packed: ProductionOrderSnapshot = { ...target, packed: { at, by } };
    this.ordersValue = this.ordersValue.map((order) =>
      order.reference === reference ? packed : order,
    );
    return packed;
  }

  /** Garde du colisage, sans muter — refus et raisons : `production-day.packing.ts`. */
  sheetToPack(reference: string): ProductionOrderSnapshot {
    return packing.sheetToPack(this, reference);
  }

  /** Garde du colisage, sans muter — refus et raisons : `production-day.packing.ts`. */
  lineToPack(reference: string, sku: string): ProductionLineSnapshot {
    return packing.lineToPack(this, reference, sku);
  }

  /** Garde du colisage, sans muter — refus et raisons : `production-day.packing.ts`. */
  lineToFill(reference: string, sku: string): ProductionLineSnapshot {
    return packing.lineToFill(this, reference, sku);
  }

  /**
   * L'article attend-il encore le four ? Cf. `isAwaitingProduction` dans
   * `production-day.packing.ts`.
   */
  isAwaitingProduction(sku: string): boolean {
    return packing.isAwaitingProduction(this, sku);
  }

  /** Garde du colisage, sans muter — refus et raisons : `production-day.packing.ts`. */
  sheetToCount(reference: string): ProductionOrderSnapshot {
    return packing.sheetToCount(this, reference);
  }

  /** Garde du colisage, sans muter — refus et raisons : `production-day.packing.ts`. */
  containerStepOn(reference: string, step: ContainerStep): ProductionOrderSnapshot {
    return packing.containerStepOn(this, reference, step);
  }

  /**
   * **Annoncer combien de containers la commande occupe** — un TOTAL.
   *
   * @deprecated Depuis le 2026-09-14 — le poste envoie un sens
   * ({@link containerStepOn}). Garde la route `PUT` servie un déploiement de
   * plus : elle est en production.
   *
   * Refuse tout ce que {@link sheetToCount} refuse, et un nombre qui n'est pas un
   * nombre de bacs (`assertContainerCount`).
   *
   * @throws {InvalidContainerCountError} ce n'est pas un nombre de bacs.
   */
  declareContainers(reference: string, containers: number): ProductionOrderSnapshot {
    const sheet = packing.sheetToCount(this, reference);
    packing.assertContainerCount(containers);
    const counted: ProductionOrderSnapshot = { ...sheet, containers };
    this.ordersValue = this.ordersValue.map((order) =>
      order.reference === reference ? counted : order,
    );
    return counted;
  }

  /**
   * **Arrête la journée** : fige les commandes et calcule le compte à produire.
   *
   * L'instant vient du port d'horloge, jamais du mur — deux clôtures de la même
   * journée doivent porter le même instant que ce que le journal en dira.
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
  }

  /**
   * La ligne qu'on s'apprête à cocher — **sans rien muter**.
   *
   * Même figure que {@link sheetToPack}, et pour la même raison : elle porte les
   * deux refus STRUCTURELS — la journée n'est pas arrêtée, ou ce SKU n'est pas
   * au compte du jour — en un seul endroit plutôt que recopiés chez les deux
   * appelants (cocher, décocher).
   *
   * Elle ne dit rien de l'état de la case. « Déjà cochée » n'est pas un refus
   * ici, contrairement au colisage : voir la note de l'adaptateur.
   *
   * @throws {ProductionDayNotClosedError} rien n'est arrêté, donc rien à cocher.
   * @throws {ProducedItemNotFoundError} ce SKU n'est pas au compte du jour.
   */
  itemToMark(sku: string): ProducedItemSnapshot {
    if (!this.isClosed) {
      throw new ProductionDayNotClosedError(this.day.value);
    }
    const target = this.countsValue.find((item) => item.sku === sku);
    if (target === undefined) {
      throw new ProducedItemNotFoundError(sku, this.day.value);
    }
    return target;
  }

  /**
   * **Le retirage** : absorber ce qui est arrivé depuis que le plan est arrêté.
   *
   * ## Pourquoi ça ne contredit pas l'invariant de l'en-tête
   *
   * « Une journée arrêtée ne se recalcule pas » vise le recalcul **silencieux**
   * — celui qui donnerait un autre nombre que celui sur lequel le fournil a
   * lancé ses fournées, sans que personne l'ait voulu. Le retirage est l'autre
   * chose : un geste **attesté**, fait par quelqu'un à qui l'écran vient de
   * montrer les lignes qui changent et de dire laquelle est déjà cochée. D'où
   * `retakenBy` : sans auteur, ce serait exactement le recalcul qu'on refuse.
   *
   * L'invariant n'est donc pas levé, il est nommé — impossible par accident,
   * possible par décision, et traçable.
   *
   * Ce qu'il absorbe exactement — par `orderId`, sans décocher — est calculé par
   * `absorbArrivals` dans `services/production-count.ts`.
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
      orders: this.ordersValue,
      counts: this.countsValue,
    };
  }
}
