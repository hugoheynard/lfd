import { type PackableOrder, packableLines } from "../packable.js";

/**
 * Le colisable : le stock d'un article, attribué par échéance croissante, sans
 * échéance en dernier, couvre-t-il la ligne ? Éprouvé sans Nest ni base.
 */
function order(
  orderId: string,
  dueAt: string | null,
  lines: Readonly<Record<string, number>>,
  reference = `CMD-${orderId}`,
): PackableOrder {
  return {
    orderId,
    reference,
    dueAt,
    lines: Object.entries(lines).map(([sku, quantity]) => ({ sku, quantity })),
  };
}

const stock = (entries: Readonly<Record<string, number>>) => new Map(Object.entries(entries));

/** `orderId:sku → colisable`, pour des assertions lisibles. */
function verdicts(orders: readonly PackableOrder[], available: ReadonlyMap<string, number>) {
  return Object.fromEntries(
    packableLines(orders, available).map((line) => [`${line.orderId}:${line.sku}`, line.packable]),
  );
}

describe("packableLines — l'attribution par échéance", () => {
  it("sans aucun stock, rien n'est colisable", () => {
    expect(verdicts([order("a", "07:00", { CRO: 2 })], stock({}))).toEqual({ "a:CRO": false });
  });

  it("un stock qui couvre tout rend tout colisable", () => {
    expect(
      verdicts(
        [order("a", "07:00", { CRO: 2 }), order("b", "08:00", { CRO: 3 })],
        stock({ CRO: 5 }),
      ),
    ).toEqual({ "a:CRO": true, "b:CRO": true });
  });

  it("l'échéance la plus PROCHE est servie d'abord, quel que soit l'ordre d'arrivée", () => {
    const orders = [order("tard", "09:00", { CRO: 4 }), order("tot", "06:30", { CRO: 4 })];
    expect(verdicts(orders, stock({ CRO: 4 }))).toEqual({ "tot:CRO": true, "tard:CRO": false });
  });

  it("une commande SANS échéance passe en dernier, même avant une échéance tardive", () => {
    const orders = [order("libre", null, { CRO: 3 }), order("tard", "23:30", { CRO: 3 })];
    expect(verdicts(orders, stock({ CRO: 3 }))).toEqual({ "tard:CRO": true, "libre:CRO": false });
  });

  it("🔴 l'attribution est STRICTE : une plus tardive ne passe pas devant une plus proche non couverte", () => {
    // 5 en stock : la 06:00 en veut 8 et n'est pas couverte ; la 07:00 en veut 2
    // et tiendrait — elle n'a pourtant rien, la première a tout pris.
    const orders = [order("a", "06:00", { CRO: 8 }), order("b", "07:00", { CRO: 2 })];
    const lines = packableLines(orders, stock({ CRO: 5 }));
    expect(lines.map((line) => [line.orderId, line.allocated, line.packable])).toEqual([
      ["a", 5, false],
      ["b", 0, false],
    ]);
  });

  it("chaque article a son propre stock", () => {
    const orders = [
      order("a", "06:00", { CRO: 2, PAI: 1 }),
      order("b", "07:00", { CRO: 1, PAI: 1 }),
    ];
    expect(verdicts(orders, stock({ CRO: 3, PAI: 1 }))).toEqual({
      "a:CRO": true,
      "a:PAI": true,
      "b:CRO": true,
      "b:PAI": false,
    });
  });

  it("à échéance égale, la référence puis l'identifiant départagent", () => {
    const orders = [
      order("z", "07:00", { CRO: 1 }, "CMD-2"),
      order("y", "07:00", { CRO: 1 }, "CMD-1"),
      order("x", "07:00", { CRO: 1 }, "CMD-1"),
    ];
    expect(packableLines(orders, stock({ CRO: 2 })).map((line) => line.orderId)).toEqual([
      "x",
      "y",
      "z",
    ]);
    expect(verdicts(orders, stock({ CRO: 2 }))).toEqual({
      "x:CRO": true,
      "y:CRO": true,
      "z:CRO": false,
    });
  });

  it("deux commandes sans échéance se départagent aussi par la référence", () => {
    const orders = [order("b", null, { CRO: 1 }, "CMD-2"), order("a", null, { CRO: 1 }, "CMD-1")];
    expect(verdicts(orders, stock({ CRO: 1 }))).toEqual({ "a:CRO": true, "b:CRO": false });
  });

  it("les lignes d'un même article d'une commande s'additionnent", () => {
    const twice: PackableOrder = {
      orderId: "a",
      reference: "CMD-a",
      dueAt: "07:00",
      lines: [
        { sku: "CRO", quantity: 2 },
        { sku: "CRO", quantity: 3 },
      ],
    };
    expect(packableLines([twice], stock({ CRO: 4 }))).toEqual([
      { orderId: "a", reference: "CMD-a", sku: "CRO", quantity: 5, allocated: 4, packable: false },
    ]);
  });

  it("un stock NÉGATIF vaut zéro — un retour arrivé avant sa remise", () => {
    expect(verdicts([order("a", "07:00", { CRO: 1 })], stock({ CRO: -3 }))).toEqual({
      "a:CRO": false,
    });
  });

  it("un stock exactement égal à la ligne la couvre", () => {
    expect(verdicts([order("a", "07:00", { CRO: 6 })], stock({ CRO: 6 }))).toEqual({
      "a:CRO": true,
    });
  });

  it("aucune commande, aucune ligne", () => {
    expect(packableLines([], stock({ CRO: 10 }))).toEqual([]);
  });

  it("ne modifie ni les commandes ni le stock reçus", () => {
    const orders = [order("b", "08:00", { CRO: 1 }), order("a", "07:00", { CRO: 1 })];
    const available = stock({ CRO: 1 });
    packableLines(orders, available);
    expect(orders.map((entry) => entry.orderId)).toEqual(["b", "a"]);
    expect(available.get("CRO")).toBe(1);
  });
});
