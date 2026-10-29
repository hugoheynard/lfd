import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  SaleReferenceDecisionsReader,
  type StandingDecision,
} from "../domain/ports/sale-reference-decisions.reader.js";

/** Les portées qui nomment une référence (`saleReferenceOf`). */
const REFERENCE_SCOPES = ["product", "variant"];

/** La valeur d'audience d'une décision qui vise une société nommément. */
const COMPANY_AUDIENCE = "company";

/** Debout à `at` : non archivée, fenêtre ouverte ou close plus tard. */
function standingAt(at: Date) {
  return { archivedAt: null, OR: [{ validTo: null }, { validTo: { gt: at } }] };
}

/**
 * Les six tables de décisions, lues pour UNE référence. Les lectures ignorent
 * le mur tenant, et c'est le sujet : la question est posée par le staff, sur
 * un article, toutes sociétés confondues. Rien n'en sort qu'un nom, une
 * fenêtre et la société visée.
 *
 * Les grilles en `jsonb` (mercuriale, gabarit) se filtrent par
 * `array_contains` — la même lecture que `PrismaSaleReferenceUsage`.
 */
@Injectable()
export class PrismaSaleReferenceDecisionsReader extends SaleReferenceDecisionsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async standingOn(sku: string, at: Date): Promise<readonly StandingDecision[]> {
    const groups = await Promise.all([
      this.mercuriales(sku, at),
      this.rules(sku, at),
      this.floors(sku, at),
      this.ladders(sku, at),
      this.commitments(sku, at),
      this.templates(sku),
    ]);
    return groups.flat();
  }

  private async mercuriales(sku: string, at: Date): Promise<StandingDecision[]> {
    const rows = await this.prisma.companyMercuriale.findMany({
      where: { ...standingAt(at), lines: { array_contains: [{ sku }] } },
      orderBy: { validFrom: "asc" },
    });
    return rows.map((row) => ({
      kind: "mercuriale",
      id: row.id,
      label: row.label,
      companyId: row.companyId,
      validFrom: row.validFrom,
      validTo: row.validTo,
      paused: row.pausedAt !== null,
    }));
  }

  private async rules(sku: string, at: Date): Promise<StandingDecision[]> {
    const rows = await this.prisma.priceRule.findMany({
      where: { ...standingAt(at), scopeType: { in: REFERENCE_SCOPES }, scopeId: sku },
      orderBy: { validFrom: "asc" },
    });
    return rows.map((row) => ({
      kind: "price_rule",
      id: row.id,
      label: row.label,
      companyId: row.audienceType === COMPANY_AUDIENCE ? row.audienceId : null,
      validFrom: row.validFrom,
      validTo: row.validTo,
      paused: row.pausedAt !== null,
    }));
  }

  private async floors(sku: string, at: Date): Promise<StandingDecision[]> {
    const rows = await this.prisma.priceFloor.findMany({
      where: { ...standingAt(at), scopeType: { in: REFERENCE_SCOPES }, scopeId: sku },
      orderBy: { validFrom: "asc" },
    });
    return rows.map((row) => ({
      kind: "price_floor",
      id: row.id,
      // Un plancher n'a pas de nom saisi : sa clientèle le désigne.
      label: `Plancher ${row.clientele}`,
      companyId: null,
      validFrom: row.validFrom,
      validTo: row.validTo,
      paused: false,
    }));
  }

  private async ladders(sku: string, at: Date): Promise<StandingDecision[]> {
    const rows = await this.prisma.volumeLadder.findMany({
      where: { ...standingAt(at), scopeType: { in: REFERENCE_SCOPES }, scopeId: sku },
      orderBy: { validFrom: "asc" },
    });
    return rows.map((row) => ({
      kind: "volume_ladder",
      id: row.id,
      label: row.label,
      companyId: row.audienceType === COMPANY_AUDIENCE ? row.audienceId : null,
      validFrom: row.validFrom,
      validTo: row.validTo,
      paused: row.pausedAt !== null,
    }));
  }

  private async commitments(sku: string, at: Date): Promise<StandingDecision[]> {
    const rows = await this.prisma.volumeCommitment.findMany({
      where: {
        archivedAt: null,
        validTo: { gt: at },
        scopeType: { in: REFERENCE_SCOPES },
        scopeId: sku,
      },
      orderBy: { validFrom: "asc" },
    });
    return rows.map((row) => ({
      kind: "volume_commitment",
      id: row.id,
      label: `Engagement de ${String(row.promisedQuantity)}`,
      companyId: row.companyId,
      validFrom: row.validFrom,
      validTo: row.validTo,
      paused: false,
    }));
  }

  private async templates(sku: string): Promise<StandingDecision[]> {
    const rows = await this.prisma.priceTemplate.findMany({
      where: { archivedAt: null, lines: { array_contains: [{ sku }] } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      kind: "price_template",
      id: row.id,
      label: row.label,
      companyId: null,
      validFrom: null,
      validTo: null,
      paused: false,
    }));
  }
}
