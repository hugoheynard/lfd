import type { Provider } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { AppConfig } from "../../../../../platform/config/app-config.js";
import { runWithRequestContext } from "../../../../../platform/context/request-context.store.js";
import { PrismaService } from "../../../../../platform/database/prisma.service.js";
import { withCatalogueSnapshot } from "../../../application/catalogue-snapshot-scope.js";
import { CatalogueSnapshotStore } from "../catalogue-snapshot.store.js";

/** Une ligne d'article telle que l'instantané la lit — tout ce que `servedItem` touche. */
export interface ArticleFixture {
  readonly sku: string;
  readonly productId: string;
  readonly productSku: string;
  readonly name: string;
  readonly categoryId: string;
  readonly priceMillicents: number | null;
  readonly isDefault: boolean;
  readonly position: number;
  readonly vatRatePercent: { readonly toNumber: () => number } | null;
  readonly publicByContext: unknown;
  readonly variantsAsTiles: boolean;
  readonly productName: string | null;
  readonly allergens: unknown;
  readonly allergenLabels: unknown;
  readonly allergensPrecautionary: boolean;
  readonly allergenTexts: unknown;
  readonly note: string | null;
  readonly nameTranslations: unknown;
  readonly noteTranslations: unknown;
  readonly imageUrl: string | null;
  readonly imageAlt: string | null;
  readonly imageWidth: number | null;
  readonly imageHeight: number | null;
  readonly imageFocalX: number | null;
  readonly imageFocalY: number | null;
  readonly thumbnailUrl: string | null;
  readonly thumbnailAlt: string | null;
  readonly thumbnailWidth: number | null;
  readonly thumbnailHeight: number | null;
  readonly thumbnailFocalX: number | null;
  readonly thumbnailFocalY: number | null;
  readonly orderLimitDaysBefore: number | null;
  readonly orderLimitTime: string | null;
  readonly orderLimitGraceMinutes: number | null;
  readonly operationOnly: boolean;
  readonly customRecipe: boolean;
  readonly audience: string | null;
  readonly publicReviewPending: boolean;
  readonly proReviewPending: boolean;
  readonly saleUnit: string;
  readonly weightMinGrams: number | null;
  readonly weightStepGrams: number | null;
  readonly proMinQuantity: number | null;
  readonly publicMinQuantity: number | null;
  readonly category: {
    readonly id: string;
    readonly name: string;
    readonly nameTranslations: unknown;
    readonly slug: string;
    readonly parentId: string | null;
    readonly position: number;
  };
  readonly override: {
    readonly isHidden: boolean;
    readonly isHiddenPublic: boolean;
    readonly isFeaturedPro: boolean;
    readonly isFeaturedPublic: boolean;
    readonly reservedVisibility: string;
  } | null;
  readonly _count: { readonly reservations: number };
}

const rate = (value: number) => ({ toNumber: () => value });

/** Un article vendu aux deux clientèles, défaut de sa fiche, famille à plat. */
export function article(sku: string, overrides: Partial<ArticleFixture> = {}): ArticleFixture {
  return {
    sku,
    productId: `prod-${sku}`,
    productSku: sku,
    name: `Article ${sku}`,
    categoryId: "fam-a",
    priceMillicents: 100_000,
    isDefault: true,
    position: 0,
    vatRatePercent: rate(5.5),
    publicByContext: { takeaway: { htMillicents: 120_000, vatRatePercent: 5.5 } },
    variantsAsTiles: false,
    productName: null,
    allergens: null,
    allergenLabels: null,
    allergensPrecautionary: false,
    allergenTexts: null,
    note: null,
    nameTranslations: null,
    noteTranslations: null,
    imageUrl: null,
    imageAlt: null,
    imageWidth: null,
    imageHeight: null,
    imageFocalX: null,
    imageFocalY: null,
    thumbnailUrl: null,
    thumbnailAlt: null,
    thumbnailWidth: null,
    thumbnailHeight: null,
    thumbnailFocalX: null,
    thumbnailFocalY: null,
    orderLimitDaysBefore: null,
    orderLimitTime: null,
    orderLimitGraceMinutes: null,
    operationOnly: false,
    customRecipe: false,
    audience: "both",
    publicReviewPending: false,
    proReviewPending: false,
    saleUnit: "piece",
    weightMinGrams: null,
    weightStepGrams: null,
    proMinQuantity: null,
    publicMinQuantity: null,
    category: {
      id: "fam-a",
      name: "Famille A",
      nameTranslations: null,
      slug: "famille-a",
      parentId: null,
      position: 1,
    },
    override: null,
    _count: { reservations: 0 },
    ...overrides,
  };
}

