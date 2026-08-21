import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CatalogItem, type CatalogItemState } from "../domain/entities/catalog-item.js";
import { CatalogItemRepository } from "../domain/ports/catalog-item.repository.js";

/** La ligne telle que Prisma la rend, décision jointe. Aucun type `Prisma.*` exporté. */
interface ItemRow {
  readonly sku: string;
  readonly productId: string;
  readonly productSku: string;
  readonly name: string;
  readonly kind: string;
  readonly categoryId: string;
  readonly priceCents: number;
  readonly weightGrams: number | null;
  readonly isDefault: boolean;
  readonly position: number;
  readonly vatRatePercent: { toNumber(): number } | null;
  readonly receivedAt: Date;
  readonly override: {
    readonly priceCents: number | null;
    readonly isHidden: boolean;
    readonly isFeatured: boolean;
    readonly decidedBy: string | null;
  } | null;
}

/**
 * Adaptateur d'écriture : il porte **les deux mappers** et rien d'autre.
 *
 * `toDomain` réhydrate l'agrégat ; `toPersistence()` (côté agrégat) rend l'état
 * à écrire. Aucune règle métier ici — pas même « ne pas recréer un article
 * existant » : c'est `refreshFromPim` qui la tient, dans le domaine.
 */
@Injectable()
export class PrismaCatalogItemRepository extends CatalogItemRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {
    super();
  }

  async load(sku: string): Promise<CatalogItem | null> {
    const row = await this.prisma.catalogItem.findUnique({
      where: { sku },
      include: { override: true },
    });
    return row === null ? null : toDomain(row);
  }

  async loadAll(): Promise<CatalogItem[]> {
    const rows = await this.prisma.catalogItem.findMany({ include: { override: true } });
    return rows.map(toDomain);
  }

  /**
   * Écrit les agrégats **dans une transaction**.
   *
   * Un catalogue à moitié écrit vend des articles à des prix qui n'ont jamais
   * été décidés ensemble ; l'atomicité n'est pas un confort ici.
   */
  async saveMany(items: readonly CatalogItem[]): Promise<void> {
    if (items.length === 0) {
      return;
    }
    const states = items.map((item) => item.toPersistence());
    // Le prix EFFECTIF déjà tracé, par SKU : c'est à lui qu'on compare pour
    // n'écrire une ligne d'historique que sur un vrai changement.
    const recorded = await this.lastRecordedPrices(states.map((state) => state.facts.sku));
    const recordedAt = this.clock.now();

    await this.prisma.$transaction(async (tx) => {
      for (const state of states) {
        const facts = factsRow(state);
        await tx.catalogItem.upsert({
          where: { sku: state.facts.sku },
          create: { sku: state.facts.sku, ...facts },
          update: facts,
        });

        if (state.decision === null) {
          // Plus aucune décision : on retire la ligne au lieu d'en écrire une
          // neutre. Sinon l'écran annoncerait une négociation qui n'existe plus.
          await tx.catalogItemOverride.deleteMany({ where: { sku: state.facts.sku } });
          continue;
        }

        const decision = {
          priceCents: state.decision.priceCents,
          isHidden: state.decision.isHidden,
          isFeatured: state.decision.isFeatured,
          decidedBy: state.decision.decidedBy,
        };
        await tx.catalogItemOverride.upsert({
          where: { sku: state.facts.sku },
          create: { sku: state.facts.sku, ...decision },
          update: decision,
        });
      }

      // **La trace du tarif, dans la MÊME transaction que le prix.**
      //
      // Ici et non chez les appelants : un push du PIM et une décision du
      // back-office aboutissent tous deux à `saveMany`, et c'est le seul point
      // par lequel ils passent. Un port d'écriture séparé aurait laissé écrire
      // un prix sans sa trace — au premier oubli, à la première branche
      // d'erreur, au premier chemin de rattrapage.
      const changes = states.flatMap((state) => {
        const effective = state.decision?.priceCents ?? state.facts.priceCents;
        // Inchangé ⇒ aucune ligne. Sans cette garde, un push de quatre-vingt-douze
        // articles identiques écrirait quatre-vingt-douze lignes à chaque
        // synchronisation, et l'historique serait illisible en une semaine.
        if (recorded.get(state.facts.sku) === effective) {
          return [];
        }
        return [
          {
            id: this.ids.next(),
            sku: state.facts.sku,
            productSku: state.facts.productSku,
            priceCents: effective,
            source: state.decision?.priceCents === undefined ? "pim" : "b2b",
            recordedAt,
          },
        ];
      });
      if (changes.length > 0) {
        await tx.catalogPriceHistory.createMany({ data: changes });
      }
    });
  }

  /** Le dernier prix tracé de chaque SKU — la référence du « a-t-il changé ? ». */
  private async lastRecordedPrices(skus: readonly string[]): Promise<ReadonlyMap<string, number>> {
    const rows = await this.prisma.catalogPriceHistory.findMany({
      where: { sku: { in: [...skus] } },
      orderBy: [{ sku: "asc" }, { recordedAt: "desc" }],
      distinct: ["sku"],
      select: { sku: true, priceCents: true },
    });
    return new Map(rows.map((row) => [row.sku, row.priceCents]));
  }

  async removeMany(skus: readonly string[]): Promise<void> {
    if (skus.length === 0) {
      return;
    }
    await this.prisma.catalogItem.deleteMany({ where: { sku: { in: [...skus] } } });
  }
}

/** Ligne ↔ agrégat. La décision absente devient « rien décidé », pas `undefined`. */
function toDomain(row: ItemRow): CatalogItem {
  return CatalogItem.reconstitute({
    facts: {
      sku: row.sku,
      productId: row.productId,
      productSku: row.productSku,
      name: row.name,
      kind: row.kind,
      categoryId: row.categoryId,
      priceCents: row.priceCents,
      weightGrams: row.weightGrams,
      isDefault: row.isDefault,
      position: row.position,
      // `Decimal` → `number` : le domaine ne connaît pas le type de l'ORM.
      vatRatePercent: row.vatRatePercent === null ? null : row.vatRatePercent.toNumber(),
      receivedAt: row.receivedAt,
    },
    decision:
      row.override === null
        ? null
        : {
            priceCents: row.override.priceCents,
            isHidden: row.override.isHidden,
            isFeatured: row.override.isFeatured,
            decidedBy: row.override.decidedBy,
          },
  });
}

/** Les colonnes de faits — celles qu'un push remplace, et elles seules. */
function factsRow(state: CatalogItemState) {
  const { facts } = state;
  return {
    productId: facts.productId,
    productSku: facts.productSku,
    name: facts.name,
    kind: facts.kind,
    categoryId: facts.categoryId,
    priceCents: facts.priceCents,
    weightGrams: facts.weightGrams,
    isDefault: facts.isDefault,
    position: facts.position,
    vatRatePercent: facts.vatRatePercent,
    receivedAt: facts.receivedAt,
  };
}
