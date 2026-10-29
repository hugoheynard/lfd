import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  SaleReferenceUsage,
  type SaleReferenceQuery,
  type SaleReferenceUse,
} from "../../../pim/channels/b2b-platform/sale-reference-usage/sale-reference-usage.js";
import { SaleSkuAliasReader } from "../domain/ports/sale-sku-alias.reader.js";
import { shopSkuOf } from "../domain/shop-sku.js";
import { usesBySpelling } from "./sale-reference-uses.js";

/** Les portées tarifaires qui nomment une référence (`saleReferenceOf`, pricing). */
const REFERENCE_SCOPES = ["product", "variant"];

type Lookup = (skus: readonly string[]) => Promise<ReadonlySet<string>>;

/**
 * **Où une référence de vente a déjà servi, dans le commerce** — l'implémentation
 * du port que le référentiel déclare (`plan-changer-l-unite-de-vente.md`, § 8).
 *
 * La référence se calcule par `shopSkuOf`, le seul point qui la décide — jamais
 * un SKU produit lu en direct. Les lectures ignorent le mur tenant, et c'est
 * le sujet : la question est « quelqu'un, n'importe où, l'a-t-il utilisée ? »,
 * posée par le référentiel pour figer une unité, pas par un client. Rien n'en
 * sort que des catégories : aucune société, aucun montant.
 *
 * Tout statut compte : une commande annulée ou un brouillon, une décision
 * close, un gabarit archivé ont été lus dans l'unité d'alors.
 *
 * Toutes les graphies comptent : la référence de vente ET ses anciennes
 * références (`sale_sku_alias`). Après la bascule, `PAI-001-1` a été vendue
 * dès qu'une ligne `PAI-001` existe — sans cela, son unité redeviendrait
 * modifiable (`plan-defaut-sous-sa-reference.md`, § 10, D-c).
 */
@Injectable()
export class PrismaSaleReferenceUsage extends SaleReferenceUsage {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliasReader: SaleSkuAliasReader,
  ) {
    super();
  }

  async usesOf(
    references: readonly SaleReferenceQuery[],
  ): Promise<ReadonlyMap<string, readonly SaleReferenceUse[]>> {
    const shopSkus = references.map((reference) => ({
      sku: reference.sku,
      shopSku: shopSkuOf(reference),
    }));
    const aliases = await this.aliasReader.around(shopSkus.map(({ shopSku }) => shopSku));
    const spellings = [...aliases.spellingsOfAll(shopSkus.map(({ shopSku }) => shopSku))];
    const found = await Promise.all(
      this.lookups().map(async ([use, lookup]) => [use, await lookup(spellings)] as const),
    );
    return usesBySpelling(shopSkus, found, aliases);
  }

  private lookups(): readonly (readonly [SaleReferenceUse, Lookup])[] {
    return [
      ["order", (skus) => this.scalar(this.prisma.orderLine, skus)],
      ["order_draft", (skus) => this.inPayloads(this.prisma.orderDraft, skus)],
      ["shop_cart", (skus) => this.inPayloads(this.prisma.shopCart, skus)],
      ["subscription", (skus) => this.scalar(this.prisma.subscriptionLine, skus)],
      ["resupply", (skus) => this.resupplies(skus)],
      ["bundle", (skus) => this.scalar(this.prisma.bundleChoice, skus)],
      ["price_template", (skus) => this.inLines(this.prisma.priceTemplate, skus)],
      ["price_rule", (skus) => this.scoped(this.prisma.priceRule, skus)],
      ["price_floor", (skus) => this.scoped(this.prisma.priceFloor, skus)],
      ["volume_ladder", (skus) => this.scoped(this.prisma.volumeLadder, skus)],
      ["mercuriale", (skus) => this.inLines(this.prisma.companyMercuriale, skus)],
      ["volume_commitment", (skus) => this.scoped(this.prisma.volumeCommitment, skus)],
    ];
  }

  /** Une table qui porte la référence dans une colonne `sku`. */
  private async scalar(
    table: {
      findMany(args: {
        where: { sku: { in: string[] } };
        select: { sku: true };
        distinct: "sku"[];
      }): Promise<readonly { readonly sku: string }[]>;
    },
    skus: readonly string[],
  ): Promise<ReadonlySet<string>> {
    const rows = await table.findMany({
      where: { sku: { in: [...skus] } },
      select: { sku: true },
      distinct: ["sku"],
    });
    return new Set(rows.map((row) => row.sku));
  }

  /** Une décision dont la portée nomme une référence, ouverte, suspendue ou close. */
  private async scoped(
    table: {
      findMany(args: {
        where: { scopeType: { in: string[] }; scopeId: { in: string[] } };
        select: { scopeId: true };
        distinct: "scopeId"[];
      }): Promise<readonly { readonly scopeId: string | null }[]>;
    },
    skus: readonly string[],
  ): Promise<ReadonlySet<string>> {
    const rows = await table.findMany({
      where: { scopeType: { in: REFERENCE_SCOPES }, scopeId: { in: [...skus] } },
      select: { scopeId: true },
      distinct: ["scopeId"],
    });
    return new Set(rows.flatMap((row) => (row.scopeId === null ? [] : [row.scopeId])));
  }

  /** Les réassorts : demandés, reçus, ou en brouillon au fournil. */
  private async resupplies(skus: readonly string[]): Promise<ReadonlySet<string>> {
    const [asked, received, drafted] = await Promise.all([
      this.scalar(this.prisma.siteResupplyLine, skus),
      this.scalar(this.prisma.resupplyReceiptLine, skus),
      this.inLines(this.prisma.bakehouseResupplyDraft, skus),
    ]);
    return new Set([...asked, ...received, ...drafted]);
  }

  /** Une grille `lines: [{ sku, … }]` en JSON — une requête par référence. */
  private async inLines(
    table: {
      findFirst(args: {
        where: { lines: { array_contains: { sku: string }[] } };
        select: { id: true };
      }): Promise<unknown>;
    },
    skus: readonly string[],
  ): Promise<ReadonlySet<string>> {
    const hits = await Promise.all(
      skus.map(async (sku) => {
        const row = await table.findFirst({
          where: { lines: { array_contains: [{ sku }] } },
          select: { id: true },
        });
        return row === null ? null : sku;
      }),
    );
    return new Set(hits.filter((sku): sku is string => sku !== null));
  }

  /** Un brouillon ou un panier : `payload.lines: [{ sku, … }]` en JSON. */
  private async inPayloads(
    table: {
      findFirst(args: {
        where: { payload: { path: string[]; array_contains: { sku: string }[] } };
        select: { id: true };
      }): Promise<unknown>;
    },
    skus: readonly string[],
  ): Promise<ReadonlySet<string>> {
    const hits = await Promise.all(
      skus.map(async (sku) => {
        const row = await table.findFirst({
          where: { payload: { path: ["lines"], array_contains: [{ sku }] } },
          select: { id: true },
        });
        return row === null ? null : sku;
      }),
    );
    return new Set(hits.filter((sku): sku is string => sku !== null));
  }
}
