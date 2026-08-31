import { Test } from "@nestjs/testing";

import { CatalogueReader } from "../../../../catalogue/shared/domain/ports/catalogue-reader.js";
import type { ProductEditorialView } from "../../../../catalogue/product/domain/ports/editorial-reader.js";
import type { ProductRecord } from "../../../../catalogue/product/domain/ports/product.repository.js";
import { PimPrismaService } from "../../../../infra/database/pim-prisma.service.js";
import type { ChannelMode } from "../../shared/settings.service.js";
import { ShopifySettingsService } from "../../shared/settings.service.js";
import { DryRunShopifyDriver, LiveShopifyDriver } from "../driver.js";
import { fingerprint, projectProduct, type ShopifyProductPayload } from "../projection.js";
import { ShopifyMembershipService } from "../membership.service.js";
import { ShopifyCollectionsService } from "../../collections/collections.service.js";
import { TaxCollectionsPlan } from "../../collections/tax-collections.plan.js";
import { ShopifyPushService } from "../push.service.js";
import { SalesContextRegistry } from "../../../../sales-contexts/domain/ports/sales-context.registry.js";
import type { RecordSnapshotInput } from "../snapshot.service.js";
import { ShopifySnapshotService } from "../snapshot.service.js";

function product(): ProductRecord {
  return {
    id: "p1",
    sku: "PATI-CROISSANT",
    name: { fr: "Croissant" },
    slug: { fr: "croissant" },
    kind: "daily",
    categoryId: "c1",
    status: "draft",
    vatByContext: {},
    channelOverride: null,
    variants: [
      {
        id: "v1",
        sku: "PATI-CROISSANT",
        name: { fr: "Nature" },
        options: {},
        isDefault: true,
        isDiscontinued: false,
        position: 0,
        priceCents: 130,
        weightGrams: null,
        allergens: null,
        nutrition: null,
      },
    ],
  };
}

interface UpsertArg {
  create: { headSnapshotId?: string };
}

interface Harness {
  service: ShopifyPushService;
  recorded: RecordSnapshotInput[];
  livePushes: ShopifyProductPayload[];
  dryPushes: ShopifyProductPayload[];
  bindingUpserts: UpsertArg[];
  assigns: { productGid: string; tags: readonly string[] }[];
  collectionPushes: readonly { handle: string; title: string }[][];
  setLoad: (value: {
    id: string;
    version: number;
    productId: string;
    payload: ShopifyProductPayload;
  }) => void;
  loadArgs: [string, number][];
  /** Les lots d'identifiants pour lesquels le pousseur a demandé l'éditorial. */
  editorialAsks: string[][];
}

