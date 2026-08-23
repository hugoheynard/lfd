import { Injectable } from "@nestjs/common";
import type { PushReport, PushSummary, TaxCollectionsPass } from "@lfd/pim-contracts";

import { CatalogueReader } from "../../../catalogue/shared/domain/ports/catalogue-reader.js";
import type { ProductEditorialView } from "../../../catalogue/product/domain/ports/editorial-reader.js";
import type { ProductRecord } from "../../../catalogue/product/domain/ports/product.repository.js";
import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { ShopifyCollectionsService } from "../collections/collections.service.js";
import { tvaHandleOf } from "../collections/tva-handle.js";
import { TaxCollectionsPlan } from "../collections/tax-collections.plan.js";
import { DryRunShopifyDriver, LiveShopifyDriver, type ShopifyDriver } from "./driver.js";
import { ShopifyMembershipService, type MembershipOutcome } from "./membership.service.js";
import { fingerprint, projectProduct } from "./projection.js";
import { ACTIVE_SALES_CONTEXTS } from "./sales-context.js";
import { ShopifySnapshotService } from "./snapshot.service.js";
import { type ChannelMode, ShopifySettingsService } from "../shared/settings.service.js";

/** Le mode d'un pilote, dans le vocabulaire des snapshots (`dry-run` → `dry_run`). */
function snapshotMode(driver: ShopifyDriver): "live" | "dry_run" {
  return driver.mode === "live" ? "live" : "dry_run";
}

/** Note lisible sur l'appartenance TVA, ajoutée au message du rapport de push. */
function describeMembership(outcome: MembershipOutcome): string {
  const parts: string[] = [];
  if (outcome.joined.length > 0) {
    parts.push(`rangé dans ${outcome.joined.join(", ")}`);
  }
  if (outcome.missing.length > 0) {
    parts.push(`⚠ collection(s) absente(s) : ${outcome.missing.join(", ")}`);
  }
  return parts.length > 0 ? ` — ${parts.join(" ; ")}` : "";
}

@Injectable()
export class ShopifyPushService {
  constructor(
    private readonly catalogue: CatalogueReader,
    private readonly settings: ShopifySettingsService,
    private readonly dryRun: DryRunShopifyDriver,
    private readonly live: LiveShopifyDriver,
    private readonly prisma: PimPrismaService,
    private readonly snapshots: ShopifySnapshotService,
    private readonly membership: ShopifyMembershipService,
    private readonly collections: ShopifyCollectionsService,
    private readonly taxPlan: TaxCollectionsPlan,
  ) {}

  /**
   * Pousse (ou, en `preview`, **pré-pousse sans effet de bord**). Un pré-push projette
   * et rapporte ce qui partirait sans appeler la boutique ni rien écrire — l'aperçu
   * reste honnête même en `live`, là où le dry-run *de mode* écrirait le binding.
   */
  async push(productIds?: readonly string[], preview = false): Promise<PushSummary> {
    const { mode } = await this.settings.read();
    const driver = this.driverFor(mode);
    const products =
      productIds === undefined || productIds.length === 0
        ? await this.catalogue.publishable()
        : await this.catalogue.byIds(productIds);

    // AVANT les fiches : chacune se range dans la collection `tva-*` de son
    // taux, et le rangement échoue si la collection n'existe pas. Un pré-push
    // n'écrit rien, donc il ne la fait pas.
    const taxCollections = preview ? null : await this.ensureTaxCollections();

    // Une seule requête pour tout le lot : la fiche part avec ses textes, et un
    // produit sans éditorial part quand même (la couche est optionnelle).
    const editorials = await this.catalogue.editorials(products.map((product) => product.id));

    const results: PushReport[] = [];
    for (const product of products) {
      const editorial = editorials.get(product.id) ?? null;
      results.push(
        preview
          ? await this.previewOne(product, editorial)
          : await this.pushOne(product, editorial, driver),
      );
    }

    // Un pré-push n'atteint jamais la boutique : le mode rapporté est `dry-run`.
    return { mode: preview ? "dry-run" : mode, results, taxCollections };
  }

