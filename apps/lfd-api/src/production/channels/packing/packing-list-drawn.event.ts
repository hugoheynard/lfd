import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
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
  readonly reference: string;
  readonly customerLabel: string;
  readonly fulfillmentMethod: "pickup" | "delivery";
  /** `HH:mm` — début du créneau, sinon fin de l'échéance ; `null` = en dernier. */
  readonly dueAt: string | null;
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
 * La clé est la commande : `production.packing_list_drawn:<jour>:<orderId>`.
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
  ) {}

  durableFact(): DurableFact {
    return {
      type: PRODUCTION_PACKING_LIST_DRAWN,
      key: `${PRODUCTION_PACKING_LIST_DRAWN}:${this.serviceDay}:${this.order.orderId}`,
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
  const reference = textOf(raw["reference"]);
  const customerLabel = raw["customerLabel"];
  const method = raw["fulfillmentMethod"];
  const dueAt = raw["dueAt"];
  const lines = linesOf(raw["lines"]);
  if (
    orderId === null ||
    reference === null ||
    typeof customerLabel !== "string" ||
    (method !== "pickup" && method !== "delivery") ||
    (dueAt !== null && typeof dueAt !== "string") ||
    lines === null
  ) {
    return null;
  }
  return { orderId, reference, customerLabel, fulfillmentMethod: method, dueAt, lines };
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
