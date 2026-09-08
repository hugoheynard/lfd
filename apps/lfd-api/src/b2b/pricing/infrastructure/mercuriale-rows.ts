import { CompanyMercuriale } from "../domain/entities/company-mercuriale.js";
import type {
  CompanyMercurialeState,
  MercurialeLine,
} from "../domain/entities/company-mercuriale.js";
import { CorruptedMercurialeError } from "../domain/pricing-errors.js";
import type { PricingTier } from "../domain/pricing-grid.js";

/**
 * **La ligne de base → l'agrégat.**
 *
 * La grille arrive en `jsonb`, c'est-à-dire en `unknown` : Prisma ne sait pas
 * plus que Postgres ce qu'il y a dedans. Elle est donc **vérifiée**, pas castée
 * — un `as MercurialeLine[]` aurait laissé une grille corrompue traverser la
 * frontière et sortir en prix.
 *
 * `reconstitute` ne revalide pas la cohérence de la grille (paliers décroissants,
 * SKU unique) : ce qui est en base y est déjà passé. Ce qui est vérifié ici est
 * la **forme**, qu'aucune écriture ne garantit contre une main dans la table.
 */
export function mercurialeFromRow(row: {
  readonly id: string;
  readonly companyId: string;
  readonly label: string;
  readonly lines: unknown;
  readonly validFrom: Date;
  readonly validTo: Date | null;
  readonly createdBy: string;
  readonly pausedAt: Date | null;
  readonly pausedBy: string | null;
  readonly archivedAt: Date | null;
  readonly archivedBy: string | null;
  readonly archiveReason: string | null;
}): CompanyMercuriale {
  const state: CompanyMercurialeState = {
    id: row.id,
    companyId: row.companyId,
    label: row.label,
    lines: linesFromJson(row.id, row.lines),
    validFrom: row.validFrom,
    validTo: row.validTo,
    createdBy: row.createdBy,
    lifecycle: {
      pausedAt: row.pausedAt,
      pausedBy: row.pausedBy,
      archivedAt: row.archivedAt,
      archivedBy: row.archivedBy,
      archiveReason: row.archiveReason,
    },
  };
  return CompanyMercuriale.reconstitute(state);
}

/** La grille du `jsonb`, vérifiée forme par forme. */
function linesFromJson(id: string, value: unknown): readonly MercurialeLine[] {
  if (!Array.isArray(value)) {
    throw new CorruptedMercurialeError(id, "la grille n'est pas un tableau");
  }
  return value.map((line) => lineFromJson(id, line));
}

function lineFromJson(id: string, value: unknown): MercurialeLine {
  if (typeof value !== "object" || value === null) {
    throw new CorruptedMercurialeError(id, "une ligne n'est pas un objet");
  }
  const line: Record<string, unknown> = { ...value };
  const { sku, tiers } = line;
  if (typeof sku !== "string" || !Array.isArray(tiers)) {
    throw new CorruptedMercurialeError(id, "une ligne n'a pas de `sku` ou pas de `tiers`");
  }
  return { sku, tiers: tiers.map((tier) => tierFromJson(id, tier)) };
}

function tierFromJson(id: string, value: unknown): PricingTier {
  if (typeof value !== "object" || value === null) {
    throw new CorruptedMercurialeError(id, "un palier n'est pas un objet");
  }
  const tier: Record<string, unknown> = { ...value };
  const { minQuantity, unitPriceMillicents } = tier;
  // `typeof` AVANT `Number.isInteger` : le second ne rétrécit pas `unknown`, et
  // sans le premier il faudrait un cast — c'est-à-dire rouvrir la porte que ce
  // fichier existe pour fermer.
  if (typeof minQuantity !== "number" || !Number.isInteger(minQuantity)) {
    throw new CorruptedMercurialeError(id, "un seuil de palier n'est pas un entier");
  }
  if (typeof unitPriceMillicents !== "number" || !Number.isInteger(unitPriceMillicents)) {
    throw new CorruptedMercurialeError(id, "un prix de palier n'est pas un entier");
  }
  return { minQuantity, unitPriceMillicents };
}
