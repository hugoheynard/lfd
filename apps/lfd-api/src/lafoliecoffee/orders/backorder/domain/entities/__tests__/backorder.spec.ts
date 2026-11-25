import {
  BackorderClosedError,
  BackorderConvertedIntoOriginError,
  DuplicateBackorderLineError,
  EmptyBackorderError,
} from "../../errors/backorder-errors.js";
import { BackorderLine } from "../../value-objects/backorder-line.js";
import { Backorder, type BackorderOpening } from "../backorder.js";

const OPENED_AT = new Date("2026-01-10T09:00:00.000Z");
const CLOSED_AT = new Date("2026-01-11T10:00:00.000Z");
const STAFF = "staff_1";

function opening(overrides: Partial<BackorderOpening> = {}): BackorderOpening {
  return {
    id: "bo_1",
    originOrderId: "ord_origin",
    companyId: "co_1",
    buyerUserId: "usr_1",
    lines: [
      BackorderLine.of({ sku: "VIE-001-1", quantity: 2, saleUnit: "piece" }),
      BackorderLine.of({ sku: "PAI-010-1", quantity: 750, saleUnit: "weight" }),
    ],
    openedAt: OPENED_AT,
    ...overrides,
  };
}

describe("Backorder.open", () => {
  it("naît ouvert, sans sort ni auteur", () => {
    const snapshot = Backorder.open(opening()).toSnapshot();

    expect(snapshot).toMatchObject({
      id: "bo_1",
      originOrderId: "ord_origin",
      companyId: "co_1",
      buyerUserId: "usr_1",
      state: "open",
      convertedOrderId: null,
      closedAt: null,
      closedByStaffId: null,
      createdAt: OPENED_AT,
    });
    expect(snapshot.lines.map((line) => line.sku)).toEqual(["VIE-001-1", "PAI-010-1"]);
  });

  it("admet un particulier, sans société", () => {
    expect(Backorder.open(opening({ companyId: null })).toSnapshot().companyId).toBeNull();
  });

  it("refuse un reliquat sans ligne", () => {
    expect(() => Backorder.open(opening({ lines: [] }))).toThrow(EmptyBackorderError);
  });

  it("refuse deux lignes du même article", () => {
    const line = BackorderLine.of({ sku: "VIE-001-1", quantity: 1, saleUnit: "piece" });

    expect(() => Backorder.open(opening({ lines: [line, line] }))).toThrow(
      DuplicateBackorderLineError,
    );
  });

  it("ne se laisse pas modifier par la liste qu'on lui a donnée", () => {
    const lines = [BackorderLine.of({ sku: "VIE-001-1", quantity: 1, saleUnit: "piece" })];
    const backorder = Backorder.open(opening({ lines }));

    lines.push(BackorderLine.of({ sku: "X-1", quantity: 1, saleUnit: "piece" }));

    expect(backorder.toSnapshot().lines).toHaveLength(1);
  });
});

describe("Backorder.convert", () => {
  it("passe à converted, lié à la commande, avec qui et quand", () => {
    const backorder = Backorder.open(opening());

    backorder.convert("ord_new", CLOSED_AT, STAFF);

    expect(backorder.isOpen).toBe(false);
    expect(backorder.toSnapshot()).toMatchObject({
      state: "converted",
      convertedOrderId: "ord_new",
      closedAt: CLOSED_AT,
      closedByStaffId: STAFF,
    });
  });

  it("refuse la commande d'origine comme commande issue", () => {
    const backorder = Backorder.open(opening());

    expect(() => backorder.convert("ord_origin", CLOSED_AT, STAFF)).toThrow(
      BackorderConvertedIntoOriginError,
    );
    expect(backorder.isOpen).toBe(true);
  });

  it("refuse un reliquat déjà transformé, sans rien changer", () => {
    const backorder = Backorder.open(opening());
    backorder.convert("ord_new", CLOSED_AT, STAFF);

    expect(() => backorder.convert("ord_other", CLOSED_AT, "staff_2")).toThrow(
      BackorderClosedError,
    );
    expect(backorder.toSnapshot().convertedOrderId).toBe("ord_new");
  });

  it("refuse un reliquat abandonné", () => {
    const backorder = Backorder.open(opening());
    backorder.abandon(CLOSED_AT, STAFF);

    expect(() => backorder.convert("ord_new", CLOSED_AT, STAFF)).toThrow(BackorderClosedError);
  });
});

