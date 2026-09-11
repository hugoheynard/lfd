import type { Prisma } from "../../../platform/database/client/client.js";
import {
  billingAddressPayloadSchema,
  orderFulfillmentSchema,
  type BillingAddressPayload,
  type OrderFulfillment,
} from "@lfd/contracts";

import type { HandoverQueueWindow } from "../domain/ports/order.reader.js";

/**
 * **La lecture d'une commande POUR LA REMISE**, partagée par les deux
 * adaptateurs qui la servent — et par eux seuls.
 *
 * ## Pourquoi un module, et surtout pas un verbe de plus sur `OrderReader`
 *
 * 🔴 Ces deux lectures servaient des méthodes publiées par `OrderReader` :
 * `findByHandoverToken`, `findHandoverByReference`, `findHandoverByOrderId`,
 * `expectedForHandoverOn`. Elles n'avaient aucun appelant dans `b2b` — elles
 * n'existaient que pour être **déléguées** par les adaptateurs des ports que la
 * remise déclare chez elle.
 *
 * C'est-à-dire que le commerce publiait une seconde fois, de son côté, des
 * besoins que la remise avait déjà nommés du sien. Un contexte qui publie un
 * verbe par consommateur finit par connaître ses consommateurs — et c'est la
 * dépendance qui revient par l'autre bout, celle que le `CLAUDE.md` interdit
 * pour `production → b2b`.
 *
 * Le port n'a donc pas été DÉCOUPÉ, il a RÉTRÉCI : quatre verbes sont partis,
 * et avec eux quatre méthodes mortes dans chacun de ses huit doublés.
 *
 * ## Ce que la délégation protégeait, et qui est protégé autrement
 *
 * Son JSDoc disait vrai : « recopier ici le `select` aurait rouvert la
 * divergence, avec une frontière de contexte au milieu ». Mais ce besoin-là
 * réclame un `select` partagé, pas une surface publique. Ce module est interne
 * à `infrastructure/` — aucun port ne le nomme, aucun contexte ne l'importe.
 *
 * Le précédent existait déjà : `PrismaDayOrdersReader` implémente le port du
 * fournil en interrogeant Prisma directement, sans rien ajouter à
 * `OrderReader`.
 */

/** Les deux jointures qui suffisent à nommer un client — rien de plus. */
interface NameableRow {
  readonly company: { readonly raisonSociale: string } | null;
  readonly placedBy: {
    readonly email: string;
    readonly firstName: string;
    readonly lastName: string;
  };
}

/**
 * Qui a commandé, en clair. La société prime quand il y en a une ; sinon la
 * personne, par son nom si on le connaît et par son e-mail sinon — jamais un
 * identifiant technique, qui ne dit rien au téléphone ni au comptoir.
 */
function customerLabelOf(row: NameableRow): string {
  if (row.company !== null && row.company.raisonSociale !== "") {
    return row.company.raisonSociale;
  }
  const fullName = `${row.placedBy.firstName} ${row.placedBy.lastName}`.trim();
  return fullName === "" ? row.placedBy.email : fullName;
}

/**
 * **L'enseigne, quand elle dit quelque chose de plus.**
 *
 * 🔴 Deux absences se confondent dans cette colonne, et une seule réponse les
 * couvre : `enseigne` vaut `""` par défaut sur toute société qui n'en a jamais
 * déclaré (`account.prisma`), et une maison peut aussi avoir recopié sa raison
 * sociale dans les deux champs. Dans les deux cas le comptoir n'a qu'UN nom à
 * lire, et le rendre deux fois est pire que de ne pas le rendre : on croit à
 * deux clients homonymes le temps d'un regard.
 *
 * La comparaison est faite ici, au seul endroit qui lit la colonne. Laissée à
 * l'écran, elle serait refaite par chaque écran, et oubliée par un.
 */
function tradeNameOf(
  company: { readonly enseigne: string } | null,
  customerLabel: string,
): string | null {
  const trade = company?.enseigne.trim() ?? "";
  return trade === "" || trade === customerLabel ? null : trade;
}

/**
 * Le nom du point de retrait figé à la commande. Le snapshot est validé plutôt
 * que casté — une commande antérieure au point de retrait n'en porte pas, et un
 * JSON d'une autre forme ne doit pas remonter en vue.
 */
function pickupLabelOf(value: Prisma.JsonValue | null): string | null {
  const address = parseAddress(value);
  if (address === null || address.label === "") {
    return null;
  }
  return address.label;
}

/**
 * L'acheminement convenu, figé en JSON. Validé plutôt que casté — et le **repli
 * est explicite** : une commande antérieure à la colonne n'en porte pas, elle
 * rend alors « rien de convenu, tout par défaut » plutôt qu'un contact inventé.
 */
