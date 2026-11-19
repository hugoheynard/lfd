import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { isUniqueViolation } from "../../../shared/json-readers.js";
import { VatRate, type VatRateSnapshot } from "../domain/entities/vat-rate.js";
import { VatRateConflictError } from "../domain/errors/vat-rate-errors.js";
import { VatRateRepository } from "../domain/ports/vat-rate.repository.js";

interface VatRateRow {
  id: string;
  name: string;
  description: string;
  percent: number;
  archivedAt: Date | null;
}

function toRegime(row: VatRateRow): VatRate {
  return VatRate.reconstitute({
    id: row.id,
    name: row.name,
    description: row.description,
    percent: row.percent,
    archivedAt: row.archivedAt,
  });
}

/**
 * Les colonnes qu'une édition écrit. `archived_at` n'en est pas : seul
 * `saveArchival` l'écrit, sous verrou — sinon une édition chargée avant une
 * archive et écrite après la déferait.
 */
function toColumns(snapshot: VatRateSnapshot) {
  return {
    name: snapshot.name,
    description: snapshot.description,
    percent: snapshot.percent,
  };
}

@Injectable()
export class PrismaVatRateRepository extends VatRateRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async listAll(): Promise<VatRate[]> {
    const rows = await this.prisma.vatRate.findMany({ orderBy: [{ percent: "asc" }] });
    return rows.map(toRegime);
  }

  async findById(id: string): Promise<VatRate | null> {
    const row = await this.prisma.vatRate.findUnique({ where: { id } });
    return row === null ? null : toRegime(row);
  }

  async findByPercent(percent: number): Promise<VatRate | null> {
    const row = await this.prisma.vatRate.findUnique({ where: { percent } });
    return row === null ? null : toRegime(row);
  }

  async add(rate: VatRate): Promise<void> {
    const snapshot = rate.snapshot();
    await this.write(snapshot.percent, () =>
      this.prisma.vatRate.create({
        data: { id: snapshot.id, ...toColumns(snapshot), archivedAt: snapshot.archivedAt },
      }),
    );
  }

  async save(rate: VatRate): Promise<void> {
    const snapshot = rate.snapshot();
    await this.write(snapshot.percent, () =>
      this.prisma.vatRate.update({ where: { id: snapshot.id }, data: toColumns(snapshot) }),
    );
  }

  async saveArchival(rate: VatRate): Promise<void> {
    const { id, archivedAt } = rate.snapshot();
    await this.prisma.vatRate.update({ where: { id }, data: { archivedAt } });
  }

  /**
   * Le **dernier mot** sur l'unicité du taux.
   *
   * Le handler regarde d'abord s'il existe (`ensureRateFree`), mais entre ce
   * regard et l'écriture il y a un intervalle : deux onglets qui créent 5,5 %
   * en même temps passent tous deux la vérification. L'index unique tranche —
   * et sans ce filet, le second recevait une erreur Prisma brute au lieu de la
   * phrase qui explique.
   */
  private async write(percent: number, action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new VatRateConflictError(percent);
      }
      throw error;
    }
  }
}
