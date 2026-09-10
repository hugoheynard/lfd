import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  BillableOrdersReader,
  type BillableCompany,
} from "../domain/ports/billable-orders.reader.js";

/**
 * L'assiette, en SQL, **écrite une seule fois**.
 *
 * ## Les quatre critères, et ce que chacun évite
 *
 * | Critère                        | Ce qu'il évite                                                  |
 * | ------------------------------ | ---------------------------------------------------------------- |
 * | `payment_status='not_required'`| prélever ce qui a déjà été réglé par carte                      |
 * | `total_cents > 0`              | 🔴 les commandes GRATUITES, qui sont aussi `not_required`        |
 * | `status <> 'cancelled'`        | prélever ce qui n'a rien produit                                |
 * | `created_at` dans la fenêtre   | compter deux fois, ou perdre, une commande de bord de cycle     |
 *
 * 🔴 `total_cents > 0` n'est PAS une optimisation. `Order.deferPayment()` est
 * appelé dès que `requiresCard && totalCents > 0` est faux : **toute commande à
 * zéro euro devient `not_required`**, terme ou pas. Sans cette borne, des
 * commandes gratuites entreraient dans le lot, dans le relevé du client et dans
 * l'export du comptable (vérifié le 2026-09-10 dans `place-order.handler.ts`).
 *
 * Avec elle, l'équivalence est exacte : `not_required ∧ total > 0` **si et
 * seulement si** la commande a été passée au compte. `company_id IS NOT NULL`
 * en découle — le compte se refuse à qui n'a pas de société — et n'est donc pas
 * un cinquième critère mais une conséquence ; l'écrire laisserait croire qu'on
 * le vérifie.
 *
 * ⚠️ Le terme mensuel de la société n'est **délibérément pas** consulté. Ce qui
 * rend une commande prélevable est la décision prise à SA passation, que la
 * commande porte déjà. Évaluer le crédit de la société à la clôture ferait
 * disparaître de l'assiette un mois de commandes livrées dès qu'on coupe un
 * client — c'est-à-dire précisément celui qu'on venait de couper (décision de
 * Hugo, 2026-09-10).
 */
@Injectable()
export class PrismaBillableOrdersReader extends BillableOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async billableBetween(from: Date, to: Date): Promise<readonly BillableCompany[]> {
    const rows = await this.prisma.order.groupBy({
      by: ["companyId"],
      where: {
        paymentStatus: "not_required",
        totalCents: { gt: 0 },
        status: { not: "cancelled" },
        companyId: { not: null },
        createdAt: { gte: from, lt: to },
      },
      _sum: { totalCents: true },
      _count: { _all: true },
    });

    const companies = await this.prisma.company.findMany({
      where: { id: { in: rows.flatMap((row) => (row.companyId === null ? [] : [row.companyId])) } },
      select: { id: true, raisonSociale: true },
    });
    const nameOf = new Map(companies.map((company) => [company.id, company.raisonSociale]));

    return rows.flatMap((row) => {
      const companyId = row.companyId;
      const companyName = companyId === null ? undefined : nameOf.get(companyId);
      if (companyId === null || companyName === undefined) {
        return [];
      }
      return [
        {
          companyId,
          companyName,
          orderCount: row._count._all,
          totalCents: row._sum.totalCents ?? 0,
        },
      ];
    });
  }
}
