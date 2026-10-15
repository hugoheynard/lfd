import { Test } from "@nestjs/testing";

import {
  CatalogueReader,
  type CategoryVatPercents,
} from "../../../../catalogue/shared/domain/ports/catalogue-reader.js";
import type { ProductRecord } from "../../../../catalogue/product/domain/ports/product.repository.js";
import type { SalesChannels } from "../../../../catalogue/shared/domain/value-objects/sales-channels.js";
import {
  bareVariant,
  SELLABLE_VARIANT,
  tarte,
} from "../../../../catalogue/product/application/__tests__/audience-doubles.js";
import { FixedAccountingRules } from "../../../../accounting-rules/domain/ports/__tests__/fixed-accounting-rules.js";
import { AccountingRulesReader } from "../../../../accounting-rules/domain/ports/accounting-rules.reader.js";
import { FixedActiveContexts } from "../../../../sales-contexts/domain/ports/__tests__/fixed-active-contexts.js";
import { ActiveSalesContextsReader } from "../../../../sales-contexts/domain/ports/active-sales-contexts.reader.js";
import { B2bMembershipService } from "../../membership/membership.service.js";
import { GetAudienceSwitchPreviewHandler } from "../audience-switch-preview.js";
import { TableCatalogue } from "./audience-switch-doubles.js";

/**
 * L'aperçu de la bascule (1f du plan d'audience) : trois écarts entre
 * « publié au référentiel » et « vendu aux pros », lus sans rien écrire.
 */

const SOLD_B2B: SalesChannels = [{ pointOfSaleId: "pos_b2b", context: "b2b" }];
const SOLD_TAKEAWAY: SalesChannels = [{ pointOfSaleId: "pos_shop", context: "takeaway" }];

/**
 * `B2bMembershipService` est une classe CONCRÈTE qui réclame Prisma : sa
 * doublure passe par `useValue`, comme dans `feed-projection.service.spec.ts`.
 */
async function preview(
  products: readonly ProductRecord[],
  channels: ReadonlyMap<string, SalesChannels>,
  boundIds: readonly string[],
  percents: ReadonlyMap<string, CategoryVatPercents> = new Map(),
) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      GetAudienceSwitchPreviewHandler,
      { provide: CatalogueReader, useValue: new TableCatalogue(products, channels, percents) },
      { provide: ActiveSalesContextsReader, useValue: FixedActiveContexts.all() },
      { provide: AccountingRulesReader, useValue: FixedAccountingRules.with("ratio_ttc", 9_000) },
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
      activeIncomplete: [],
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

  /**
   * Lot 2b : la règle « un taux pour chaque contexte en service » rend
   * incomplètes des fiches actives aujourd'hui vendues. L'aperçu les nomme,
   * déclinaison par déclinaison, et dit si la fiche vendra encore.
   */
  it("liste les fiches actives incomplètes selon la règle du lot 2b", async () => {
    const twoFormats = tarte({
      id: "p_mixed",
      sku: "H-1",
      status: "published",
      variants: [
        SELLABLE_VARIANT,
        bareVariant({ id: "v_2", sku: "H-1-2", isDefault: false, priceCents: 900 }),
      ],
    });
    const noEatIn = tarte({ id: "p_no_eat_in", sku: "H-2", status: "published" });
    const draft = tarte({ id: "p_draft", sku: "H-3", status: "draft", variants: [bareVariant()] });

    const result = await preview(
      [twoFormats, noEatIn, draft],
      new Map(),
      [],
      new Map([["p_no_eat_in", { b2b: 20, takeaway: 5.5 }]]),
    );

    expect(result.activeIncomplete).toEqual([
      {
        id: "p_mixed",
        sku: "H-1",
        name: "Tarte au citron",
        keepsSelling: true,
        gaps: { "H-1-2": ["allergens"] },
      },
      {
        id: "p_no_eat_in",
        sku: "H-2",
        name: "Tarte au citron",
        keepsSelling: false,
        gaps: { "PAT-7-1": ["vat:eatIn"] },
      },
    ]);
  });
});
