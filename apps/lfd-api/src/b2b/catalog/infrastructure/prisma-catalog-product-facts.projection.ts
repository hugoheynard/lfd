import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  awaitsReview,
  entryVariantsOf,
  type ReceivedCatalogItem,
  type ReceivedCatalogProduct,
} from "../domain/catalog-product-facts.js";
import type { PimFacts } from "../domain/entities/catalog-item.js";
import type { ReceivedCatalogFamily } from "../domain/ports/catalog-family-facts.projection.js";
import { CatalogProductFactsProjection } from "../domain/ports/catalog-product-facts.projection.js";
import type { CatalogAudience } from "../domain/served-to.js";
import { pimFactsColumns } from "./catalog-item-columns.js";
import { upsertCatalogItems } from "./catalog-item-upsert.js";
import { lastRecordedPrices, priceTraceRows } from "./catalog-price-trace.js";
import { STILL_SOLD } from "./sellable-filter.js";

/**
 * L'adaptateur du récepteur des faits d'une fiche.
 *
 * 🔴 **Il n'écrit JAMAIS `catalog_item_overrides`**, et ne passe pas par
 * `PrismaCatalogItemRepository.saveMany`, qui réécrit les décisions locales
 * de l'agrégat (les remet à faux quand il n'en porte plus, sans supprimer de
 * ligne depuis le lot D — vérifié le 2026-10-17) : un fait réécrit les
 * colonnes reçues du référentiel, rien d'autre. Les colonnes viennent de
 * `pimFactsColumns`, la liste partagée avec l'agrégat.
 *
 * Les limites de commande ne sont pas écrites ici sur un article existant : ce
 * sont des RÈGLES globales qui voyagent à part (C3, `pim.catalog_rules_changed`
 * depuis le lot 2b), et le récepteur les descend après cette écriture
 * (`OrderLimitsRefresher`). Les remettre à `null` ici effacerait ce que le push
 * a posé quand aucune règle n'a encore été reçue.
 */
@Injectable()
export class PrismaCatalogProductFactsProjection extends CatalogProductFactsProjection {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {
    super();
  }

  async recordEntryIfNewer(product: ReceivedCatalogProduct): Promise<boolean> {
    // Une écriture CONDITIONNÉE en base, comme `showIfNewer` : la ligne est
    // verrouillée par l'`ON CONFLICT`, donc deux livraisons de la même fiche
    // passent l'une après l'autre, et la plus ancienne ne réécrit rien.
    const written = await this.prisma.$executeRaw`
      INSERT INTO public.catalog_entries
        (product_id, product_sku, name, category_id, status, audience, audience_inherited,
         gaps, variants, applied_seq, received_at)
      VALUES (${product.productId}, ${product.productSku}, ${product.name}, ${product.categoryId},
              ${product.status}, ${product.audience}, ${product.audienceInherited},
              ${JSON.stringify(product.gaps)}::jsonb,
              ${JSON.stringify(entryVariantsOf(product))}::jsonb,
              ${product.seq}, ${product.receivedAt})
      ON CONFLICT (product_id) DO UPDATE SET
        product_sku = EXCLUDED.product_sku,
        name = EXCLUDED.name,
        category_id = EXCLUDED.category_id,
        status = EXCLUDED.status,
        audience = EXCLUDED.audience,
        audience_inherited = EXCLUDED.audience_inherited,
        gaps = EXCLUDED.gaps,
        variants = EXCLUDED.variants,
        applied_seq = EXCLUDED.applied_seq,
        received_at = EXCLUDED.received_at
      WHERE public.catalog_entries.applied_seq < EXCLUDED.applied_seq`;
    return written > 0;
  }

  async ensureFamily(family: ReceivedCatalogFamily): Promise<void> {
    // `skipDuplicates` = `ON CONFLICT DO NOTHING` : une famille connue n'est
    // jamais réécrite d'ici, son fait à elle s'en charge sous son numéro.
    await this.prisma.catalogCategory.createMany({
      data: [
        {
          id: family.id,
          name: family.name,
          nameTranslations: family.nameTranslations ?? Prisma.DbNull,
          slug: family.slug,
          parentId: family.parentId,
          position: family.position,
          vatRatePercent: family.vatRatePercent,
          receivedAt: family.receivedAt,
          audience: family.audience,
          withdrawnAt: family.archived ? family.receivedAt : null,
        },
      ],
      skipDuplicates: true,
    });
  }

  async putOnSale(items: readonly ReceivedCatalogItem[], audience: CatalogAudience): Promise<void> {
    if (items.length === 0) {
      return;
    }
    // UN upsert pour toutes les déclinaisons : une instruction par article
    // allongeait la transaction de la livraison avec la fiche (P2028,
    // 2026-10-17). Les limites et l'attente ne s'écrivent qu'à la création.
    await upsertCatalogItems(
      this.prisma,
      items.map((facts) => ({
        sku: facts.sku,
        ...pimFactsColumns(facts),
        audience,
        variantId: facts.variantId,
        // Les traductions (lot des langues) : réécrites à chaque fait, `null`
        // compris — un fait d'avant elles dit « on ne sait pas », et la
        // vitrine sert alors le français jusqu'au suivant.
        nameTranslations: facts.nameTranslations,
        noteTranslations: facts.noteTranslations,
        withdrawnAt: null,
        publicReviewPending: awaitsReview(audience, "public"),
        proReviewPending: awaitsReview(audience, "pro"),
      })),
      // 🔴 À la CRÉATION seulement — premier SKU arrivé (lot 3) : un conflit ne
      // les réécrit pas, donc rien de ce qui existe ne repasse en attente, ni
      // une modification ni un élargissement d'audience. Les limites non plus :
      // elles descendent des règles (`OrderLimitsRefresher`), et les remettre
      // à `null` ici effacerait ce que le push a posé.
      [
        "publicReviewPending",
        "proReviewPending",
        "orderLimitDaysBefore",
        "orderLimitTime",
        "orderLimitGraceMinutes",
      ],
    );
    await this.tracePrices(items);
  }

  async withdrawOthers(productId: string, keptSkus: readonly string[], at: Date): Promise<void> {
    // Un `updateMany` conditionné plutôt qu'un aller-retour par l'agrégat : la
    // seule règle de `CatalogItem.withdraw` — ne pas repousser une date déjà
    // posée — est ici dans le `where` (`STILL_SOLD`), et la ligne de la fiche
    // est déjà verrouillée par l'entrée écrite plus haut.
    await this.prisma.catalogItem.updateMany({
      where: { productId, sku: { notIn: [...keptSkus] }, ...STILL_SOLD },
      data: { withdrawnAt: at },
    });
  }

  /** La trace du tarif, par la règle partagée — le prix du référentiel seul (lot D). */
  private async tracePrices(items: readonly PimFacts[]): Promise<void> {
    const recorded = await lastRecordedPrices(
      this.prisma,
      items.map((facts) => facts.sku),
    );
    const changes = priceTraceRows(
      items.map((facts) => ({
        sku: facts.sku,
        productSku: facts.productSku,
        pimPriceMillicents: facts.priceMillicents,
        vatRatePercent: facts.vatRatePercent,
      })),
      recorded,
      () => this.ids.next(),
      this.clock.now(),
    );
    if (changes.length > 0) {
      await this.prisma.catalogPriceHistory.createMany({ data: changes });
    }
  }
}
