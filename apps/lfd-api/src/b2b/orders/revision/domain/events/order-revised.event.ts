import type { DurableEvent, DurableFact } from "../../../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../../../platform/shared/errors/app-error.js";
import {
  REVISION_CHANGES,
  type RevisionActor,
  type RevisionChange,
} from "../entities/order-revision.js";

/** Nom stable du fait — une valeur du journal : elle ne se renomme que par migration. */
export const ORDER_REVISED = "order.revised";

/**
 * **D'où vient la révision** — une valeur du fait, lue par l'abonné qui écrit
 * au client (`SendOrderRevisedMail`) :
 *
 * - `direct` : le client ou l'équipe a modifié (M1), ou la hausse payée a été
 *   appliquée par son exécuteur ;
 * - `change_request` : l'équipe a appliqué une demande du client (M4). Le
 *   bloc `contact` lui écrit déjà `customer.order-change-applied`, qui porte
 *   l'écart : un second e-mail ferait doublon.
 *
 * Un fait écrit avant ce champ (2026-11-10) se lit `direct`.
 */
export const REVISION_ORIGINS = ["direct", "change_request"] as const;
export type RevisionOrigin = (typeof REVISION_ORIGINS)[number];

/**
 * **« Une commande a été modifiée »** (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.8 « Les autres blocs ») — écrit
 * dans la boîte d'envoi dans la transaction de la révision. Le journal en
 * garde le témoin (qui, quand, ce qui a changé, l'écart de total).
 *
 * Clé `order.revised:<orderId>:<révision>` : une révision n'arrive qu'une fois.
 */
export class OrderRevisedEvent implements DurableEvent {
  constructor(
    readonly orderId: string,
    readonly orderNumber: string,
    readonly placedByUserId: string,
    readonly revision: number,
    readonly author: RevisionActor,
    readonly changes: readonly RevisionChange[],
    readonly totalBeforeCents: number,
    readonly totalAfterCents: number,
    readonly origin: RevisionOrigin,
    /**
     * Le HT avant et après, que l'e-mail d'un pro dit (`orderPretaxCents`).
     * `null` sur un fait écrit avant ces champs (2026-11-10) : l'e-mail dit alors le TTC seul.
     */
    readonly pretaxBeforeCents: number | null,
    readonly pretaxAfterCents: number | null,
  ) {}

  durableFact(): DurableFact {
    return {
      type: ORDER_REVISED,
      key: `${ORDER_REVISED}:${this.orderId}:${String(this.revision)}`,
      payload: {
        orderId: this.orderId,
        orderNumber: this.orderNumber,
        placedByUserId: this.placedByUserId,
        revision: this.revision,
        author: { ...this.author },
        changes: [...this.changes],
        totalBeforeCents: this.totalBeforeCents,
        totalAfterCents: this.totalAfterCents,
        origin: this.origin,
        pretaxBeforeCents: this.pretaxBeforeCents,
        pretaxAfterCents: this.pretaxAfterCents,
      },
    };
  }

  /** @throws {OrderRevisedPayloadError} une charge illisible. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): OrderRevisedEvent {
    const text = (key: string): string | null => {
      const value = payload[key];
      return typeof value === "string" && value.length > 0 ? value : null;
    };
    const count = (key: string): number | null => {
      const value = payload[key];
      return typeof value === "number" && Number.isInteger(value) ? value : null;
    };
    const orderId = text("orderId");
    const orderNumber = text("orderNumber");
    const placedByUserId = text("placedByUserId");
    const revision = count("revision");
    const before = count("totalBeforeCents");
    const after = count("totalAfterCents");
    const author = authorOf(payload["author"]);
    const changes = changesOf(payload["changes"]);
    const origin = originOf(payload["origin"]);
    const pretaxBefore = count("pretaxBeforeCents");
    const pretaxAfter = count("pretaxAfterCents");
    if (
      orderId === null ||
      orderNumber === null ||
      placedByUserId === null ||
      revision === null ||
      before === null ||
      after === null ||
      author === null ||
      changes === null ||
      origin === null
    ) {
      throw new OrderRevisedPayloadError();
    }
    return new OrderRevisedEvent(
      orderId,
      orderNumber,
      placedByUserId,
      revision,
      author,
      changes,
      before,
      after,
      origin,
      // Les deux ensemble, ou aucun : un HT sans l'autre ne se compare à rien.
      pretaxBefore === null || pretaxAfter === null ? null : pretaxBefore,
      pretaxBefore === null || pretaxAfter === null ? null : pretaxAfter,
    );
  }
}

/** Absente (fait d'avant le 2026-11-10) ⇒ `direct` ; inconnue ⇒ illisible. */
function originOf(raw: unknown): RevisionOrigin | null {
  if (raw === undefined) {
    return "direct";
  }
  return REVISION_ORIGINS.find((origin) => origin === raw) ?? null;
}

function authorOf(raw: unknown): RevisionActor | null {
  if (raw === null || typeof raw !== "object") {
    return null;
  }
  const entries: readonly (readonly [string, unknown])[] = Object.entries(raw);
  const record = new Map<string, unknown>(entries);
  const kind = record.get("kind");
  const userId = record.get("userId");
  const staffId = record.get("staffId");
  if (kind === "customer" && typeof userId === "string" && userId.length > 0) {
    return { kind, userId };
  }
  if (kind === "staff" && typeof staffId === "string" && staffId.length > 0) {
    return { kind, staffId };
  }
  return null;
}

function changesOf(raw: unknown): RevisionChange[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const known: readonly string[] = REVISION_CHANGES;
  const changes = raw.filter(
    (value): value is RevisionChange => typeof value === "string" && known.includes(value),
  );
  return changes.length === raw.length ? changes : null;
}

/** Un fait « commande modifiée » illisible : aucun témoin n'est écrit, le message reste visible. */
export class OrderRevisedPayloadError extends TechnicalError {
  constructor() {
    super(
      "order_revised.payload_invalid",
      "Le fait « commande modifiée » reçu est illisible (commande, révision, auteur ou changements " +
        "manquants) : son témoin n'a pas été écrit au journal. Le message reste dans la boîte " +
        "d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
