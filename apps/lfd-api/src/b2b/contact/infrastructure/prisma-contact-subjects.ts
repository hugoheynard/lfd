import type {
  ContactSubjectView,
  CustomerAudience,
  PublicContactSubjectView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ContactSubject } from "../domain/contact-subject.js";
import { ContactSubjectReader } from "../domain/ports/contact-subject.reader.js";
import { ContactSubjectRepository } from "../domain/ports/contact-subject.repository.js";

const ORDER = [{ position: "asc" as const }, { labelFr: "asc" as const }];

/** Ligne → objet : l'objet revalide son adresse à la réhydratation. */
function toDomain(row: {
  readonly id: string;
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
}): ContactSubject {
  return ContactSubject.rehydrate({
    id: row.id,
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

/** Adaptateur Prisma de l'écriture des objets : `upsert` de l'objet entier. */
@Injectable()
export class PrismaContactSubjectRepository extends ContactSubjectRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<ContactSubject | null> {
    const row = await this.prisma.contactSubject.findUnique({ where: { id } });
    return row === null ? null : toDomain(row);
  }

  async save(subject: ContactSubject): Promise<void> {
    const state = subject.toPersistence();
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
    await this.prisma.contactSubject.upsert({
      where: { id: state.id },
      create: { id: state.id, createdAt: state.createdAt, ...row },
      update: row,
    });
  }
}

/** Adaptateur Prisma de la lecture des objets. */
@Injectable()
export class PrismaContactSubjectReader extends ContactSubjectReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<ContactSubjectView[]> {
    const rows = await this.prisma.contactSubject.findMany({
      where: { archivedAt: null },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      id: row.id,
      label: { fr: row.labelFr, en: row.labelEn, it: row.labelIt },
      recipientEmail: row.recipientEmail,
      position: row.position,
      active: row.active,
      audience: row.audience,
      priority: row.priority,
    }));
  }

  async offeredTo(audience: CustomerAudience): Promise<PublicContactSubjectView[]> {
    const rows = await this.prisma.contactSubject.findMany({
      where: { archivedAt: null, active: true, audience: { in: [audience, "both"] } },
      orderBy: ORDER,
      select: { id: true, labelFr: true, labelEn: true, labelIt: true },
    });
    return rows.map((row) => ({
      id: row.id,
      label: { fr: row.labelFr, en: row.labelEn, it: row.labelIt },
    }));
  }
}
