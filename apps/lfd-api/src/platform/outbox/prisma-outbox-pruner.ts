import { Injectable } from "@nestjs/common";

import { Prisma } from "../database/client/client.js";
import { PrismaService } from "../database/prisma.service.js";
import type { PurgeCensus } from "../retention/purge-mode.js";
import { OutboxPruner } from "./outbox-pruner.js";

/**
 * La purge de `platform.outbox` et `platform.outbox_delivery`.
 *
 * Une suppression PHYSIQUE, admise ici (décision de Hugo du 2026-11-06,
 * `plan-service-e-mails.md` § 7) : ces tables ne sont pas un agrégat métier
 * mais de la plomberie de livraison, et le fait qu'un message porte (les
 * données d'un e-mail demandé, dès S2) a déjà produit son effet chez chacun de
 * ses abonnés. Elle ne s'exécute qu'en mode `on` (`OUTBOX_PURGE`), que Hugo
 * n'a PAS activé au 2026-11-06 : par défaut, le passage ne fait que compter.
 *
 * ⚠️ Ce qu'on perdra, et c'est à peser avant `on` : la clé d'un message purgé
 * n'est plus connue — un même fait réémis plus de 30 jours après sa livraison
 * serait de nouveau livré (vérifié le 2026-11-06 : `PrismaOutbox.append` ne
 * déduplique que par `ON CONFLICT (key)`).
 *
 * Par lots : on choisit d'abord les messages, puis on supprime leurs
 * livraisons et eux-mêmes dans une même transaction (la clé étrangère est en
 * `RESTRICT`). Entre les deux, rien ne rend un message inéligible : une
 * livraison faite ne se défait pas, et aucune livraison ne s'ajoute à un
 * message écrit (vérifié le 2026-11-06 : le rejeu ne touche que les non
 * livrées, `append` n'écrit les livraisons qu'avec le message).
 *
 * `occurred_at < cutoff` ne change pas la règle (un fait précède sa
 * livraison) : il laisse l'index `outbox_occurred_at_idx` borner la lecture.
 * Un message SANS livraison n'est jamais éligible (`isOutboxMessagePurgeable`).
 */
@Injectable()
export class PrismaOutboxPruner extends OutboxPruner {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async census(cutoff: Date): Promise<PurgeCensus> {
    const [row] = await this.prisma.$queryRaw<{ count: number; oldest: Date | null }[]>`
      SELECT count(*)::int AS count, min(o.occurred_at) AS oldest
      FROM platform.outbox o
      WHERE ${eligible(cutoff)}
    `;
    return { count: row?.count ?? 0, oldest: row?.oldest ?? null };
  }

  async pruneBatch(cutoff: Date, limit: number): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT o.id FROM platform.outbox o
      WHERE ${eligible(cutoff)}
      ORDER BY o.occurred_at
      LIMIT ${limit}
    `;
    if (rows.length === 0) {
      return 0;
    }
    const ids = rows.map((row) => row.id);
    const [, messages] = await this.prisma.$transaction([
      this.prisma.outboxDelivery.deleteMany({ where: { eventId: { in: ids } } }),
      this.prisma.outboxMessage.deleteMany({ where: { id: { in: ids } } }),
    ]);
    return messages.count;
  }
}

/** La règle, en SQL : la même que `isOutboxMessagePurgeable`. */
function eligible(cutoff: Date): Prisma.Sql {
  return Prisma.sql`
    o.occurred_at < ${cutoff}::timestamptz
    AND EXISTS (SELECT 1 FROM platform.outbox_delivery d WHERE d.event_id = o.id)
    AND NOT EXISTS (
      SELECT 1 FROM platform.outbox_delivery d
      WHERE d.event_id = o.id
        AND (d.delivered_at IS NULL OR d.delivered_at >= ${cutoff}::timestamptz)
    )
  `;
}
