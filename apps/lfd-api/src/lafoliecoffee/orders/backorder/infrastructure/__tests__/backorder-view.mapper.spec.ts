import { backorderLinesJson, type BackorderRow } from "../backorder.mapper.js";
import { backorderViewOf, type BackorderViewRow } from "../backorder-view.mapper.js";
import { BackorderLine } from "../../domain/value-objects/backorder-line.js";

const CREATED_AT = new Date("2026-01-10T09:00:00.000Z");

function row(overrides: Partial<BackorderViewRow> = {}): BackorderViewRow {
  const base: BackorderRow = {
    id: "bo_1",
    originOrderId: "ord_origin",
    companyId: "co_1",
    buyerUserId: "usr_1",
    lines: backorderLinesJson([
      BackorderLine.of({ sku: "VIE-001-1", quantity: 2, saleUnit: "piece" }),
      BackorderLine.of({ sku: "PAI-010-1", quantity: 750, saleUnit: "weight" }),
    ]),
    state: "open",
    convertedOrderId: null,
    closedAt: null,
    closedByStaffId: null,
    createdAt: CREATED_AT,
  };
  return {
    ...base,
    originOrder: {
      orderNumber: "ORD-1",
      company: { raisonSociale: "Boulangerie Durand SARL", enseigne: "Chez Durand" },
      placedBy: { firstName: "Marie", lastName: "Durand", email: "marie@example.test" },
      lines: [
        { sku: "VIE-001-1", productNameSnapshot: "Viennoiserie du jour" },
        { sku: "PAI-010-1", productNameSnapshot: "Pain de campagne" },
      ],
    },
    convertedOrder: null,
    ...overrides,
  };
}

describe("backorderViewOf", () => {
  it("nomme chaque ligne d'après le nom figé à la commande d'origine, quantité et unité intactes", () => {
    const view = backorderViewOf(row());

    expect(view.lines).toEqual([
      { sku: "VIE-001-1", productName: "Viennoiserie du jour", quantity: 2, saleUnit: "piece" },
      { sku: "PAI-010-1", productName: "Pain de campagne", quantity: 750, saleUnit: "weight" },
    ]);
  });

  it("à défaut de nom figé, la ligne se nomme par son SKU", () => {
    const base = row();
    const view = backorderViewOf({
      ...base,
      originOrder: { ...base.originOrder, lines: [] },
    });

    expect(view.lines.map((line) => line.productName)).toEqual(["VIE-001-1", "PAI-010-1"]);
  });

  it("l'enseigne prime ; vide ou blanche, la raison sociale prend le relais", () => {
    const base = row();
    const named = (enseigne: string) =>
      backorderViewOf({
        ...base,
        originOrder: {
          ...base.originOrder,
          company: { raisonSociale: "Durand SARL", enseigne },
        },
      }).company;

    expect(named("Chez Durand")).toEqual({ id: "co_1", name: "Chez Durand" });
    expect(named("")?.name).toBe("Durand SARL");
    expect(named("   ")?.name).toBe("Durand SARL");
  });

  it("un particulier (société nulle) n'a pas de société dans la vue", () => {
    const base = row({ companyId: null });

    const view = backorderViewOf({ ...base, originOrder: { ...base.originOrder, company: null } });

    expect(view.company).toBeNull();
  });

  it("l'acheteur sans nom se désigne par son identifiant de connexion", () => {
    const base = row();
    const buyer = (firstName: string, lastName: string) =>
      backorderViewOf({
        ...base,
        originOrder: {
          ...base.originOrder,
          placedBy: { firstName, lastName, email: "marie@example.test" },
        },
      }).buyer;

    expect(buyer("Marie", "Durand")).toEqual({ userId: "usr_1", name: "Marie Durand" });
    expect(buyer("", "").name).toBe("marie@example.test");
    expect(buyer("  ", " ").name).toBe("marie@example.test");
    // Un seul des deux noms suffit : pas d'espace parasite.
    expect(buyer("Marie", "").name).toBe("Marie");
    expect(buyer("", "Durand").name).toBe("Durand");
  });

  it("ouvert : ni commande issue, ni date de fermeture", () => {
    const view = backorderViewOf(row());

    expect(view).toMatchObject({
      state: "open",
      convertedOrder: null,
      closedAt: null,
      createdAt: CREATED_AT.toISOString(),
      origin: { orderId: "ord_origin", orderNumber: "ORD-1" },
    });
  });

  it("transformé : la commande issue porte son numéro et la fermeture est datée", () => {
    const closedAt = new Date("2026-01-11T09:00:00.000Z");

    const view = backorderViewOf(
      row({
        state: "converted",
        convertedOrderId: "ord_new",
        closedAt,
        closedByStaffId: "staff_1",
        convertedOrder: { orderNumber: "ORD-2" },
      }),
    );

    expect(view.convertedOrder).toEqual({ orderId: "ord_new", orderNumber: "ORD-2" });
    expect(view.closedAt).toBe(closedAt.toISOString());
  });

  it("abandonné : fermé, mais aucune commande issue", () => {
    const view = backorderViewOf(
      row({ state: "abandoned", closedAt: CREATED_AT, closedByStaffId: "staff_1" }),
    );

    expect(view).toMatchObject({
      state: "abandoned",
      convertedOrder: null,
      closedAt: CREATED_AT.toISOString(),
    });
  });
});