async function build(
  mode: ChannelMode,
  bindingRow: { lastPushedHash: string } | null = null,
  editorials: ReadonlyMap<string, ProductEditorialView> = new Map(),
): Promise<Harness> {
  const editorialAsks: string[][] = [];
  const recorded: RecordSnapshotInput[] = [];
  const livePushes: ShopifyProductPayload[] = [];
  const dryPushes: ShopifyProductPayload[] = [];
  const bindingUpserts: UpsertArg[] = [];
  const assigns: { productGid: string; tags: readonly string[] }[] = [];
  /** Les collections de taxe que la passe préalable a demandé de créer. */
  const collectionPushes: { handle: string; title: string }[][] = [];
  const loadArgs: [string, number][] = [];
  let loadValue: {
    id: string;
    version: number;
    productId: string;
    payload: ShopifyProductPayload;
  } | null = null;

  const snapshots = {
    record: (input: RecordSnapshotInput) => {
      recorded.push(input);
      return Promise.resolve({ id: "snap_1" });
    },
    load: (handle: string, version: number) => {
      loadArgs.push([handle, version]);
      return Promise.resolve(loadValue);
    },
  };

  const prisma = {
    shopifyProductBinding: {
      findUnique: () => Promise.resolve(bindingRow),
      upsert: (arg: UpsertArg) => {
        bindingUpserts.push(arg);
        return Promise.resolve({});
      },
    },
    shopifyVariantBinding: { upsert: () => Promise.resolve({}) },
    product: { findUnique: () => Promise.resolve({ sku: "PATI-CROISSANT" }) },
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      ShopifyPushService,
      {
        provide: CatalogueReader,
        useValue: {
          byIds: () => Promise.resolve([product()]),
          // Le taux EFFECTIF, par produit : la fiche ne déroge pas ici, donc
          // c'est celui de sa famille.
          effectiveChannels: (items: readonly { id: string }[]) =>
            Promise.resolve(
              new Map(
                items.map((item) => [
                  item.id,
                  { boutiques: { emp_1: { takeaway: true, eatIn: false } }, b2b: false },
                ]),
              ),
            ),
          vatPercents: (items: readonly { id: string }[]) =>
            Promise.resolve(new Map(items.map((item) => [item.id, { takeaway: 5.5 }]))),
          editorials: (ids: readonly string[]) => {
            editorialAsks.push([...ids]);
            return Promise.resolve(editorials);
          },
        },
      },
      {
        // Le registre décide de ce que Shopify projette. « Sur place » est en
        // service et pourtant absent des tags : c'est la distinction que la
        // constante d'avant ne pouvait pas porter.
        provide: SalesContextRegistry,
        useValue: {
          active: () =>
            Promise.resolve([
              {
                id: "ctx_emporter",
                key: "takeaway",
                label: "À emporter",
                handleSuffix: "",
                active: true,
                shopifyProjected: true,
                position: 1,
              },
              {
                id: "ctx_sur_place",
                key: "eatIn",
                label: "Sur place",
                handleSuffix: "-surplace",
                active: true,
                shopifyProjected: false,
                position: 2,
              },
            ]),
        },
      },
      {
        provide: ShopifyMembershipService,
        useValue: {
          assign: (productGid: string, tags: readonly string[]) => {
            assigns.push({ productGid, tags });
            return Promise.resolve({ joined: tags, left: [], missing: [] });
          },
        },
      },
      {
        provide: ShopifySettingsService,
        useValue: { read: () => Promise.resolve({ mode }) },
      },
      {
        provide: DryRunShopifyDriver,
        useValue: {
          mode: "dry-run",
          push: (p: ShopifyProductPayload) => {
            dryPushes.push(p);
            return Promise.resolve({ productGid: null, variantGids: {} });
          },
        },
      },
      {
        provide: LiveShopifyDriver,
        useValue: {
          mode: "live",
          push: (p: ShopifyProductPayload) => {
            livePushes.push(p);
            return Promise.resolve({
              productGid: "gid://shopify/Product/1",
              variantGids: {},
            });
          },
        },
      },
      { provide: PimPrismaService, useValue: prisma },
      { provide: ShopifySnapshotService, useValue: snapshots },
      {
        provide: TaxCollectionsPlan,
        useValue: { desired: () => Promise.resolve([{ handle: "tva-5-5", title: "TVA 5,5 %" }]) },
      },
      {
        provide: ShopifyCollectionsService,
        useValue: {
          push: (desired: readonly { handle: string; title: string }[]) => {
            collectionPushes.push([...desired]);
            return Promise.resolve({ created: [{ handle: "tva-5-5" }] });
          },
        },
      },
    ],
  }).compile();

  return {
    service: moduleRef.get(ShopifyPushService),
    recorded,
    livePushes,
    dryPushes,
    bindingUpserts,
    assigns,
    collectionPushes,
    setLoad: (value) => {
      loadValue = value;
    },
    loadArgs,
    editorialAsks,
  };
}

