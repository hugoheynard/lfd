import type {
  CustomerAudience,
  PublicRequestReasonView,
  RequestKind,
  RequestReasonView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { RequestReason } from "../domain/request-reason.js";
import { RequestReasonReader } from "../domain/ports/request-reason.reader.js";
import { RequestReasonRepository } from "../domain/ports/request-reason.repository.js";

const ORDER = [{ position: "asc" as const }, { labelFr: "asc" as const }];

interface ReasonRow {
  readonly id: string;
  readonly kind: RequestKind;
  readonly labelFr: string;
  readonly labelEn: string;
  readonly labelIt: string;
  readonly recipientEmail: string;
  readonly position: number;
  readonly active: boolean;
  readonly audience: "b2b" | "b2c" | "both";
  readonly priority: "low" | "medium" | "urgent";
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Ligne → motif : le motif revalide son type et son adresse à la réhydratation. */
function toDomain(row: ReasonRow): RequestReason {
  return RequestReason.rehydrate({
    id: row.id,
    kind: row.kind,
    label: { fr: row.labelFr, en: row.labelEn, it: row.labelIt },
    recipientEmail: row.recipientEmail,
    position: row.position,
    active: row.active,
    audience: row.audience,
    priority: row.priority,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

/**
 * Adaptateur Prisma de l'écriture des motifs : `upsert` du motif entier. Le
 * `kind` n'est écrit qu'à la création — le domaine refuse déjà qu'il change ;
 * l'adaptateur ne lui donne pas l'occasion d'essayer.
 */
@Injectable()
export class PrismaRequestReasonRepository extends RequestReasonRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<RequestReason | null> {
    const row = await this.prisma.requestReason.findUnique({ where: { id } });
    return row === null ? null : toDomain(row);
  }

  async save(reason: RequestReason): Promise<void> {
    const state = reason.toPersistence();
    const row = {
      labelFr: state.label.fr,
      labelEn: state.label.en,
      labelIt: state.label.it,
      recipientEmail: state.recipientEmail.value,
      position: state.position,
      active: state.active,
      audience: state.audience,
      priority: state.priority,
      archivedAt: state.archivedAt,
      updatedAt: state.updatedAt,
    };
    await this.prisma.requestReason.upsert({
      where: { id: state.id },
      create: { id: state.id, kind: state.kind, createdAt: state.createdAt, ...row },
      update: row,
    });
  }
}

/** Adaptateur Prisma de la lecture des motifs. */
@Injectable()
export class PrismaRequestReasonReader extends RequestReasonReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(kind: RequestKind): Promise<RequestReasonView[]> {
    const rows = await this.prisma.requestReason.findMany({
      where: { kind, archivedAt: null },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      label: { fr: row.labelFr, en: row.labelEn, it: row.labelIt },
      recipientEmail: row.recipientEmail,
      position: row.position,
      active: row.active,
      audience: row.audience,
      priority: row.priority,
    }));
  }

  async offered(kind: RequestKind, audience: CustomerAudience): Promise<PublicRequestReasonView[]> {
    const rows = await this.prisma.requestReason.findMany({
      where: { kind, archivedAt: null, active: true, audience: { in: [audience, "both"] } },
      orderBy: ORDER,
      select: { id: true, labelFr: true, labelEn: true, labelIt: true },
    });
    return rows.map((row) => ({
      id: row.id,
      label: { fr: row.labelFr, en: row.labelEn, it: row.labelIt },
    }));
  }
}
