import { Test } from "@nestjs/testing";

import {
  CatalogueReader,
  type CategoryVatPercents,
  type ChannelCategory,
} from "../../../../catalogue/shared/domain/ports/catalogue-reader.js";
import type { ProductRecord } from "../../../../catalogue/product/domain/ports/product.repository.js";
import type { ProductEditorialView } from "../../../../catalogue/product/domain/ports/editorial-reader.js";
import type { SalesChannels } from "../../../../catalogue/shared/domain/value-objects/sales-channels.js";
import {
  bareVariant,
  tarte,
} from "../../../../catalogue/product/application/__tests__/audience-doubles.js";
import { B2bMembershipService } from "../../membership/membership.service.js";
import { GetAudienceSwitchPreviewHandler } from "../audience-switch-preview.js";

/**
 * L'aperçu de la bascule (1f du plan d'audience) : trois écarts entre
 * « publié au référentiel » et « vendu aux pros », lus sans rien écrire.
 */

const SOLD_B2B: SalesChannels = [{ pointOfSaleId: "pos_b2b", context: "b2b" }];
const SOLD_TAKEAWAY: SalesChannels = [{ pointOfSaleId: "pos_shop", context: "takeaway" }];

/** Un catalogue tenu en table : les fiches, et leurs canaux effectifs. */
class TableCatalogue extends CatalogueReader {
  constructor(
    private readonly products: readonly ProductRecord[],
    private readonly channels: ReadonlyMap<string, SalesChannels>,
  ) {
    super();
  }
  publishable(): Promise<ProductRecord[]> {
    return Promise.resolve(this.products.filter((product) => product.status !== "archived"));
  }
  byIds(ids: readonly string[]): Promise<ProductRecord[]> {
    return Promise.resolve(this.products.filter((product) => ids.includes(product.id)));
  }
  effectiveChannels(
    products: readonly ProductRecord[],
  ): Promise<ReadonlyMap<string, SalesChannels>> {
    return Promise.resolve(
      new Map(products.map((product) => [product.id, this.channels.get(product.id) ?? []])),
    );
  }
  vatPercents(): Promise<ReadonlyMap<string, CategoryVatPercents>> {
    return Promise.resolve(new Map());
  }
  channelCategories(): Promise<ChannelCategory[]> {
    return Promise.resolve([]);
  }
  editorials(): Promise<ReadonlyMap<string, ProductEditorialView>> {
    return Promise.resolve(new Map());
  }
}

/**
 * `B2bMembershipService` est une classe CONCRÈTE qui réclame Prisma : sa
 * doublure passe par `useValue`, comme dans `feed-projection.service.spec.ts`.
 */
async function preview(
  products: readonly ProductRecord[],
  channels: ReadonlyMap<string, SalesChannels>,
  boundIds: readonly string[],
) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      GetAudienceSwitchPreviewHandler,
      { provide: CatalogueReader, useValue: new TableCatalogue(products, channels) },
      {
        provide: B2bMembershipService,
        useValue: { publishedProductIds: () => Promise.resolve([...boundIds]) },
      },
    ],
  }).compile();
  return moduleRef.get(GetAudienceSwitchPreviewHandler).execute();
}

function item(id: string, sku: string, status: ProductRecord["status"]): ProductRecord {
  return tarte({ id, sku, status, name: { fr: `Fiche ${sku}` } });
}

describe("GetAudienceSwitchPreviewHandler", () => {
  it("range chaque écart dans sa liste, et laisse les fiches en règle hors de toutes", async () => {
    const products = [
      item("p_ok", "A-1", "published"),
      item("p_unbound", "B-1", "published"),
      item("p_draft_bound", "C-1", "draft"),
      item("p_archived_bound", "C-2", "archived"),
      item("p_closed", "D-1", "published"),
    ];
    const channels = new Map([
      ["p_ok", SOLD_B2B],
      ["p_unbound", SOLD_B2B],
      ["p_closed", SOLD_TAKEAWAY],
    ]);

    const result = await preview(products, channels, [
      "p_ok",
      "p_draft_bound",
      "p_archived_bound",
      "p_closed",
    ]);

    expect(result).toEqual({
      publishedUnbound: [{ id: "p_unbound", sku: "B-1", name: "Fiche B-1" }],
      boundUnpublished: [
        { id: "p_draft_bound", sku: "C-1", name: "Fiche C-1" },
        { id: "p_archived_bound", sku: "C-2", name: "Fiche C-2" },
      ],
      publishedB2bClosed: [{ id: "p_closed", sku: "D-1", name: "Fiche D-1" }],
      soldWithoutAllergens: [],
    });
  });

  /**
   * Corrections après `vitruve` (lot 2a) : une déclinaison vendue sans
   * déclaration sortira de la vente à la bascule, et la liste le dit avant.
   * Une déclinaison sans prix ou arrêtée n'est pas vendue : elle n'y est pas.
   */
  it("liste les déclinaisons vendues aux pros sans déclaration d'allergènes", async () => {
    const undeclared = bareVariant({ id: "v_nu", sku: "F-1-1", priceCents: 300 });
    const unpriced = bareVariant({ id: "v_sans_prix", sku: "F-1-2", isDefault: false });
    const stopped = bareVariant({
      id: "v_arrete",
      sku: "F-1-3",
      priceCents: 300,
      isDefault: false,
      isDiscontinued: true,
    });
    const sold = tarte({
      id: "p_sold",
      sku: "F-1",
      status: "published",
      variants: [undeclared, unpriced, stopped],
    });
    const unbound = tarte({
      id: "p_unbound",
      sku: "G-1",
      status: "published",
      variants: [undeclared],
    });

    const result = await preview([sold, unbound], new Map([["p_sold", SOLD_B2B]]), ["p_sold"]);

    expect(result.soldWithoutAllergens).toEqual([
      { productId: "p_sold", productSku: "F-1", variantSku: "F-1-1", name: "Tarte au citron" },
    ]);
  });

  /** Une fiche peut cumuler deux écarts : chaque liste répond à sa question. */
  it("cite une fiche non liée ET fermée en b2b dans les deux listes", async () => {
    const result = await preview([item("p_both", "E-1", "published")], new Map(), []);

    expect(result.publishedUnbound.map((entry) => entry.id)).toEqual(["p_both"]);
    expect(result.publishedB2bClosed.map((entry) => entry.id)).toEqual(["p_both"]);
  });

  it("trie par SKU", async () => {
    const result = await preview(
      [item("p_z", "Z-1", "published"), item("p_a", "A-9", "published")],
      new Map(),
      [],
    );

    expect(result.publishedUnbound.map((entry) => entry.sku)).toEqual(["A-9", "Z-1"]);
  });
});