  /**
   * Crée les collections de taxe qui manquent, dérivées du référentiel.
   *
   * Elle **ne fait pas échouer** la publication : une collection absente dégrade
   * le rangement d'une fiche (le rapport de push le dit déjà), elle n'invalide
   * pas la fiche. Faire tomber tout un envoi sur un aléa réseau côté collections
   * coûterait plus cher que le rangement qu'on essaie de sauver.
   */
  private async ensureTaxCollections(): Promise<TaxCollectionsPass> {
    try {
      const { created } = await this.collections.push(await this.taxPlan.desired());
      return { created: created.map((collection) => collection.handle), error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Échec inattendu.";
      return { created: [], error: message };
    }
  }

  /**
   * Ce qui partirait pour un produit — **sans effet de bord** : projette, compare à
   * l'empreinte du dernier push, et ne touche ni réseau, ni binding, ni snapshot.
   */
  private async previewOne(
    product: ProductRecord,
    editorial: ProductEditorialView | null,
  ): Promise<PushReport> {
    const payload = projectProduct(product, editorial);
    const hash = fingerprint(payload);
    const existing = await this.prisma.shopifyProductBinding.findUnique({
      where: { productId: product.id },
      select: { lastPushedHash: true },
    });

    if (existing?.lastPushedHash === hash) {
      return {
        productId: product.id,
        sku: product.sku,
        outcome: "unchanged",
        message: "Déjà à jour — rien ne partirait.",
      };
    }

    return {
      productId: product.id,
      sku: product.sku,
      outcome: "pushed",
      message: `Partirait : « ${payload.handle} » (${payload.status}). Aucun appel, rien écrit.`,
    };
  }

  /**
   * Rejeu d'un snapshot antérieur — le retour arrière. Re-pousse *exactement* le payload
   * figé de la version ciblée (ce qui crée une nouvelle version : l'historique ne se
   * réécrit jamais). N'efface rien ; le PIM reste l'autorité, donc rétablir écrase l'état
   * distant courant — l'écran le signale quand une dérive boutique est présente.
   */
  async rollback(handle: string, version: number): Promise<PushReport> {
    const snapshot = await this.snapshots.load(handle, version);
    const { mode } = await this.settings.read();
    const driver = this.driverFor(mode);
    const hash = fingerprint(snapshot.payload);
    const sku = await this.skuOf(snapshot.productId, handle);

    try {
      const result = await driver.push(snapshot.payload);
      const fresh = await this.snapshots.record({
        handle,
        productId: snapshot.productId,
        hash,
        payload: snapshot.payload,
        mode: snapshotMode(driver),
        outcome: "pushed",
      });
      await this.updateProductBinding(snapshot.productId, {
        hash,
        productGid: result.productGid,
        headSnapshotId: driver.mode === "live" ? fresh.id : null,
      });
      return {
        productId: snapshot.productId,
        sku,
        outcome: "pushed",
        message:
          driver.mode === "dry-run"
            ? `Rollback simulé vers v${version} (aucun appel réseau).`
            : `Rétabli sur la version v${version}.`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Échec inattendu.";
      await this.recordFailure(snapshot.productId, message);
      return { productId: snapshot.productId, sku, outcome: "failed", message };
    }
  }

  /** Le pilote réel seulement en mode `live` ; sinon la simulation (aucun appel). */
  private driverFor(mode: ChannelMode): ShopifyDriver {
    return mode === "live" ? this.live : this.dryRun;
  }

  /**
   * Un produit à la fois, en séquence : les canaux imposent des quotas d'appels, et une
   * rafale parallèle se ferait étrangler. À volume de boulangerie, la lenteur est
   * invisible ; l'étranglement, non.
   */
  private async pushOne(
    product: ProductRecord,
    editorial: ProductEditorialView | null,
    driver: ShopifyDriver,
  ): Promise<PushReport> {
    const payload = projectProduct(product, editorial);
    const hash = fingerprint(payload);

    const existing = await this.prisma.shopifyProductBinding.findUnique({
      where: { productId: product.id },
      select: { lastPushedHash: true },
    });

    // Ne pas repousser l'identique : c'est ce que l'empreinte achète.
    if (existing?.lastPushedHash === hash) {
      return {
        productId: product.id,
        sku: product.sku,
        outcome: "unchanged",
        message: "Déjà à jour.",
      };
    }

    try {
      const result = await driver.push(payload);
      // Un snapshot par poussée réussie (audit + historique), mais le head/BASE
      // n'avance qu'en `live` : une simulation n'est pas la vérité boutique.
      const snapshot = await this.snapshots.record({
        handle: payload.handle,
        productId: product.id,
        hash,
        payload,
        mode: snapshotMode(driver),
        outcome: "pushed",
      });
      await this.recordSuccess(
        product,
        hash,
        result.productGid,
        driver.mode === "live" ? snapshot.id : null,
      );

      // L'appartenance TVA (live) : un échec ici NE fait PAS échouer le push — le
      // produit est bien poussé, seul le rangement en collection a raté. On le dit.
      const note = await this.membershipNote(product, driver, result.productGid);

      return {
        productId: product.id,
        sku: product.sku,
        outcome: "pushed",
        message:
          (driver.mode === "dry-run" ? "Simulé (aucun appel réseau)." : "Poussé vers Shopify.") +
          note,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Échec inattendu.";
      await this.recordFailure(product.id, message);

      return {
        productId: product.id,
        sku: product.sku,
        outcome: "failed",
        message,
      };
    }
  }

  /**
   * Range le produit dans la collection `tva-*` de chaque contexte actif (live seulement),
   * et renvoie une note pour le rapport. Ses erreurs sont **capturées ici** : le produit
   * est déjà poussé, un rangement raté ne doit pas transformer le push en échec.
   */
  private async membershipNote(
    product: ProductRecord,
    driver: ShopifyDriver,
    productGid: string | null,
  ): Promise<string> {
    if (driver.mode !== "live" || productGid === null) {
      return "";
    }
    try {
      const rates = await this.catalogue.tvaPercents(product.categoryId);
      // Le handle se dérive ICI, chez le canal qui range par collection — le
      // catalogue ne rend qu'un taux.
      const tags = ACTIVE_SALES_CONTEXTS.flatMap((context) => {
        const percent = context.pick(rates);
        return percent === null ? [] : [tvaHandleOf(percent)];
      });
      return describeMembership(await this.membership.assign(productGid, tags));
    } catch (error) {
      const message = error instanceof Error ? error.message : "échec";
      return ` — ⚠ appartenance TVA échouée : ${message}`;
    }
  }

  private async recordSuccess(
    product: ProductRecord,
    hash: string,
    productGid: string | null,
    headSnapshotId: string | null,
  ): Promise<void> {
    await this.updateProductBinding(product.id, {
      hash,
      productGid,
      headSnapshotId,
    });

    // Les déclinaisons obtiennent leur ligne de binding même sans référence propre :
    // c'est elle qui portera le PLU ou l'identifiant distant le jour venu.
    for (const variant of product.variants) {
      await this.prisma.shopifyVariantBinding.upsert({
        where: { variantId: variant.id },
        create: { variantId: variant.id },
        update: {},
      });
    }
  }

  private async updateProductBinding(
    productId: string,
    fields: {
      hash: string;
      productGid: string | null;
      headSnapshotId: string | null;
    },
  ): Promise<void> {
    const data = {
      lastPushedHash: fields.hash,
      lastPushedAt: new Date(),
      syncStatus: "up_to_date" as const,
      lastError: null,
      ...(fields.productGid === null ? {} : { shopifyProductGid: fields.productGid }),
      ...(fields.headSnapshotId === null ? {} : { headSnapshotId: fields.headSnapshotId }),
    };

    await this.prisma.shopifyProductBinding.upsert({
      where: { productId },
      create: { productId, ...data },
      update: data,
    });
  }

  private async recordFailure(productId: string, message: string): Promise<void> {
    const data = { syncStatus: "failed" as const, lastError: message };
    await this.prisma.shopifyProductBinding.upsert({
      where: { productId },
      create: { productId, ...data },
      update: data,
    });
  }

  /** SKU courant du produit pour l'affichage du rapport ; à défaut, le handle. */
  private async skuOf(productId: string, fallback: string): Promise<string> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { sku: true },
    });
    return product?.sku ?? fallback;
  }
}
