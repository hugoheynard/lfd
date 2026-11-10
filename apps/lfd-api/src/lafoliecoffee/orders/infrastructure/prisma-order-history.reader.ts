import { Injectable } from "@nestjs/common";

import type { ActivityEventView } from "@lfd/contracts";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { moduleOf } from "../../growth/domain/activity-module.js";
import { OrderHistoryReader } from "../domain/ports/order-history.reader.js";

/** Une commande porte une dizaine de faits : la borne n'est qu'un garde-fou. */
const HISTORY_LIMIT = 200;

const ORDER_SUBJECT = "order";
const USER_SUBJECT = "user";

/**
 * Lit l'historique d'une commande dans `growth.activity_events` — même bloc
 * `b2b` que le journal, la porte de propriété l'admet.
 *
 * Deux branches (page-commandes, §3 bis) : les faits dont la commande est
 * le sujet (`delivery_bin.*`, `packing_container.*`), et ceux dont son AUTEUR
 * est le sujet avec `payload.orderId` (`order.placed`, `order.ready`…). La
 * seconde passe par l'index `(subject_type, subject_id, occurred_at)` : la
 * charge n'est lue que sur les faits de cet auteur.
 */
@Injectable()
export class PrismaOrderHistoryReader extends OrderHistoryReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async historyOf(orderId: string): Promise<readonly ActivityEventView[] | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { placedByUserId: true },
    });
    if (order === null) {
      return null;
    }
    const rows = await this.prisma.activityEvent.findMany({
      where: {
        OR: [
          { subjectType: ORDER_SUBJECT, subjectId: orderId },
          {
            subjectType: USER_SUBJECT,
            subjectId: order.placedByUserId,
            payload: { path: ["orderId"], equals: orderId },
          },
        ],
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: HISTORY_LIMIT,
      select: {
        id: true,
        type: true,
        occurredAt: true,
        subjectType: true,
        subjectId: true,
        actorType: true,
        actorId: true,
        actorName: true,
        actorRole: true,
        traceId: true,
        payload: true,
      },
    });
    return rows.map(toView);
  }
}

// Même projection que `PrismaActivityJournalReader.toView` (growth) : la vue
// est le contrat du journal, l'écran la met en phrase avec le même moteur.
function toView(row: {
  readonly id: string;
  readonly type: string;
  readonly occurredAt: Date;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly actorType: string;
  readonly actorId: string | null;
  readonly actorName: string | null;
  readonly actorRole: string | null;
  readonly traceId: string;
  readonly payload: Prisma.JsonValue;
}): ActivityEventView {
  return {
    id: row.id,
    type: row.type,
    module: moduleOf(row.type),
    occurredAt: row.occurredAt.toISOString(),
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    actorType: actorTypeOf(row.actorType),
    actorId: row.actorId,
    actorName: row.actorName,
    actorRole: row.actorRole,
    traceId: row.traceId,
    payload: payloadOf(row.payload),
  };
}

function actorTypeOf(raw: string): ActivityEventView["actorType"] {
  return raw === "customer" || raw === "staff" ? raw : "system";
}

function payloadOf(raw: Prisma.JsonValue): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {};
  }
  return { ...raw };
}
