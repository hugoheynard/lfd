import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { VatRate, type VatRateSnapshot } from "../domain/entities/vat-rate.js";
import { VatRateConflictError, VatRateInUseError } from "../domain/errors/commerce-errors.js";
import { VatRateRepository, type VatRateUsage } from "../domain/ports/vat-rate.repository.js";

/** Violation de clé étrangère Prisma — le `23503` de Postgres, vu depuis l'ORM. */
function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2003";
}

/** Violation d'unicité Prisma — le `23505` de Postgres. Ici : deux fois le même taux. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

interface VatRateRow {
  id: string;
  name: string;
  description: string;
  percent: number;
}

function toRegime(row: VatRateRow): VatRate {
  return VatRate.reconstitute({
    id: row.id,
    name: row.name,
    description: row.description,
    percent: row.percent,
  });
}

/** Les colonnes que l'agrégat possède. */
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
      this.prisma.vatRate.create({ data: { id: snapshot.id, ...toColumns(snapshot) } }),
    );
  }

  async save(rate: VatRate): Promise<void> {
    const snapshot = rate.snapshot();
    await this.write(snapshot.percent, () =>
      this.prisma.vatRate.update({ where: { id: snapshot.id }, data: toColumns(snapshot) }),
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
        throw new VatRateConflictError(percent);
      }
      throw error;
    }
  }

  /**
   * Les usages comptés **côté base** : deux `groupBy` — les familles et les
   * fiches qui dérogent — plus la table des contextes (trois lignes) pour nommer
   * les clés. Compter en mémoire aurait demandé de charger tout le catalogue
   * pour n'en garder que des nombres.
   */
  async usageByRegime(): Promise<ReadonlyMap<string, VatRateUsage>> {
    const [byFamily, byProduct, contexts] = await Promise.all([
      this.prisma.categoryContextVat.groupBy({
        by: ["vatRateId", "contextId"],
        _count: { _all: true },
      }),
      // Les DÉROGATIONS comptent aussi : un taux visé par une seule fiche ne se
      // supprime pas plus qu'un taux visé par une famille entière — la base
      // pose le même `RESTRICT`, et l'écran doit le dire avant le clic.
      this.prisma.productContextVat.groupBy({
        by: ["vatRateId", "contextId"],
        _count: { _all: true },
      }),
      this.prisma.salesContext.findMany({ select: { id: true, key: true } }),
    ]);
    const keyById = new Map(contexts.map((context) => [context.id, context.key]));

    const usage = new Map<string, Record<string, number>>();
    for (const row of [...byFamily, ...byProduct]) {
      const key = keyById.get(row.contextId);
      if (key === undefined) {
        // Une ligne dont le contexte a disparu ne se compte pas : la nommer
        // « inconnu » ferait apparaître un usage que l'écran ne sait pas
        // expliquer. La clé étrangère rend le cas théorique ; on ne s'y appuie
        // pas pour autant.
        continue;
      }
      const current = usage.get(row.vatRateId) ?? {};
      // On ADDITIONNE : familles et fiches visent le même taux dans le même
      // contexte, et le compte doit dire combien de décisions en dépendent.
      current[key] = (current[key] ?? 0) + row._count._all;
      usage.set(row.vatRateId, current);
    }
    return usage;
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.vatRate.delete({ where: { id } });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new VatRateInUseError(id);
      }
      throw error;
    }
  }
}
