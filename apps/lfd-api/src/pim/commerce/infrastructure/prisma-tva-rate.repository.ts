import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { TvaRate, type TvaRateSnapshot } from "../domain/entities/tva-rate.js";
import { TvaRateConflictError, TvaRateInUseError } from "../domain/errors/commerce-errors.js";
import { TvaRateRepository, type TvaRateUsage } from "../domain/ports/tva-rate.repository.js";

/** Violation de clé étrangère Prisma — le `23503` de Postgres, vu depuis l'ORM. */
function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2003";
}

/** Violation d'unicité Prisma — le `23505` de Postgres. Ici : deux fois le même taux. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

interface TvaRateRow {
  id: string;
  name: string;
  description: string;
  percent: number;
}

function toRegime(row: TvaRateRow): TvaRate {
  return TvaRate.reconstitute({
    id: row.id,
    name: row.name,
    description: row.description,
    percent: row.percent,
  });
}

/** Les colonnes que l'agrégat possède. */
function toColumns(snapshot: TvaRateSnapshot) {
  return {
    name: snapshot.name,
    description: snapshot.description,
    percent: snapshot.percent,
  };
}

@Injectable()
export class PrismaTvaRateRepository extends TvaRateRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async listAll(): Promise<TvaRate[]> {
    const rows = await this.prisma.tvaRate.findMany({ orderBy: [{ percent: "asc" }] });
    return rows.map(toRegime);
  }

  async findById(id: string): Promise<TvaRate | null> {
    const row = await this.prisma.tvaRate.findUnique({ where: { id } });
    return row === null ? null : toRegime(row);
  }

  async findByPercent(percent: number): Promise<TvaRate | null> {
    const row = await this.prisma.tvaRate.findUnique({ where: { percent } });
    return row === null ? null : toRegime(row);
  }

  async add(rate: TvaRate): Promise<void> {
    const snapshot = rate.snapshot();
    await this.write(snapshot.percent, () =>
      this.prisma.tvaRate.create({ data: { id: snapshot.id, ...toColumns(snapshot) } }),
    );
  }

  async save(rate: TvaRate): Promise<void> {
    const snapshot = rate.snapshot();
    await this.write(snapshot.percent, () =>
      this.prisma.tvaRate.update({ where: { id: snapshot.id }, data: toColumns(snapshot) }),
    );
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
        throw new TvaRateConflictError(percent);
      }
      throw error;
    }
  }

  /**
   * Les deux relations comptées côté base (`_count`), en une requête. Compter
   * en mémoire aurait demandé de charger toutes les familles pour n'en garder
   * que le nombre.
   */
  async usageByRegime(): Promise<ReadonlyMap<string, TvaRateUsage>> {
    const rows = await this.prisma.tvaRate.findMany({
      select: {
        id: true,
        _count: { select: { categoriesEmporter: true, categoriesSurPlace: true } },
      },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        { emporter: row._count.categoriesEmporter, surPlace: row._count.categoriesSurPlace },
      ]),
    );
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.tvaRate.delete({ where: { id } });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new TvaRateInUseError(id);
      }
      throw error;
    }
  }
}
