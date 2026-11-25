import {
  DuplicateBackorderLineError,
  EmptyBackorderError,
  InvalidBackorderLineError,
} from "../../domain/errors/backorder-errors.js";
import { BackorderLine } from "../../domain/value-objects/backorder-line.js";
import {
  backorderLinesJson,
  backorderOf,
  BackorderRowUnreadableError,
  type BackorderRow,
} from "../backorder.mapper.js";

const CREATED_AT = new Date("2026-01-10T09:00:00.000Z");

function row(overrides: Partial<BackorderRow> = {}): BackorderRow {
  return {
    id: "bo_1",
    originOrderId: "ord_origin",
    companyId: "co_1",
    buyerUserId: "usr_1",
    lines: [{ sku: "PAI-010-1", quantity: 750, sale_unit: "weight" }],
    state: "open",
    convertedOrderId: null,
    closedAt: null,
    closedByStaffId: null,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

describe("le mapper du reliquat", () => {
  it("relit une ligne écrite par lui, aller-retour compris", () => {
    const lines = [
      BackorderLine.of({ sku: "VIE-001-1", quantity: 2, saleUnit: "piece" }),
      BackorderLine.of({ sku: "PAI-010-1", quantity: 750, saleUnit: "weight" }),
    ];

    const snapshot = backorderOf(row({ lines: backorderLinesJson(lines) })).toSnapshot();

    expect(backorderLinesJson(snapshot.lines)).toEqual([
      { sku: "VIE-001-1", quantity: 2, sale_unit: "piece" },
      { sku: "PAI-010-1", quantity: 750, sale_unit: "weight" },
    ]);
    expect(snapshot).toMatchObject({ id: "bo_1", state: "open", createdAt: CREATED_AT });
  });

  it("relit un reliquat transformé", () => {
    const closedAt = new Date("2026-01-11T09:00:00.000Z");

    const snapshot = backorderOf(
      row({
        state: "converted",
        convertedOrderId: "ord_new",
        closedAt,
        closedByStaffId: "staff_1",
      }),
    ).toSnapshot();

    expect(snapshot).toMatchObject({ state: "converted", convertedOrderId: "ord_new", closedAt });
  });

  it("refuse un état inconnu", () => {
    expect(() => backorderOf(row({ state: "to_redeliver" }))).toThrow(BackorderRowUnreadableError);
  });

  it.each([
    ["des lignes qui ne sont pas une liste", { sku: "X" }],
    ["une ligne qui n'est pas un objet", ["X"]],
    ["une ligne sans unité", [{ sku: "X", quantity: 1 }]],
  ])("refuse %s", (_case, lines) => {
    expect(() => backorderOf(row({ lines }))).toThrow(BackorderRowUnreadableError);
  });

  it("revalide la quantité par le value object", () => {
    expect(() =>
      backorderOf(row({ lines: [{ sku: "X", quantity: 0, sale_unit: "piece" }] })),
    ).toThrow(InvalidBackorderLineError);
  });
});

describe("le mapper du reliquat — frontières", () => {
  // Les trois états d'une absence : pas de société (particulier), pas de
  // commande issue (abandonné), pas de sort (ouvert) restent null, jamais "".
  it("garde null pour un particulier, un reliquat ouvert, un abandonné", () => {
    const open = backorderOf(row({ companyId: null })).toSnapshot();
    const abandoned = backorderOf(
      row({ state: "abandoned", closedAt: CREATED_AT, closedByStaffId: "staff_1" }),
    ).toSnapshot();

    expect(open).toMatchObject({ companyId: null, convertedOrderId: null, closedAt: null });
    expect(abandoned).toMatchObject({ convertedOrderId: null, state: "abandoned" });
  });

  it("refuse des lignes null (le jsonb null)", () => {
    expect(() => backorderOf(row({ lines: null }))).toThrow(BackorderRowUnreadableError);
  });

  it("refuse une liste vide écrite hors de l'agrégat", () => {
    expect(() => backorderOf(row({ lines: [] }))).toThrow(EmptyBackorderError);
  });

  it("refuse deux lignes du même article écrites hors de l'agrégat", () => {
    const lines = [
      { sku: "X", quantity: 1, sale_unit: "piece" },
      { sku: "X", quantity: 2, sale_unit: "piece" },
    ];

    expect(() => backorderOf(row({ lines }))).toThrow(DuplicateBackorderLineError);
  });

  it.each([
    ["une quantité en texte", { sku: "X", quantity: "2", sale_unit: "piece" }],
    ["une quantité null", { sku: "X", quantity: null, sale_unit: "piece" }],
    ["un article null", { sku: null, quantity: 1, sale_unit: "piece" }],
    ["la clé saleUnit en camelCase", { sku: "X", quantity: 1, saleUnit: "piece" }],
    ["une ligne null", null],
  ])("refuse %s", (_case, line) => {
    expect(() => backorderOf(row({ lines: [line] }))).toThrow(BackorderRowUnreadableError);
  });

  it("le refus nomme le reliquat illisible", () => {
    expect(() => backorderOf(row({ id: "bo_42", state: "x" }))).toThrow(/bo_42/u);
  });

  it("une unité inconnue en base est refusée par le value object", () => {
    expect(() =>
      backorderOf(row({ lines: [{ sku: "X", quantity: 1, sale_unit: "litre" }] })),
    ).toThrow(InvalidBackorderLineError);
  });

  it("l'ordre des lignes survit à la relecture", () => {
    const lines = [
      { sku: "B", quantity: 1, sale_unit: "piece" },
      { sku: "A", quantity: 5, sale_unit: "weight" },
    ];

    const out = backorderOf(row({ lines }))
      .toSnapshot()
      .lines.map((line) => line.sku);

    expect(out).toEqual(["B", "A"]);
  });
});
