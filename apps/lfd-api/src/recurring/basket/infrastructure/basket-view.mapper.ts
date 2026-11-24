import {
  billingAddressPayloadSchema,
  fulfillmentMethodSchema,
  fulfillmentWindowSchema,
  recurrenceSchema,
  recurringOccurrenceCauseSchema,
  recurringOccurrenceStateSchema,
  subscriptionStatusSchema,
  type AdminRecurringOccurrenceView,
  type RecurringOccurrenceView,
  type SubscriptionLineView,
  type SubscriptionView,
} from "@lfd/contracts";
import { z } from "zod";

import type { Prisma } from "../../../platform/database/client/client.js";
import type { IsoDate } from "../domain/value-objects/iso-date.js";

/** Lignes de dérogation persistées (JSON) : SKU + quantité. */
const overrideLinesSchema = z.array(z.object({ sku: z.string(), quantity: z.number().int() }));

/**
 * Ce qu'une vue de panier lit, échéances comprises — une seule requête par
 * liste : la base de production est facturée à l'opération.
 */
export function basketViewSelect(since: IsoDate) {
  return {
    id: true,
    buyerUserId: true,
    cadence: true,
    status: true,
    startDate: true,
    endDate: true,
    fulfillmentMethod: true,
    deliveryAddress: true,
    pickupAddressId: true,
    requestedWindow: true,
    note: true,
    salesTermsKey: true,
    salesTermsRevision: true,
    salesTermsNextRevision: true,
    salesTermsEffectiveOn: true,
    createdAt: true,
    lines: { select: { sku: true, quantity: true }, orderBy: { position: "asc" } },
    occurrences: {
      where: { serviceDay: { gte: since.toUtcDate() } },
      select: {
        serviceDay: true,
        state: true,
        lines: true,
        note: true,
        orderId: true,
        cause: true,
        reason: true,
        settledAt: true,
      },
      orderBy: { serviceDay: "asc" },
    },
  } satisfies Prisma.BasketSelect;
}

/** Une échéance relue pour la vue. */
export interface OccurrenceViewRow {
  readonly serviceDay: Date;
  readonly state: string;
  readonly lines: Prisma.JsonValue;
  readonly note: string;
  readonly orderId: string | null;
  readonly cause: string | null;
  readonly reason: string | null;
  readonly settledAt: Date | null;
}

/** Un panier relu pour la vue. */
export interface BasketViewRow {
  readonly id: string;
  readonly buyerUserId: string;
  readonly cadence: string;
  readonly status: string;
  readonly startDate: Date;
  readonly endDate: Date | null;
  readonly fulfillmentMethod: string;
  readonly deliveryAddress: Prisma.JsonValue;
  readonly pickupAddressId: string | null;
  readonly requestedWindow: Prisma.JsonValue;
  readonly note: string;
  readonly salesTermsKey: string;
  readonly salesTermsRevision: number;
  readonly salesTermsNextRevision: number | null;
  readonly salesTermsEffectiveOn: Date | null;
  readonly createdAt: Date;
  readonly lines: readonly SubscriptionLineView[];
  readonly occurrences: readonly OccurrenceViewRow[];
}

/** La vue du client : chaque échéance ne dit que son état, jamais la cause d'un refus. */
export function toSubscriptionView(row: BasketViewRow): SubscriptionView {
  const template = row.lines.map((line) => ({ sku: line.sku, quantity: line.quantity }));
  return {
    ...basketFields(row),
    lines: template,
    occurrences: row.occurrences.map((occurrence) => toOccurrenceView(occurrence, template)),
  };
}

/** La vue du staff : chaque échéance porte aussi sa cause, sa phrase et l'heure de l'issue. */
export function toAdminOccurrences(row: BasketViewRow): readonly AdminRecurringOccurrenceView[] {
  const template = row.lines.map((line) => ({ sku: line.sku, quantity: line.quantity }));
  return row.occurrences.map((occurrence) => ({
    ...toOccurrenceView(occurrence, template),
    cause:
      occurrence.cause === null ? null : recurringOccurrenceCauseSchema.parse(occurrence.cause),
    reason: occurrence.reason,
    settledAt: occurrence.settledAt === null ? null : occurrence.settledAt.toISOString(),
  }));
}

function basketFields(row: BasketViewRow): Omit<SubscriptionView, "lines" | "occurrences"> {
  return {
    id: row.id,
    recurrence: recurrenceSchema.parse(row.cadence),
    status: subscriptionStatusSchema.parse(row.status),
    startDate: dateOnly(row.startDate),
    endDate: row.endDate === null ? null : dateOnly(row.endDate),
    fulfillmentMethod: fulfillmentMethodSchema.parse(row.fulfillmentMethod),
    deliveryAddress:
      row.deliveryAddress === null ? null : billingAddressPayloadSchema.parse(row.deliveryAddress),
    pickupAddressId: row.pickupAddressId,
    requestedWindow: fulfillmentWindowSchema.parse(row.requestedWindow),
    note: row.note,
    salesTerms: { document: row.salesTermsKey, revision: row.salesTermsRevision },
    nextSalesTerms:
      row.salesTermsNextRevision === null || row.salesTermsEffectiveOn === null
        ? null
        : {
            revision: row.salesTermsNextRevision,
            effectiveOn: dateOnly(row.salesTermsEffectiveOn),
          },
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Les champs que le client voit, et seulement eux : la vue est construite
 * champ par champ, jamais en étalant la ligne, pour que `cause` et `reason`
 * ne la rejoignent pas par mégarde.
 */
function toOccurrenceView(
  occurrence: OccurrenceViewRow,
  template: readonly SubscriptionLineView[],
): RecurringOccurrenceView {
  const own = occurrence.lines === null ? null : overrideLinesSchema.parse(occurrence.lines);
  return {
    serviceDay: dateOnly(occurrence.serviceDay),
    state: recurringOccurrenceStateSchema.parse(occurrence.state),
    lines: own ?? template,
    overridden: own !== null,
    note: occurrence.note,
    orderId: occurrence.orderId,
  };
}

/** `Date` → `AAAA-MM-JJ` (colonne `@db.Date`, minuit UTC). */
function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
