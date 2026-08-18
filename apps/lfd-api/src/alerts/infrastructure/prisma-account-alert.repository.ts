import { alertKindSchema, type AccountAlertView, type AlertFinding } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { IdGenerator } from "../../infra/id/id-generator.js";
import { alertIdempotencyKey } from "../domain/evaluate-order.js";
import {
  AccountAlertRepository,
  type AlertToRecord,
} from "../domain/ports/account-alert.repository.js";

/** Une ligne `account_alerts`, vue d'ici seulement. */
interface AlertRow {
  readonly id: string;
  readonly companyId: string;
  readonly kind: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly occurredAt: Date;
  readonly findings: unknown;
  readonly acknowledgedAt: Date | null;
  readonly acknowledgedBy: string | null;
}

/**
 * Le journal des alertes.
 *
 * `record` s'appuie sur la **contrainte unique** plutôt que sur un « existe-t-il
 * déjà ? » applicatif : deux évaluations concurrentes de la même commande
 * gagneraient toutes les deux ce test avant d'écrire. `skipDuplicates` laisse la
 * base arbitrer, ce qu'elle est seule à savoir faire sans course.
 */
@Injectable()
export class PrismaAccountAlertRepository extends AccountAlertRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  async record(alerts: readonly AlertToRecord[]): Promise<void> {
    if (alerts.length === 0) {
      return;
    }
    await this.prisma.accountAlert.createMany({
      data: alerts.map((alert) => ({
        id: this.ids.next(),
        companyId: alert.companyId,
        kind: alert.kind,
        orderId: alert.orderId,
        orderNumber: alert.orderNumber,
        idempotencyKey: alertIdempotencyKey(alert.kind, alert.orderId),
        occurredAt: alert.occurredAt,
        // Prisma attend une valeur JSON, pas nos types : la sérialisation est
        // explicite plutôt que forcée par une assertion.
        findings: alert.findings.map((finding) => ({ ...finding })),
      })),
      skipDuplicates: true,
    });
  }

  async listForCompany(companyId: string): Promise<AccountAlertView[]> {
    const rows = await this.prisma.accountAlert.findMany({
      where: { companyId },
      orderBy: { occurredAt: "desc" },
      take: 200,
    });
    return rows.map((row) => toView(row)).filter(isKnown);
  }

  /**
   * Acquitter est **idempotent** et ne réécrit pas l'auteur d'origine : le `where`
   * exclut les alertes déjà acquittées. Deux clics ne changent pas qui a vu quoi.
   */
  async acknowledge(id: string, staffSub: string, at: Date): Promise<void> {
    await this.prisma.accountAlert.updateMany({
      where: { id, acknowledgedAt: null },
      data: { acknowledgedAt: at, acknowledgedBy: staffSub },
    });
  }

  async countUnacknowledged(): Promise<ReadonlyMap<string, number>> {
    const rows = await this.prisma.accountAlert.groupBy({
      by: ["companyId"],
      where: { acknowledgedAt: null },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.companyId, row._count._all]));
  }
}

function isKnown(view: AccountAlertView | null): view is AccountAlertView {
  return view !== null;
}

/** `null` = type inconnu : l'alerte ne désigne plus rien qu'on sache nommer. */
function toView(row: AlertRow): AccountAlertView | null {
  const kind = alertKindSchema.safeParse(row.kind);
  if (!kind.success) {
    return null;
  }
  return {
    id: row.id,
    kind: kind.data,
    companyId: row.companyId,
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    occurredAt: row.occurredAt.toISOString(),
    findings: readFindings(row.findings),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    acknowledgedBy: row.acknowledgedBy,
  };
}

/**
 * Les constats sont un **snapshot figé**, pas un modèle vivant : on les relit tels
 * qu'ils ont été écrits. Une forme inattendue rend une liste vide plutôt que de
 * faire échouer tout le journal — une alerte illisible ne doit pas cacher les
 * autres.
 */
function readFindings(raw: unknown): AlertFinding[] {
  return Array.isArray(raw) ? raw.filter(isFinding) : [];
}

function isFinding(value: unknown): value is AlertFinding {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate: Record<string, unknown> = { ...value };
  return typeof candidate["sku"] === "string" && typeof candidate["message"] === "string";
}
