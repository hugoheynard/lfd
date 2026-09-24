import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { SellableOperation } from "../../domain/ports/catalog-operations.reader.js";
import { SaleOperations } from "../sale-operations.service.js";
import {
  catalogItem,
  DefaultsCatalog,
  InMemoryCatalogOperations,
  saleOperationsOver,
} from "./sale-operations-doubles.js";

/**
 * Le passage du SKU PRODUIT (celui de la commande) au SKU du CATALOGUE (celui
 * de l'opération). Dates comparées à l'horloge figée du service, jamais au mur.
 */

const NOW = new Date("2026-12-01T10:00:00.000Z");

function noel(over: Partial<SellableOperation> = {}): SellableOperation {
  return {
    key: "noel-2026",
    name: { fr: "Noël" },
    lede: null,
    image: null,
    announceFrom: new Date("2026-11-01T00:00:00.000Z"),
    orderFrom: null,
    orderUntil: new Date("2026-12-21T11:00:00.000Z"),
    pickupFrom: "2026-12-20",
    pickupUntil: "2026-12-24",
    audience: "both",
    skus: ["PAT-002-1", "VIE-001-1"],
    ...over,
  };
}

const ITEMS = [catalogItem("PAT-002", { name: "Bûche" }), catalogItem("VIE-001")];

/** Compte ce qu'on lui demande : le cas hors saison ne doit rien lire d'autre. */
class CountingOperations extends InMemoryCatalogOperations {
  operationsRead = 0;

  override sellableOperations(): Promise<readonly SellableOperation[]> {
    this.operationsRead += 1;
    return super.sellableOperations();
  }
}

describe("SaleOperations.accessOf", () => {
  it("rend la réponse de D4 par SKU PRODUIT, pour les seuls articles operationOnly", async () => {
    const sale = saleOperationsOver({
      now: NOW,
      operations: [noel()],
      items: ITEMS,
      onlySkus: ["PAT-002-1"],
    });

    const found = await sale.accessOf(["PAT-002", "VIE-001"], "public", "2026-12-22");

    expect([...found.keys()]).toEqual(["PAT-002"]);
    expect(found.get("PAT-002")).toEqual({ productName: "Bûche", access: "orderable" });
  });

  it("distingue le devis (sans jour) de la commande sans jour", async () => {
    const sale = saleOperationsOver({
      now: NOW,
      operations: [noel()],
      items: ITEMS,
      onlySkus: ["PAT-002-1"],
    });

    expect((await sale.accessOf(["PAT-002"], "pro")).get("PAT-002")?.access).toBe("shown");
    expect((await sale.accessOf(["PAT-002"], "pro", null)).get("PAT-002")?.access).toMatchObject({
      reason: "no_day",
    });
  });

  it("rend absent l'article qu'une opération ne montre pas à cette clientèle", async () => {
    const sale = saleOperationsOver({
      now: NOW,
      operations: [noel({ audience: "pro" })],
      items: ITEMS,
      onlySkus: ["PAT-002-1"],
    });

    expect((await sale.accessOf(["PAT-002"], "public")).get("PAT-002")?.access).toBe("absent");
  });

  it("hors saison, ne lit pas les opérations", async () => {
    const operations = new CountingOperations([noel()], []);
    const sale = new SaleOperations(new DefaultsCatalog(ITEMS), operations, new FixedClock(NOW));

    expect((await sale.accessOf(["PAT-002"], "pro")).size).toBe(0);
    expect(operations.operationsRead).toBe(0);
  });
});

describe("SaleOperations.pickupRangesOf", () => {
  it("rend une entrée par article contraint, avec les plages des opérations ouvertes", async () => {
    const sale = saleOperationsOver({
      now: NOW,
      operations: [noel()],
      items: ITEMS,
      onlySkus: ["PAT-002-1"],
    });

    expect(await sale.pickupRangesOf(["PAT-002", "VIE-001"], "pro")).toEqual([
      [{ from: "2026-12-20", until: "2026-12-24" }],
    ]);
  });

  it("rend une plage vide pour une opération close", async () => {
    const sale = saleOperationsOver({
      now: NOW,
      operations: [noel({ orderUntil: new Date("2026-11-30T11:00:00.000Z") })],
      items: ITEMS,
      onlySkus: ["PAT-002-1"],
    });

    expect(await sale.pickupRangesOf(["PAT-002"], "pro")).toEqual([[]]);
  });
});

describe("SaleOperations.operationOnlyAmong", () => {
  it("nomme les articles operationOnly une fois, quelle que soit la clientèle qui les voit", async () => {
    const sale = new SaleOperations(
      new DefaultsCatalog(ITEMS, new Map([["PAT-002", "pro"]])),
      new InMemoryCatalogOperations([], ["PAT-002-1"]),
      new FixedClock(NOW),
    );

    expect(await sale.operationOnlyAmong(["PAT-002", "VIE-001", "PAT-002"])).toEqual(["Bûche"]);
  });
});
