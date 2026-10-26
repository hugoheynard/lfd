import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import {
  shipmentKeySuffix,
  shipmentRankOf,
} from "../../domain/value-objects/shipment-ref.value-object.js";
import type { Clientele } from "../commerce/day-orders.reader.js";
import { instantOf, piecesOf, recordOf, textOf } from "./payload-fields.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const PRODUCTION_PACKING_LIST_DRAWN = "production.packing_list_drawn";

/** Une ligne à coliser : l'article, son nom, la quantité due. Aucun montant. */
export interface PackingListLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/** Une commande à coliser, telle que le fournil l'a inscrite au plan. */
export interface PackingListOrder {
  /** Identifiant OPAQUE de la commande côté commerce. */
  readonly orderId: string;
  /**
   * Le rang de l'envoi (plan E7 reliquat, choix 5) : 1 = la commande, > 1 =
   * un reliquat. Un fait écrit avant le champ se relit au rang 1.
   */
  readonly rank: number;
  readonly reference: string;
  readonly customerLabel: string;
  readonly fulfillmentMethod: "pickup" | "delivery";
  /** `HH:mm` — début du créneau, sinon fin de l'échéance ; `null` = en dernier. */
  readonly dueAt: string | null;
  /**
   * `pro` / `public` (2026-10-06, badge du poste). `null` = inconnue — et
   * c'est aussi ce que rend un fait écrit avant le champ, qui ne le porte pas.
   */
  readonly clientele: Clientele | null;
  /**
   * Le site qui remet ce retrait, identifiant OPAQUE du commerce, tel que la
   * journée l'a figé (S2) — le colisage le recopie pour sa couleur (plan
   * `commandes/back-office/tri-depart-et-couleurs.md`, L1a). `null` : livraison,
   * commande d'avant le site, ou fait écrit avant le champ.
   */
  readonly siteId: string | null;
  readonly lines: readonly PackingListLine[];
}

/**
 * **Une commande entre dans la liste à coliser** — publiée par la clôture, la
 * réannonce et le retirage (commandes absorbées seulement), dans leur
 * transaction (plan `documentation/colisage/colisage.md`, §11,
 * B1–B2 ; §13).
 *
 * ## Un fait PAR COMMANDE, et pourquoi
 *
 * La clé est l'envoi : `production.packing_list_drawn:<jour>:<orderId>`, et
 * `…:<orderId>:r<rang>` pour un reliquat (plan E7 reliquat, choix 6 — le
 * rang 1 garde la clé d'avant à l'identique).
 * Une réannonce republie les mêmes clés — la boîte d'envoi les absorbe —, et
 * un retirage n'écrit que celles qu'il vient d'absorber. Un seul fait pour
 * toute la liste aurait demandé une clé par tirage, et fait recevoir deux fois
 * la même commande au colisage.
 *
 * `production.day_closed` ne change pas de forme : le commerce continue de le
 * lire, et ce fait-ci n'est que pour le colisage.
 *
 * 🔴 **Il vit dans le CANAL** : le colisage le lit par ce dossier seulement.
 */
export class PackingListDrawnEvent implements DurableEvent {
  constructor(
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    /** L'instant du tirage qui l'a inscrite (clôture ou retirage), jamais celui d'un rejeu. */
    readonly drawnAt: Date,
    readonly order: PackingListOrder,
    /**
     * La dernière réouverture de la journée, ou `null` (2026-10-14). Elle
     * n'entre que dans la CLÉ : sans elle, la commande tirée de nouveau après
     * une réouverture portait la clé du premier tirage, et la boîte d'envoi
     * (`ON CONFLICT (key) DO NOTHING`) l'avalait — le colisage ne la revoyait
     * jamais. `null` garde la clé d'avant, à l'identique.
     */
    readonly reopenedAt: Date | null = null,
  ) {}

  durableFact(): DurableFact {
    return {
      type: PRODUCTION_PACKING_LIST_DRAWN,
      key:
        `${PRODUCTION_PACKING_LIST_DRAWN}:${this.serviceDay}:${this.order.orderId}` +
        shipmentKeySuffix(this.order.rank) +
        (this.reopenedAt === null ? "" : `:after-reopening:${this.reopenedAt.toISOString()}`),
      payload: {
        serviceDay: this.serviceDay,
        drawnAt: this.drawnAt.toISOString(),
        order: {
          ...this.order,
          lines: this.order.lines.map((line) => ({ ...line })),
        },
      },
    };
  }

  /** @throws {PackingListDrawnPayloadError} un payload hors contrat. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): PackingListDrawnEvent {
    const serviceDay = textOf(payload["serviceDay"]);
    const drawnAt = instantOf(payload["drawnAt"]);
    const order = orderOf(payload["order"]);
    if (serviceDay === null || drawnAt === null || order === null) {
      throw new PackingListDrawnPayloadError();
    }
    return new PackingListDrawnEvent(serviceDay, drawnAt, order);
  }
}

function orderOf(value: unknown): PackingListOrder | null {
  const raw = recordOf(value);
  if (raw === null) {
    return null;
  }
  const orderId = textOf(raw["orderId"]);
  const rank = shipmentRankOf(raw["rank"]);
  const reference = textOf(raw["reference"]);
  const customerLabel = raw["customerLabel"];
  const method = raw["fulfillmentMethod"];
  const dueAt = raw["dueAt"];
  const clientele = clienteleOf(raw["clientele"]);
  // Additif, comme la clientèle : un fait sans le champ se lit « sans site ».
  const siteId = textOf(raw["siteId"]);
  const lines = linesOf(raw["lines"]);
  if (
    orderId === null ||
    rank === null ||
    reference === null ||
    typeof customerLabel !== "string" ||
    (method !== "pickup" && method !== "delivery") ||
    (dueAt !== null && typeof dueAt !== "string") ||
    lines === null
  ) {
    return null;
  }
  return {
    orderId,
    rank,
    reference,
    customerLabel,
    fulfillmentMethod: method,
    dueAt,
    clientele,
    siteId,
    lines,
  };
}

/**
 * Additif : un fait déjà écrit sans le champ (ou avec une valeur inconnue)
 * rend `null` plutôt que d'être refusé — le colisage l'inscrit quand même.
 */
function clienteleOf(value: unknown): Clientele | null {
  return value === "pro" || value === "public" ? value : null;
}

function linesOf(value: unknown): readonly PackingListLine[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const lines: PackingListLine[] = [];
  for (const entry of value) {
    const raw = recordOf(entry);
    const sku = textOf(raw?.["sku"]);
    const productName = raw?.["productName"];
    const quantity = piecesOf(raw?.["quantity"]);
    if (sku === null || typeof productName !== "string" || quantity === null) {
      return null;
    }
    lines.push({ sku, productName, quantity });
  }
  return lines;
}

/** Le fait `production.packing_list_drawn` reçu ne respecte pas son contrat. */
export class PackingListDrawnPayloadError extends TechnicalError {
  constructor() {
    super(
      "packing_list_drawn.payload_invalid",
      "Le fait « commande à coliser » reçu est illisible (journée, instant, commande ou lignes hors " +
        "forme) : le colisage ne l'a pas inscrite. Le message reste dans la boîte d'envoi ; corriger " +
        "l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
