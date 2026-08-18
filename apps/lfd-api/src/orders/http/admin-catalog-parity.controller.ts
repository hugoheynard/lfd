import { Controller, Get, UseGuards } from "@nestjs/common";

import { CatalogReader } from "../../catalog/domain/ports/catalog.reader.js";
import { compareCatalogs, type ParityReport } from "../../catalog/domain/catalog-parity.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { RecomputeGuard } from "../../infra/auth/recompute.guard.js";
import { SeededProductCatalog } from "../infrastructure/seeded-product-catalog.js";

/**
 * **Le feu vert de la bascule** : ce que le checkout facture aujourd'hui, comparé
 * à ce qu'il facturerait demain.
 *
 * Il compare les deux **implémentations réelles** plutôt que deux constantes :
 * le seed tel que le checkout le résout, et le catalogue reçu tel que la
 * boutique le lirait. Une comparaison sur les fichiers sources prouverait que
 * deux tableaux se ressemblent, pas que la caisse rendrait la même monnaie.
 *
 * Vit dans `orders/` parce que c'est ce contexte qui détenait l'autorité de prix
 * en place ; il lit le port du catalogue reçu, exporté par `CatalogModule`. La
 * dépendance va donc dans un seul sens, sans cycle.
 *
 * Il injecte `SeededProductCatalog` **par sa classe** et non par le port : depuis
 * la bascule, le port rend le catalogue reçu, et passer par lui ferait comparer
 * la base à elle-même — un rapport toujours vert, donc inutile.
 *
 * Derrière `RecomputeGuard`, comme les autres outils d'exploitation : le jeton
 * étant en écriture seule dans GitHub, le chemin normal est un workflow.
 *
 * ⚠️ **Temporaire par construction.** Il meurt avec le seed, à la slice C7.
 */
@Controller("admin/catalog")
@Public()
@UseGuards(RecomputeGuard)
export class AdminCatalogParityController {
  constructor(
    private readonly seeded: SeededProductCatalog,
    private readonly received: CatalogReader,
  ) {}

  @Get("parity")
  async parity(): Promise<ParityReport> {
    const [seed, received] = await Promise.all([this.seeded.all(), this.received.listSellable()]);

    return compareCatalogs(
      seed.map((item) => ({
        sku: item.sku,
        name: item.name,
        unitPriceCents: item.unitPriceCents,
        vatRate: item.vatRate,
      })),
      received.map((item) => ({
        sku: item.sku,
        productSku: item.productSku,
        isDefault: item.isDefault,
        name: item.name,
        unitPriceCents: item.unitPriceCents,
        vatRate: item.vatRate,
      })),
    );
  }
}