/**
 * **La base, réduite à ce que l'instantané lit**, et le journal de ses
 * appels dans l'ordre. Les réservations appliquent le `where` qu'on leur passe :
 * c'est le mur, et un double qui l'ignorerait le rendrait invisible.
 */
export class FakeCatalogueBase {
  readonly calls: string[] = [];
  readonly versions = new Map<string, bigint>([
    ["catalog", 1n],
    ["operations", 1n],
    ["order_cutoffs", 1n],
  ]);
  articles: readonly ArticleFixture[] = [];
  reservations: readonly { readonly sku: string; readonly companyId: string }[] = [];
  cutoff: {
    readonly id: string;
    readonly daysBefore: number;
    readonly time: string;
    readonly graceMinutes: number;
  } | null = { id: "cut-1", daysBefore: 1, time: "18:00", graceMinutes: 0 };

  readonly contextVersion = {
    findMany: () => {
      this.calls.push("versions");
      return Promise.resolve([...this.versions].map(([context, value]) => ({ context, value })));
    },
  };

  readonly catalogItem = {
    findMany: (args: { readonly select?: unknown }) => {
      this.calls.push(args.select === undefined ? "base:articles" : "articles");
      return Promise.resolve(args.select === undefined ? [] : [...this.articles]);
    },
    findFirst: () => {
      this.calls.push("base:article");
      return Promise.resolve(null);
    },
  };

  readonly catalogItemReservation = {
    findMany: (args: { readonly where: { readonly companyId: { readonly in: string[] } } }) => {
      this.calls.push(`reservations:${args.where.companyId.in.join("+")}`);
      const holders = new Set(args.where.companyId.in);
      return Promise.resolve(this.reservations.filter((row) => holders.has(row.companyId)));
    },
  };

  readonly orderCutoff = {
    findFirst: () => {
      this.calls.push("cutoff");
      return Promise.resolve(this.cutoff);
    },
  };

  readonly catalogCategory = {
    findMany: () => {
      this.calls.push("families");
      return Promise.resolve([]);
    },
  };
}

/** La configuration, réglage de l'instantané compris. */
export class SnapshotConfig extends AppConfig {
  constructor(private readonly memory: boolean) {
    super();
  }

  override catalogueSnapshotMemory(): boolean {
    return this.memory;
  }
}

/** Un module de test : l'instantané, ses lecteurs, la base doublée. */
export async function snapshotModule(
  providers: readonly Provider[],
  options: { readonly memory?: boolean } = {},
) {
  const base = new FakeCatalogueBase();
  const moduleRef = await Test.createTestingModule({
    providers: [
      CatalogueSnapshotStore,
      ...providers,
      { provide: PrismaService, useValue: base },
      { provide: AppConfig, useValue: new SnapshotConfig(options.memory ?? true) },
    ],
  }).compile();
  return { base, moduleRef, store: moduleRef.get(CatalogueSnapshotStore) };
}

/** Une requête, dans la portée de l'instantané (le devis). */
export function inQuote<T>(work: () => Promise<T>): Promise<T> {
  return runWithRequestContext({ now: new Date(0), traceId: "trace-devis" }, () =>
    withCatalogueSnapshot(work),
  );
}