function fulfillmentOf(value: Prisma.JsonValue | null): OrderFulfillment {
  const parsed = orderFulfillmentSchema.safeParse(value);
  return parsed.success ? parsed.data : NOTHING_AGREED;
}

/**
 * Le créneau convenu, **avec sa provenance**, ou `null` s'il n'y en a pas.
 *
 * 🔴 La provenance traverse le port au lieu d'être aplatie. Un `end` en
 * `source: "default"` est une heure d'ouverture recopiée à la passation, pas une
 * promesse — et le backfill du 2026-08-15 en a posé une sur TOUTES les commandes
 * antérieures. Un écran qui ne verrait que l'heure calculerait un retard sur
 * l'intégralité du portefeuille d'un coup.
 */
function windowOf(agreed: OrderFulfillment): HandoverQueueWindow | null {
  const window = agreed.window.value;
  return window === null
    ? null
    : { start: window.start, end: window.end, source: agreed.window.source };
}

/** Ce que dit une commande qui n'a jamais rien convenu : rien, et par défaut. */
const NOTHING_AGREED: OrderFulfillment = {
  window: { value: null, source: "default" },
  contact: { value: null, source: "default" },
  signatureRequired: { value: false, source: "default" },
};

/** Valide un snapshot d'adresse postale figée (retrait ou coursier), ou `null`. */
function parseAddress(value: Prisma.JsonValue | null): BillingAddressPayload | null {
  return value === null ? null : billingAddressPayloadSchema.parse(value);
}

/** Ce que la remise lit d'UNE commande. Aucun montant : on ne facture pas ici. */
export const HANDOVER_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  fulfillmentMethod: true,
  requestedDeliveryDate: true,
  pickupAddress: true,
  createdAt: true,
  companyId: true,
  placedByUserId: true,
  // La note est sur le bon qu'on coche : « sans sésame », « par la cour ».
  note: true,
  company: { select: { raisonSociale: true } },
  placedBy: { select: { email: true, firstName: true, lastName: true } },
  lines: { select: { sku: true, productNameSnapshot: true, quantity: true } },
} as const;

/** Ce que la FILE lit de chaque commande du jour. Aucune ligne, un compte. */
export const HANDOVER_QUEUE_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  fulfillmentMethod: true,
  pickupAddress: true,
  fulfillment: true,
  readyAt: true,
  createdAt: true,
  companyId: true,
  company: { select: { raisonSociale: true, enseigne: true } },
  placedBy: { select: { email: true, firstName: true, lastName: true } },
  lines: { select: { quantity: true } },
} as const;

type HandoverRow = Prisma.OrderGetPayload<{ select: typeof HANDOVER_SELECT }>;
type QueueRow = Prisma.OrderGetPayload<{ select: typeof HANDOVER_QUEUE_SELECT }>;

/** La ligne → le sujet que la remise attend. */
export function toHandoverSubject(row: HandoverRow): {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly placedByUserId: string;
  readonly customerLabel: string;
  readonly placedAt: Date;
  readonly requestedDeliveryDate: Date | null;
  readonly pickupLabel: string | null;
  readonly status: HandoverRow["status"];
  readonly fulfillmentMethod: HandoverRow["fulfillmentMethod"];
  readonly note: string;
  readonly lines: readonly {
    readonly sku: string;
    readonly productName: string;
    readonly quantity: number;
  }[];
} {
  return {
    orderId: row.id,
    orderNumber: row.orderNumber,
    placedByUserId: row.placedByUserId,
    customerLabel: customerLabelOf(row),
    placedAt: row.createdAt,
    requestedDeliveryDate: row.requestedDeliveryDate,
    pickupLabel: pickupLabelOf(row.pickupAddress),
    status: row.status,
    fulfillmentMethod: row.fulfillmentMethod,
    note: row.note,
    lines: row.lines.map((line) => ({
      sku: line.sku,
      productName: line.productNameSnapshot,
      quantity: line.quantity,
    })),
  };
}

/** La ligne → une entrée de file. */
export function toQueueEntry(row: QueueRow): {
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
  readonly tradeName: string | null;
  readonly pickupLabel: string | null;
  readonly fulfillmentMethod: QueueRow["fulfillmentMethod"];
  readonly window: HandoverQueueWindow | null;
  readonly totalUnits: number;
  readonly status: string;
  readonly readyAt: Date | null;
  readonly placedAt: Date;
} {
  const label = customerLabelOf(row);
  return {
    orderId: row.id,
    reference: row.orderNumber,
    customerLabel: label,
    tradeName: tradeNameOf(row.company, label),
    pickupLabel: pickupLabelOf(row.pickupAddress),
    fulfillmentMethod: row.fulfillmentMethod,
    window: windowOf(fulfillmentOf(row.fulfillment)),
    totalUnits: row.lines.reduce((sum, line) => sum + line.quantity, 0),
    status: row.status,
    readyAt: row.readyAt,
    placedAt: row.createdAt,
  };
}
