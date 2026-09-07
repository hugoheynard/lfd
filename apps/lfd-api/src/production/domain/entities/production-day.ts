import type { ProducibleOrder } from "../../channels/commerce/day-orders.reader.js";
import {
  ProductionDayAlreadyClosedError,
  ProductionDayEmptyError,
} from "../errors/production-errors.js";
import { ServiceDay } from "../value-objects/service-day.value-object.js";

/** Une ligne de commande, figée du côté de la production. */
export interface ProductionLineSnapshot {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/** Une commande, figée du côté de la production. */
export interface ProductionOrderSnapshot {
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
  readonly fulfillmentMethod: "pickup" | "delivery";
  readonly destination: string;
  readonly lines: readonly ProductionLineSnapshot[];
}

/** Ce qu'il faut fabriquer d'un article, tous clients confondus. */
export interface ProducedItemSnapshot {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/** L'état d'une journée, tel que l'adaptateur l'écrit et le relit. */
export interface ProductionDaySnapshot {
  readonly serviceDay: string;
  readonly closedAt: Date | null;
  readonly orders: readonly ProductionOrderSnapshot[];
  readonly counts: readonly ProducedItemSnapshot[];
}

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
    private ordersValue: readonly ProductionOrderSnapshot[],
    private countsValue: readonly ProducedItemSnapshot[],
  ) {}

  /**
   * Une journée qu'on n'a jamais arrêtée. C'est l'état de départ, et le seul
   * qu'on puisse fabriquer sans lire la base.
   */
  static open(day: ServiceDay): ProductionDay {
    return new ProductionDay(day, null, [], []);
  }

  /** Rehydrate depuis l'adaptateur. Les value objects revalident au passage. */
  static fromSnapshot(snapshot: ProductionDaySnapshot): ProductionDay {
    return new ProductionDay(
      ServiceDay.of(snapshot.serviceDay),
      snapshot.closedAt,
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

  get orders(): readonly ProductionOrderSnapshot[] {
    return this.ordersValue;
  }

  /** Le **compte à produire** : un article, une quantité, tous clients confondus. */
  get counts(): readonly ProducedItemSnapshot[] {
    return this.countsValue;
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
    this.ordersValue = orders.map(frozen);
    this.countsValue = countOf(orders);
    this.closedAtValue = at;
  }

  /** L'état à écrire. Les getters de l'agrégat, jamais ses champs privés. */
  toSnapshot(): ProductionDaySnapshot {
    return {
      serviceDay: this.day.value,
      closedAt: this.closedAtValue,
      orders: this.ordersValue,
      counts: this.countsValue,
    };
  }
}

/** La commande, recopiée telle qu'elle était — jamais une référence vers elle. */
function frozen(order: ProducibleOrder): ProductionOrderSnapshot {
  return {
    orderId: order.orderId,
    reference: order.reference,
    customerLabel: order.customerLabel,
    fulfillmentMethod: order.fulfillmentMethod,
    destination: order.destination,
    lines: order.lines.map((line) => ({
      sku: line.sku,
      productName: line.productName,
      quantity: line.quantity,
    })),
  };
}

/**
 * Le compte à produire, **trié par SKU**.
 *
 * Trié, et pas dans l'ordre d'arrivée des commandes : deux clôtures des mêmes
 * commandes doivent rendre le même compte, sans quoi le PDF qu'on en tire
 * cesserait d'être déterministe — et c'est la propriété sur laquelle repose son
 * rangement sans verrou.
 *
 * Le nom retenu est celui de la PREMIÈRE ligne rencontrée pour ce SKU. Deux
 * commandes d'une même journée portent le même catalogue ; si elles divergeaient,
 * c'est le SKU qui ferait foi, pas le libellé.
 */
function countOf(orders: readonly ProducibleOrder[]): readonly ProducedItemSnapshot[] {
  const bySku = new Map<string, ProducedItemSnapshot>();
  for (const order of orders) {
    for (const line of order.lines) {
      const known = bySku.get(line.sku);
      bySku.set(line.sku, {
        sku: line.sku,
        productName: known?.productName ?? line.productName,
        quantity: (known?.quantity ?? 0) + line.quantity,
      });
    }
  }
  return [...bySku.values()].sort((left, right) => left.sku.localeCompare(right.sku));
}
