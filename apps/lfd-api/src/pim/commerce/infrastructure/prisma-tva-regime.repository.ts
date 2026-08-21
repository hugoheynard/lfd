import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { TvaRegime, type TvaRegimeSnapshot } from "../domain/entities/tva-regime.js";
import { TvaRegimeInUseError } from "../domain/errors/commerce-errors.js";
import { TvaRegimeRepository, type TvaRegimeUsage } from "../domain/ports/tva-regime.repository.js";

/** Violation de clé étrangère Prisma — le `23503` de Postgres, vu depuis l'ORM. */
function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2003";
}

interface TvaRegimeRow {
  id: string;
  name: string;
  description: string;
  percent: number;
  tag: string;
}

function toRegime(row: TvaRegimeRow): TvaRegime {
  return TvaRegime.reconstitute({
    id: row.id,
    name: row.name,
    description: row.description,
    percent: row.percent,
    tag: row.tag,
  });
}

/** Les colonnes que l'agrégat possède — le `tag` en fait partie, mais dérivé. */
function toColumns(snapshot: TvaRegimeSnapshot) {
  return {
    name: snapshot.name,
    description: snapshot.description,
    percent: snapshot.percent,
    tag: snapshot.tag,
  };
}

@Injectable()
export class PrismaTvaRegimeRepository extends TvaRegimeRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async listAll(): Promise<TvaRegime[]> {
    const rows = await this.prisma.tvaRegime.findMany({ orderBy: [{ percent: "asc" }] });
    return rows.map(toRegime);
  }

  async findById(id: string): Promise<TvaRegime | null> {
    const row = await this.prisma.tvaRegime.findUnique({ where: { id } });
    return row === null ? null : toRegime(row);
  }

  async findByTag(tag: string): Promise<TvaRegime | null> {
    const row = await this.prisma.tvaRegime.findUnique({ where: { tag } });
    return row === null ? null : toRegime(row);
  }

  async add(regime: TvaRegime): Promise<void> {
    const snapshot = regime.snapshot();
    await this.prisma.tvaRegime.create({ data: { id: snapshot.id, ...toColumns(snapshot) } });
  }

  async save(regime: TvaRegime): Promise<void> {
    const snapshot = regime.snapshot();
    await this.prisma.tvaRegime.update({ where: { id: snapshot.id }, data: toColumns(snapshot) });
  }

  /**
   * Les deux relations comptées côté base (`_count`), en une requête. Compter
   * en mémoire aurait demandé de charger toutes les familles pour n'en garder
   * que le nombre.
   */
  async usageByRegime(): Promise<ReadonlyMap<string, TvaRegimeUsage>> {
    const rows = await this.prisma.tvaRegime.findMany({
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
      await this.prisma.tvaRegime.delete({ where: { id } });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new TvaRegimeInUseError(id);
      }
      throw error;
    }
  }
}
