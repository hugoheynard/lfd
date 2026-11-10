import type { MadeToOrderClientLine } from "../../ports/made-to-order-client.reader.js";
import { byClientReportOf, monthlyRowsOf } from "../made-to-order-reports.js";

describe("monthlyRowsOf", () => {
  it("sépare sur mesure, non sur mesure et d'avant le suivi, et calcule la part sur le total", () => {
    const [row] = monthlyRowsOf(
      ["2026-10"],
      [
        { month: "2026-10", madeToOrder: true, htCents: 2_000, orders: 2 },
        { month: "2026-10", madeToOrder: false, htCents: 5_000, orders: 4 },
        { month: "2026-10", madeToOrder: null, htCents: 3_000, orders: 1 },
      ],
    );
    expect(row).toEqual({
      month: "2026-10",
      madeToOrderHtCents: 2_000,
      otherHtCents: 5_000,
      unknownHtCents: 3_000,
      totalHtCents: 10_000,
      madeToOrderOrders: 2,
      madeToOrderShare: 0.2,
    });
  });

  it("ne compte jamais une ligne d'avant le suivi comme non sur mesure", () => {
    const [row] = monthlyRowsOf(
      ["2026-09"],
      [{ month: "2026-09", madeToOrder: null, htCents: 4_000, orders: 3 }],
    );
    expect(row).toMatchObject({ otherHtCents: 0, unknownHtCents: 4_000, madeToOrderShare: 0 });
  });

  it("rend un mois vide avec une part inconnue, et ignore un mois hors fenêtre", () => {
    const rows = monthlyRowsOf(
      ["2026-08", "2026-09"],
      [{ month: "2026-07", madeToOrder: true, htCents: 900, orders: 1 }],
    );
    expect(rows.map((row) => [row.month, row.totalHtCents, row.madeToOrderShare])).toEqual([
      ["2026-08", 0, null],
      ["2026-09", 0, null],
    ]);
  });
});

const line = (over: Partial<MadeToOrderClientLine>): MadeToOrderClientLine => ({
  clientKey: "company:a",
  kind: "company",
  companyId: "a",
  name: "Hôtel A",
  principalName: null,
  sku: "ENT-001-1",
  productName: "Entremets",
  saleUnit: "piece",
  madeToOrder: true,
  quantity: 2,
  htCents: 1_000,
  orders: 1,
  ...over,
});

describe("byClientReportOf", () => {
  it("regroupe par client, range les articles par HT et met l'inconnu à part", () => {
    const view = byClientReportOf("2026-10-01", "2026-10-31", [
      line({ sku: "ENT-001-1", htCents: 1_000 }),
      line({ sku: "GAT-002-1", htCents: 3_000, quantity: 1 }),
      line({ sku: "PAI-001-1", madeToOrder: null, htCents: 700 }),
      line({ clientKey: "company:b", companyId: "b", name: "Chalet B", htCents: 9_000 }),
    ]);
    expect(view.madeToOrderHtCents).toBe(13_000);
    expect(view.unknownHtCents).toBe(700);
    expect(view.clients.map((client) => client.name)).toEqual(["Chalet B", "Hôtel A"]);
    const hotel = view.clients[1];
    expect(hotel?.articles.map((article) => article.sku)).toEqual(["GAT-002-1", "ENT-001-1"]);
    expect(hotel).toMatchObject({ madeToOrderHtCents: 4_000, unknownHtCents: 700 });
  });

  it("garde un client qui n'a que des lignes d'avant le suivi, sans article", () => {
    const view = byClientReportOf("2026-10-01", "2026-10-31", [
      line({ clientKey: "person:u", kind: "person", companyId: null, madeToOrder: null }),
    ]);
    expect(view.clients).toEqual([
      expect.objectContaining({ kind: "person", madeToOrderHtCents: 0, articles: [] }),
    ]);
  });

  it("départage à HT égal par l'inconnu, puis par le nom", () => {
    const view = byClientReportOf("2026-10-01", "2026-10-31", [
      line({ clientKey: "company:z", name: "Zèbre" }),
      line({ clientKey: "company:y", name: "Yack" }),
      line({ clientKey: "company:x", name: "Xénon" }),
      line({ clientKey: "company:x", name: "Xénon", madeToOrder: null, htCents: 50 }),
    ]);
    expect(view.clients.map((client) => client.name)).toEqual(["Xénon", "Yack", "Zèbre"]);
  });
});
