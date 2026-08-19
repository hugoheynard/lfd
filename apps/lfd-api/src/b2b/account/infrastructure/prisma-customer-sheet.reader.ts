import { Injectable } from "@nestjs/common";
import { COMMERCIAL_TIMELINE_TYPES } from "@lfd/contracts";
import type { CustomerOrderLine, CustomerSheetView } from "@lfd/contracts";

import { OrderStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CustomerSheetReader } from "../domain/ports/customer-sheet.reader.js";
import { commercialTimeline } from "../domain/services/commercial-timeline.js";
import { averageTicket, spendTrend, trendWindows } from "../domain/services/customer-stats.js";
import { companyStatusOf } from "./company-status.js";

/** Combien de commandes récentes la fiche montre — de quoi ouvrir la conversation. */
const RECENT_ORDERS = 8;

/**
 * Combien d'interactions l'historique remonte. Borné : au-delà, on ne relit plus
 * avant un appel — on fouille, et ce n'est pas ce que cette colonne sert à faire.
 */
const TIMELINE_ENTRIES = 30;

/**
 * Ce qui **compte comme du chiffre** : tout sauf les annulées et les brouillons.
 * Une commande annulée n'a jamais été de l'argent ; un brouillon ne l'est pas
 * encore. Les compter gonflerait le total et fausserait le panier moyen.
 */
const REVENUE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.placed,
  OrderStatus.confirmed,
  OrderStatus.in_production,
  OrderStatus.fulfilled,
];

/**
 * Lecture Prisma de la fiche client. Les agrégats sont demandés à **Postgres**
 * (`aggregate` / `count`), pas calculés en mémoire : un compte à quatre ans de
 * commandes ne doit pas traverser le réseau pour qu'on en fasse une somme.
 */
@Injectable()
export class PrismaCustomerSheetReader extends CustomerSheetReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(companyId: string, now: Date): Promise<CustomerSheetView | null> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (company === null) {
      return null;
    }
    const { since, previousSince } = trendWindows(now);
    const revenue = { companyId, status: { in: [...REVENUE_STATUSES] } };
    const [all, last30, previous30, recurringBasketsCount, recentOrders, timeline] =
      await Promise.all([
        this.prisma.order.aggregate({ where: revenue, _sum: { totalCents: true }, _count: true }),
        this.sumBetween(revenue, since, now),
        this.sumBetween(revenue, previousSince, since),
        this.countRecurringBaskets(companyId),
        this.prisma.order.findMany({
          where: { companyId },
          orderBy: { createdAt: "desc" },
          take: RECENT_ORDERS,
          select: { id: true, orderNumber: true, createdAt: true, status: true, totalCents: true },
        }),
        // L'historique vient du JOURNAL, seule trace horodatée des interactions —
        // mais FILTRÉ au commercial : une reco affichée ou une étape technique
        // n'apprend rien avant un appel, et noie ce qui compte.
        this.prisma.activityEvent.findMany({
          where: {
            subjectType: "company",
            subjectId: companyId,
            type: { in: [...COMMERCIAL_TIMELINE_TYPES] },
          },
          orderBy: { occurredAt: "desc" },
          take: TIMELINE_ENTRIES,
          select: {
            id: true,
            type: true,
            occurredAt: true,
            actorType: true,
            actorName: true,
          },
        }),
      ]);

    const totalSpentCents = all._sum.totalCents ?? 0;
    return {
      companyId: company.id,
      reference: company.reference,
      raisonSociale: company.raisonSociale,
      enseigne: company.enseigne,
      nafCode: company.nafCode,
      status: companyStatusOf(company.status),
      createdAt: company.createdAt.toISOString(),
      activatedAt: company.activatedAt?.toISOString() ?? null,
      contactName: `${company.contactPrenom} ${company.contactNom}`.trim(),
      contactEmail: company.contactEmail,
      contactPhone: company.contactTelephone,
      stats: {
        totalSpentCents,
        ordersCount: all._count,
        recurringBasketsCount,
        averageTicketCents: averageTicket(totalSpentCents, all._count),
        trend: spendTrend(last30, previous30),
      },
      recentOrders: recentOrders.map(toOrderLine),
      timeline: commercialTimeline(timeline),
    };
  }

  /** La somme encaissée sur une fenêtre — bornes `[from, to[`. */
  private async sumBetween(
    where: { companyId: string; status: { in: OrderStatus[] } },
    from: Date,
    to: Date,
  ): Promise<number> {
    const result = await this.prisma.order.aggregate({
      where: { ...where, createdAt: { gte: from, lt: to } },
      _sum: { totalCents: true },
    });
    return result._sum.totalCents ?? 0;
  }

  /**
   * Les paniers récurrents **actifs** de la société.
   *
   * Passe par ses **membres** : un abonnement appartient à une personne, pas à
   * une société (cf. le modèle). Compter autrement — par la commande d'origine —
   * raterait tous ceux créés hors d'une commande d'entreprise.
   */
  private async countRecurringBaskets(companyId: string): Promise<number> {
    const members = await this.prisma.membership.findMany({
      where: { companyId },
      select: { userId: true },
    });
    if (members.length === 0) {
      return 0;
    }
    return this.prisma.subscription.count({
      where: { placedByUserId: { in: members.map((member) => member.userId) }, status: "active" },
    });
  }
}

function toOrderLine(row: {
  id: string;
  orderNumber: string;
  createdAt: Date;
  status: string;
  totalCents: number;
}): CustomerOrderLine {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    placedAt: row.createdAt.toISOString(),
    status: row.status,
    totalCents: row.totalCents,
  };
}
