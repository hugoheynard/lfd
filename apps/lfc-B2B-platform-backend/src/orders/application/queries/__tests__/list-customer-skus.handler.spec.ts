import {
  CustomerSkuReader,
  type CustomerSkuTally,
} from "../../../domain/ports/customer-sku.reader.js";
import {
  type CatalogItem,
  ProductCatalogReader,
} from "../../../domain/ports/product-catalog.reader.js";
import { ListCustomerSkusHandler } from "../list-customer-skus.handler.js";
import { ListCustomerSkusQuery } from "../list-customer-skus.query.js";

/** Le catalogue d'AUJOURD'HUI : le croissant a augmenté, la brioche a disparu. */
const CATALOG: Record<string, CatalogItem> = {
  "VIE-001": {
    sku: "VIE-001",
    name: "Croissant",
    unitPriceCents: 220,
    vatRate: 5.5,
    category: "viennoiserie",
  },
};

const catalog: ProductCatalogReader = {
  resolve: (sku) => CATALOG[sku] ?? null,
  all: () => Object.values(CATALOG),
};

function habits(tallies: readonly CustomerSkuTally[]): CustomerSkuReader {
  return { byCompany: () => Promise.resolve(tallies) };
}

const CROISSANT: CustomerSkuTally = {
  sku: "VIE-001",
  // Le nom facturé à l'époque — volontairement différent de celui du catalogue.
  lastProductName: "Croissant pur beurre",
  orderCount: 12,
  totalQuantity: 480,
  totalCents: 96_000,
  lastOrderedAt: new Date("2026-08-10T06:00:00.000Z"),
};

const BRIOCHE_RETIREE: CustomerSkuTally = {
  sku: "VIE-099",
  lastProductName: "Brioche de Noël",
  orderCount: 3,
  totalQuantity: 30,
  totalCents: 9_000,
  lastOrderedAt: new Date("2026-01-04T06:00:00.000Z"),
};

describe("ListCustomerSkusHandler", () => {
  it("annonce le prix et le nom du catalogue, PAS ceux de la vieille commande", async () => {
    // Le piège : un commercial qui lit cette liste au téléphone annonce un
    // tarif. S'il vient du snapshot, le serveur en appliquera un autre.
    const handler = new ListCustomerSkusHandler(habits([CROISSANT]), catalog);

    const [stat] = await handler.execute(new ListCustomerSkusQuery("c1"));

    expect(stat?.productName).toBe("Croissant");
    expect(stat?.unitPriceCents).toBe(220);
    expect(stat?.stillAvailable).toBe(true);
  });

  it("garde les compteurs tels quels — ils décrivent le PASSÉ", async () => {
    const handler = new ListCustomerSkusHandler(habits([CROISSANT]), catalog);

    const [stat] = await handler.execute(new ListCustomerSkusQuery("c1"));

    expect(stat).toMatchObject({ orderCount: 12, totalQuantity: 480, totalCents: 96_000 });
    expect(stat?.lastOrderedAt).toBe("2026-08-10T06:00:00.000Z");
  });

  it("montre un SKU retiré du catalogue, sous son dernier nom facturé", async () => {
    // Le filtrer laisserait croire que ce client ne l'a jamais pris — et le
    // commercial le reproposerait.
    const handler = new ListCustomerSkusHandler(habits([BRIOCHE_RETIREE]), catalog);

    const [stat] = await handler.execute(new ListCustomerSkusQuery("c1"));

    expect(stat?.productName).toBe("Brioche de Noël");
    expect(stat?.stillAvailable).toBe(false);
  });

  it("ne prête AUCUN prix à un SKU retiré", async () => {
    // 0 et non le dernier prix facturé : il n'est plus au tarif, donc il n'y a
    // rien à annoncer. Un prix affiché ici serait un prix qu'on ne tiendra pas.
    const handler = new ListCustomerSkusHandler(habits([BRIOCHE_RETIREE]), catalog);

    const [stat] = await handler.execute(new ListCustomerSkusQuery("c1"));

    expect(stat?.unitPriceCents).toBe(0);
  });

  it("respecte l'ordre du port — c'est lui qui sait ce qui est habituel", async () => {
    const handler = new ListCustomerSkusHandler(habits([CROISSANT, BRIOCHE_RETIREE]), catalog);

    const skus = (await handler.execute(new ListCustomerSkusQuery("c1"))).map((s) => s.sku);

    expect(skus).toEqual(["VIE-001", "VIE-099"]);
  });
});
