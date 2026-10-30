import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import {
  CustomerSkuReader,
  type CustomerSkuTally,
} from "../../../domain/ports/customer-sku.reader.js";
import { type UnsealedCatalogItem } from "../../../../catalog/domain/ports/product-catalog.reader.js";
import { SaleReferenceSuccessionReader } from "../../../../catalog/domain/ports/sale-reference-succession.reader.js";
import { ListCustomerSkusHandler } from "../list-customer-skus.handler.js";
import { ListCustomerSkusQuery } from "../list-customer-skus.query.js";
import { VIENNOISERIES } from "../../../../catalog/domain/__tests__/families.fixture.js";
import { CatalogViewers } from "../../../../catalog/application/catalog-viewers.service.js";
import { InMemoryReservationHolders } from "../../../../catalog/infrastructure/in-memory-reservation-holders.js";

/** Le catalogue d'AUJOURD'HUI : le croissant a augmenté, la brioche a disparu. */
const CATALOG: Record<string, UnsealedCatalogItem> = {
  "VIE-001": {
    sku: "VIE-001",
    name: "Croissant",
    unitPriceMillicents: 220_000,
    vatRate: 5.5,
    family: VIENNOISERIES,
    allergens: null,
    orderTimeLimit: null,
  },
};

const catalog = new InMemoryProductCatalog(Object.values(CATALOG));

function habits(tallies: readonly CustomerSkuTally[]): CustomerSkuReader {
  return { byCompany: () => Promise.resolve(tallies) };
}

/** La lignée de détachement : l'ancienne référence → la plus récente. Vide par défaut. */
class Lineage extends SaleReferenceSuccessionReader {
  constructor(private readonly latest: Readonly<Record<string, string>> = {}) {
    super();
  }

  latestOf(skus: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return Promise.resolve(
      new Map(skus.flatMap((sku) => (sku in this.latest ? [[sku, this.latest[sku] ?? sku]] : []))),
    );
  }
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
    const handler = new ListCustomerSkusHandler(
      habits([CROISSANT]),
      catalog,
      new Lineage(),
      new CatalogViewers(new InMemoryReservationHolders()),
    );

    const [stat] = await handler.execute(new ListCustomerSkusQuery("c1"));

    expect(stat?.productName).toBe("Croissant");
    expect(stat?.unitPriceMillicents).toBe(220_000);
    expect(stat?.stillAvailable).toBe(true);
  });

  it("garde les compteurs tels quels — ils décrivent le PASSÉ", async () => {
    const handler = new ListCustomerSkusHandler(
      habits([CROISSANT]),
      catalog,
      new Lineage(),
      new CatalogViewers(new InMemoryReservationHolders()),
    );

    const [stat] = await handler.execute(new ListCustomerSkusQuery("c1"));

    expect(stat).toMatchObject({ orderCount: 12, totalQuantity: 480, totalCents: 96_000 });
    expect(stat?.lastOrderedAt).toBe("2026-08-10T06:00:00.000Z");
  });

  it("montre un SKU retiré du catalogue, sous son dernier nom facturé", async () => {
    // Le filtrer laisserait croire que ce client ne l'a jamais pris — et le
    // commercial le reproposerait.
    const handler = new ListCustomerSkusHandler(
      habits([BRIOCHE_RETIREE]),
      catalog,
      new Lineage(),
      new CatalogViewers(new InMemoryReservationHolders()),
    );

    const [stat] = await handler.execute(new ListCustomerSkusQuery("c1"));

    expect(stat?.productName).toBe("Brioche de Noël");
    expect(stat?.stillAvailable).toBe(false);
  });

  it("ne prête AUCUN prix à un SKU retiré", async () => {
    // 0 et non le dernier prix facturé : il n'est plus au tarif, donc il n'y a
    // rien à annoncer. Un prix affiché ici serait un prix qu'on ne tiendra pas.
    const handler = new ListCustomerSkusHandler(
      habits([BRIOCHE_RETIREE]),
      catalog,
      new Lineage(),
      new CatalogViewers(new InMemoryReservationHolders()),
    );

    const [stat] = await handler.execute(new ListCustomerSkusQuery("c1"));

    expect(stat?.unitPriceMillicents).toBe(0);
  });

  it("respecte l'ordre du port — c'est lui qui sait ce qui est habituel", async () => {
    const handler = new ListCustomerSkusHandler(
      habits([CROISSANT, BRIOCHE_RETIREE]),
      catalog,
      new Lineage(),
      new CatalogViewers(new InMemoryReservationHolders()),
    );

    const skus = (await handler.execute(new ListCustomerSkusQuery("c1"))).map((s) => s.sku);

    expect(skus).toEqual(["VIE-001", "VIE-099"]);
  });

  describe("L7d-bis — une déclinaison détachée", () => {
    /** Le croissant vendu sous son ancienne référence, avant le détachement. */
    const CROISSANT_ANCIEN: CustomerSkuTally = {
      sku: "VIE-001-2",
      lastProductName: "Croissant (ancienne fiche)",
      orderCount: 2,
      totalQuantity: 20,
      totalCents: 4_000,
      lastOrderedAt: new Date("2026-06-01T06:00:00.000Z"),
    };

    it("ne fait qu'une ligne, sous la référence la plus récente, compteurs additionnés", async () => {
      const handler = new ListCustomerSkusHandler(
        habits([CROISSANT, CROISSANT_ANCIEN]),
        catalog,
        new Lineage({ "VIE-001-2": "VIE-001" }),
        new CatalogViewers(new InMemoryReservationHolders()),
      );

      const stats = await handler.execute(new ListCustomerSkusQuery("c1"));

      expect(stats).toHaveLength(1);
      expect(stats[0]).toMatchObject({
        sku: "VIE-001",
        productName: "Croissant",
        orderCount: 14,
        totalQuantity: 500,
        totalCents: 100_000,
        lastOrderedAt: "2026-08-10T06:00:00.000Z",
        stillAvailable: true,
      });
    });

    it("regroupe même quand le client n'a commandé que l'ancienne référence", async () => {
      const handler = new ListCustomerSkusHandler(
        habits([CROISSANT_ANCIEN]),
        catalog,
        new Lineage({ "VIE-001-2": "VIE-001" }),
        new CatalogViewers(new InMemoryReservationHolders()),
      );

      const [stat] = await handler.execute(new ListCustomerSkusQuery("c1"));

      // La référence d'aujourd'hui : le commercial annonce ce qu'il peut vendre.
      expect(stat).toMatchObject({ sku: "VIE-001", productName: "Croissant", orderCount: 2 });
    });
  });

  /** S7 de `plan-articles-sur-mesure.md` : verrouillé, avec sa raison, jamais « commandable ». */
  it("montre verrouillé un article réservé depuis à un autre compte", async () => {
    const locked = new InMemoryProductCatalog([
      {
        ...CATALOG["VIE-001"],
        sku: "VIE-001",
        name: "Croissant",
        unitPriceMillicents: 220_000,
        vatRate: 5.5,
        family: VIENNOISERIES,
        allergens: null,
        orderTimeLimit: null,
        reservation: "other",
      },
    ]);
    const handler = new ListCustomerSkusHandler(
      habits([CROISSANT]),
      locked,
      new Lineage(),
      new CatalogViewers(new InMemoryReservationHolders()),
    );

    const [stat] = await handler.execute(new ListCustomerSkusQuery("c1"));

    expect(stat).toMatchObject({
      stillAvailable: false,
      lockedReason: "reserved_to_other_account",
    });
  });
});