describe("ShopifyPushService — snapshots", () => {
  it("en live, écrit un snapshot et fait pointer le head (BASE)", async () => {
    const h = await build("live");

    await h.service.push(["p1"]);

    expect(h.recorded[0]).toMatchObject({
      handle: "croissant",
      mode: "live",
      outcome: "pushed",
    });
    expect(h.bindingUpserts[0]?.create.headSnapshotId).toBe("snap_1");
  });

  it("en dry-run, écrit un snapshot mais n’avance PAS le head", async () => {
    const h = await build("dry-run");

    await h.service.push(["p1"]);

    expect(h.recorded[0]?.mode).toBe("dry_run");
    expect(h.bindingUpserts[0]?.create.headSnapshotId).toBeUndefined();
  });

  it("en live, range le produit dans la collection TVA de son contexte", async () => {
    const h = await build("live");

    const summary = await h.service.push(["p1"]);

    expect(h.assigns[0]?.productGid).toBe("gid://shopify/Product/1");
    expect(h.assigns[0]?.tags).toEqual(["tva-5-5"]);
    expect(summary.results[0]?.message).toContain("tva-5-5");
  });

  it("en dry-run, ne range rien (pas d’état boutique)", async () => {
    const h = await build("dry-run");

    await h.service.push(["p1"]);

    expect(h.assigns).toHaveLength(0);
  });

  it("en pré-push (preview), ne pousse rien et n’écrit rien", async () => {
    const h = await build("live");

    const summary = await h.service.push(["p1"], true);

    expect(summary.mode).toBe("dry-run");
    expect(summary.results[0]?.outcome).toBe("pushed");
    expect(summary.results[0]?.message).toContain("Partirait");
    expect(h.livePushes).toHaveLength(0);
    expect(h.dryPushes).toHaveLength(0);
    expect(h.recorded).toHaveLength(0);
    expect(h.bindingUpserts).toHaveLength(0);
  });

  it("en pré-push, rapporte « déjà à jour » si l’empreinte est identique", async () => {
    const hash = fingerprint(projectProduct(product(), null, true));
    const h = await build("live", { lastPushedHash: hash });

    const summary = await h.service.push(["p1"], true);

    expect(summary.results[0]?.outcome).toBe("unchanged");
    expect(h.bindingUpserts).toHaveLength(0);
  });

  it("sur empreinte identique, ne pousse ni n’écrit de snapshot", async () => {
    const hash = fingerprint(projectProduct(product(), null, true));
    const h = await build("live", { lastPushedHash: hash });

    const summary = await h.service.push(["p1"]);

    expect(summary.results[0]?.outcome).toBe("unchanged");
    expect(h.livePushes).toHaveLength(0);
    expect(h.recorded).toHaveLength(0);
  });
});

describe("ShopifyPushService — la couche éditoriale", () => {
  it("demande l’éditorial des produits poussés, en un seul lot", async () => {
    const h = await build("live");

    await h.service.push(["p1"]);

    expect(h.editorialAsks).toEqual([["p1"]]);
  });

  it("la description écrite au back-office atteint la fiche poussée", async () => {
    const h = await build(
      "live",
      null,
      new Map([
        [
          "p1",
          {
            descriptionShort: null,
            descriptionLong: { fr: "Pâte feuilletée." },
            story: null,
            pairing: null,
            brand: "Signature",
            seoTitle: null,
            seoDescription: null,
          },
        ],
      ]),
    );

    await h.service.push(["p1"]);

    expect(h.livePushes[0]?.descriptionHtml).toBe("<p>Pâte feuilletée.</p>");
    expect(h.livePushes[0]?.vendor).toBe("Signature");
  });
});

describe("ShopifyPushService — rollback", () => {
  it("re-pousse le payload figé de la version ciblée et journalise une nouvelle version", async () => {
    const h = await build("live");
    const payload = projectProduct(product(), null, true);
    h.setLoad({ id: "snap_7", version: 2, productId: "p1", payload });

    const report = await h.service.rollback("croissant", 2);

    expect(h.loadArgs[0]).toEqual(["croissant", 2]);
    expect(h.livePushes[0]).toEqual(payload);
    expect(h.recorded[0]).toMatchObject({
      handle: "croissant",
      productId: "p1",
    });
    expect(report.outcome).toBe("pushed");
    expect(report.message).toContain("v2");
  });
});

describe("ShopifyPushService — collections de taxe", () => {
  it("crée les collections manquantes AVANT de pousser les fiches", async () => {
    const h = await build("live");

    const summary = await h.service.push(["p1"]);

    // La passe a bien eu lieu, avec la liste dérivée du référentiel…
    expect(h.collectionPushes).toEqual([[{ handle: "tva-5-5", title: "TVA 5,5 %" }]]);
    // …et ce qu'elle a créé remonte dans la synthèse.
    expect(summary.taxCollections).toEqual({ created: ["tva-5-5"], error: null });
  });

  it("ne touche à rien en pré-push", async () => {
    const h = await build("live");

    const summary = await h.service.push(["p1"], true);

    expect(h.collectionPushes).toEqual([]);
    expect(summary.taxCollections).toBeNull();
  });
});
