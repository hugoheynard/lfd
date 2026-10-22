import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OwnEstablishment } from "../domain/entities/own-establishment.js";
import {
  EstablishmentCompaniesReader,
  type EstablishmentCompany,
} from "../domain/ports/establishment-companies.reader.js";
import { OwnEstablishmentRepository } from "../domain/ports/own-establishment.repository.js";
import {
  OwnEstablishmentsReader,
  type OwnEstablishmentRow,
} from "../domain/ports/own-establishments.reader.js";

/** Adaptateur d'écriture de nos établissements — une ligne par société, jamais supprimée. */
@Injectable()
export class PrismaOwnEstablishmentRepository extends OwnEstablishmentRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(companyId: string): Promise<OwnEstablishment | null> {
    const row = await this.prisma.ownEstablishment.findUnique({ where: { companyId } });
    if (row === null) {
      return null;
    }
    return OwnEstablishment.rehydrate({
      companyId: row.companyId,
      declared: { at: row.declaredAt, staffId: row.declaredByStaffId },
      withdrawn:
        row.withdrawnAt === null || row.withdrawnByStaffId === null
          ? null
          : { at: row.withdrawnAt, staffId: row.withdrawnByStaffId },
    });
  }

  async save(establishment: OwnEstablishment): Promise<void> {
    const state = establishment.toPersistence();
    const columns = {
      declaredAt: state.declared.at,
      declaredByStaffId: state.declared.staffId,
      withdrawnAt: state.withdrawn?.at ?? null,
      withdrawnByStaffId: state.withdrawn?.staffId ?? null,
    };
    await this.prisma.ownEstablishment.upsert({
      where: { companyId: state.companyId },
      create: { companyId: state.companyId, ...columns },
      update: columns,
    });
  }
}

/**
 * Une société, et si elle est des nôtres. `companies` se lit en lecture seule,
 * même bloc `b2b` (comme `PrismaCompanyLabelReader`).
 */
@Injectable()
export class PrismaEstablishmentCompaniesReader extends EstablishmentCompaniesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async companyOf(companyId: string): Promise<EstablishmentCompany | null> {
    const [company, establishment] = await Promise.all([
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, raisonSociale: true, status: true },
      }),
      this.prisma.ownEstablishment.findUnique({
        where: { companyId },
        select: { withdrawnAt: true },
      }),
    ]);
    if (company === null) {
      return null;
    }
    return {
      companyId: company.id,
      name: company.raisonSociale,
      status: company.status,
      declared: establishment !== null && establishment.withdrawnAt === null,
    };
  }
}

/** La liste des établissements déclarés, par raison sociale. */
@Injectable()
export class PrismaOwnEstablishmentsReader extends OwnEstablishmentsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly OwnEstablishmentRow[]> {
    const rows = await this.prisma.ownEstablishment.findMany({ where: { withdrawnAt: null } });
    const companies = await this.prisma.company.findMany({
      where: { id: { in: rows.map((row) => row.companyId) } },
      select: { id: true, raisonSociale: true, status: true },
    });
    const byId = new Map(companies.map((company) => [company.id, company]));
    return rows
      .flatMap((row) => {
        const company = byId.get(row.companyId);
        return company === undefined
          ? []
          : [
              {
                companyId: row.companyId,
                companyName: company.raisonSociale,
                companyStatus: company.status,
                declaredAt: row.declaredAt,
                declaredByStaffId: row.declaredByStaffId,
              },
            ];
      })
      .sort((a, b) => a.companyName.localeCompare(b.companyName, "fr"));
  }
}
