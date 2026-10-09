import type { ContactPhoneView, PublicContactPhoneView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ContactPhone } from "../domain/contact-phone.js";
import { ContactPhoneReader } from "../domain/ports/contact-phone.reader.js";
import { ContactPhoneRepository } from "../domain/ports/contact-phone.repository.js";

const ORDER = [{ position: "asc" as const }, { labelFr: "asc" as const }];

interface PhoneRow {
  readonly id: string;
  readonly labelFr: string;
  readonly labelEn: string;
  readonly labelIt: string;
  readonly number: string;
  readonly audience: "b2b" | "b2c" | "both";
  readonly position: number;
  readonly active: boolean;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const labelOf = (row: Pick<PhoneRow, "labelFr" | "labelEn" | "labelIt">) => ({
  fr: row.labelFr,
  en: row.labelEn,
  it: row.labelIt,
});

/** Adaptateur Prisma de l'écriture des numéros : `upsert` du numéro entier. */
@Injectable()
export class PrismaContactPhoneRepository extends ContactPhoneRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(id: string): Promise<ContactPhone | null> {
    const row: PhoneRow | null = await this.prisma.contactPhone.findUnique({ where: { id } });
    return row === null ? null : ContactPhone.rehydrate({ ...row, label: labelOf(row) });
  }

  async save(phone: ContactPhone): Promise<void> {
    const state = phone.toPersistence();
    const row = {
      labelFr: state.label.fr,
      labelEn: state.label.en,
      labelIt: state.label.it,
      number: state.number,
      audience: state.audience,
      position: state.position,
      active: state.active,
      archivedAt: state.archivedAt,
      updatedAt: state.updatedAt,
    };
    await this.prisma.contactPhone.upsert({
      where: { id: state.id },
      create: { id: state.id, createdAt: state.createdAt, ...row },
      update: row,
    });
  }
}

/** Adaptateur Prisma de la lecture des numéros. */
@Injectable()
export class PrismaContactPhoneReader extends ContactPhoneReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<ContactPhoneView[]> {
    const rows = await this.prisma.contactPhone.findMany({
      where: { archivedAt: null },
      orderBy: ORDER,
    });
    return rows.map((row) => ({
      id: row.id,
      label: labelOf(row),
      number: row.number,
      audience: row.audience,
      position: row.position,
      active: row.active,
    }));
  }

  async published(): Promise<PublicContactPhoneView[]> {
    const rows = await this.prisma.contactPhone.findMany({
      where: { archivedAt: null, active: true },
      orderBy: ORDER,
      select: { labelFr: true, labelEn: true, labelIt: true, number: true, audience: true },
    });
    return rows.map((row) => ({ label: labelOf(row), number: row.number, audience: row.audience }));
  }
}
