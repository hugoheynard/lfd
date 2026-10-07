import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PaymentLink } from "../domain/entities/payment-link.js";
import { PaymentLinkRepository } from "../domain/ports/payment-link.repository.js";

/** Les colonnes que l'agrégat range — `select` explicite, pas la ligne entière. */
const LINK_SELECT = {
  id: true,
  companyId: true,
  amountCents: true,
  label: true,
  status: true,
  stripeSessionId: true,
  url: true,
  createdAt: true,
  createdByStaffId: true,
  paidAt: true,
  cancelledAt: true,
  cancelledByStaffId: true,
} as const;

/**
 * Adaptateur Prisma des liens libres : `load` → `reconstitute`, `save` ←
 * `toPersistence`. Aucune écriture de statut à partir de primitives.
 *
 * **Le mur est dans l'écriture** depuis le 2026-10-07 : `save` met à jour sous
 * `{ id, companyId }` et ne crée qu'à défaut. Un `id` déjà pris par une autre
 * société n'est jamais réécrit : sa création se heurte à la clé primaire
 * (`P2002`, 409 par `mapPersistenceError`). C'était un `upsert` sur le seul
 * `id` : le défaut B2 de `documentation/livraisons/audit-2026-10-07.md`,
 * retrouvé ici en le corrigeant ailleurs.
 */
@Injectable()
export class PrismaPaymentLinkRepository extends PaymentLinkRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<PaymentLink | null> {
    const row = await this.prisma.paymentLink.findUnique({ where: { id }, select: LINK_SELECT });
    return row === null ? null : PaymentLink.reconstitute(row);
  }

  async loadBySession(sessionId: string): Promise<PaymentLink | null> {
    const row = await this.prisma.paymentLink.findUnique({
      where: { stripeSessionId: sessionId },
      select: LINK_SELECT,
    });
    return row === null ? null : PaymentLink.reconstitute(row);
  }

  async save(link: PaymentLink): Promise<void> {
    const { id, ...columns } = link.toPersistence();
    const { count } = await this.prisma.paymentLink.updateMany({
      where: { id, companyId: columns.companyId },
      // Seul ce qu'une transition change : les termes et la session d'un lien
      // sont figés à sa création.
      data: {
        status: columns.status,
        paidAt: columns.paidAt,
        cancelledAt: columns.cancelledAt,
        cancelledByStaffId: columns.cancelledByStaffId,
      },
    });
    if (count === 0) {
      await this.prisma.paymentLink.create({ data: { id, ...columns } });
    }
  }
}