describe("Backorder.abandon", () => {
  it("passe à abandoned, sans commande issue", () => {
    const backorder = Backorder.open(opening());

    backorder.abandon(CLOSED_AT, STAFF);

    expect(backorder.toSnapshot()).toMatchObject({
      state: "abandoned",
      convertedOrderId: null,
      closedAt: CLOSED_AT,
      closedByStaffId: STAFF,
    });
  });

  it("refuse un second abandon, en le disant définitif", () => {
    const backorder = Backorder.open(opening());
    backorder.abandon(CLOSED_AT, STAFF);

    expect(() => backorder.abandon(CLOSED_AT, STAFF)).toThrow(/déjà abandonné.*définitif/u);
  });

  it("refuse un reliquat transformé", () => {
    const backorder = Backorder.open(opening());
    backorder.convert("ord_new", CLOSED_AT, STAFF);

    expect(() => backorder.abandon(CLOSED_AT, STAFF)).toThrow(/déjà transformé en commande/u);
  });
});

describe("Backorder.restore", () => {
  it("relit un reliquat fermé, qui refuse alors toute fermeture", () => {
    const written = Backorder.open(opening());
    written.abandon(CLOSED_AT, STAFF);

    const restored = Backorder.restore(written.toSnapshot());

    expect(restored.toSnapshot()).toEqual(written.toSnapshot());
    expect(() => restored.convert("ord_new", CLOSED_AT, STAFF)).toThrow(BackorderClosedError);
  });

  it("refuse une relecture sans ligne", () => {
    const snapshot = Backorder.open(opening()).toSnapshot();

    expect(() => Backorder.restore({ ...snapshot, lines: [] })).toThrow(EmptyBackorderError);
  });
});

describe("Backorder — frontières", () => {
  // Deux écritures du même article, l'une avec des espaces : la ligne les
  // rogne, donc c'est bien un doublon.
  it("voit un doublon que les espaces déguisent", () => {
    const lines = [
      BackorderLine.of({ sku: "VIE-001-1", quantity: 1, saleUnit: "piece" }),
      BackorderLine.of({ sku: " VIE-001-1 ", quantity: 1, saleUnit: "piece" }),
    ];

    expect(() => Backorder.open(opening({ lines }))).toThrow(DuplicateBackorderLineError);
  });

  it("refuse un doublon aussi à la relecture", () => {
    const line = BackorderLine.of({ sku: "VIE-001-1", quantity: 1, saleUnit: "piece" });
    const snapshot = Backorder.open(opening()).toSnapshot();

    expect(() => Backorder.restore({ ...snapshot, lines: [line, line] })).toThrow(
      DuplicateBackorderLineError,
    );
  });

  // Le même sku en pièces et au poids reste UN article : une ligne par article.
  it("refuse le même article en pièces et au poids", () => {
    const lines = [
      BackorderLine.of({ sku: "PAI-010-1", quantity: 1, saleUnit: "piece" }),
      BackorderLine.of({ sku: "PAI-010-1", quantity: 500, saleUnit: "weight" }),
    ];

    expect(() => Backorder.open(opening({ lines }))).toThrow(DuplicateBackorderLineError);
  });

  it("ne laisse pas l'instantané modifier l'agrégat", () => {
    const backorder = Backorder.open(opening());
    const snapshot = backorder.toSnapshot();

    (snapshot.lines as BackorderLine[]).pop();

    expect(backorder.toSnapshot().lines).toHaveLength(2);
  });

  it("ne partage pas la liste de l'instantané relu", () => {
    const snapshot = Backorder.open(opening()).toSnapshot();
    const lines = [...snapshot.lines];
    const restored = Backorder.restore({ ...snapshot, lines });

    lines.length = 0;

    expect(restored.toSnapshot().lines).toHaveLength(2);
  });

  it("un refus ne laisse ni sort, ni auteur, ni date", () => {
    const backorder = Backorder.open(opening());
    const before = backorder.toSnapshot();

    expect(() => backorder.convert("ord_origin", CLOSED_AT, STAFF)).toThrow(
      BackorderConvertedIntoOriginError,
    );

    expect(backorder.toSnapshot()).toEqual(before);
  });

  it("un reliquat abandonné refusé en conversion reste sans commande issue", () => {
    const backorder = Backorder.open(opening());
    backorder.abandon(CLOSED_AT, STAFF);
    const before = backorder.toSnapshot();

    expect(() =>
      backorder.convert("ord_new", new Date(CLOSED_AT.getTime() + 1), "staff_2"),
    ).toThrow(BackorderClosedError);

    expect(backorder.toSnapshot()).toEqual(before);
  });

  // Fermé, ET pointer la commande d'origine : c'est « déjà fermé » qui
  // renseigne le mieux l'équipe, la commande d'origine est un détail.
  it("sur un reliquat fermé, le refus nomme la fermeture avant l'origine", () => {
    const backorder = Backorder.open(opening());
    backorder.abandon(CLOSED_AT, STAFF);

    expect(() => backorder.convert("ord_origin", CLOSED_AT, STAFF)).toThrow(BackorderClosedError);
  });

  it("un particulier garde l'absence de société après un sort", () => {
    const backorder = Backorder.open(opening({ companyId: null }));
    backorder.abandon(CLOSED_AT, STAFF);

    expect(backorder.toSnapshot().companyId).toBeNull();
  });
});
