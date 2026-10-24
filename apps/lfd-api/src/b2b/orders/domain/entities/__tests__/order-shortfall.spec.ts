import { EmptyShortfallError } from "../../errors/order-shortfall-errors.js";
import { OrderShortfall, type ShortfallQuantity } from "../order-shortfall.js";

// Instants comparés entre eux, jamais à l'horloge.
const T1 = new Date(1_000);
const T2 = new Date(2_000);
const T3 = new Date(3_000);
const FIRST: readonly ShortfallQuantity[] = [{ sku: "CRO", due: 12, packed: 9 }];
const SECOND: readonly ShortfallQuantity[] = [{ sku: "CRO", due: 12, packed: 11 }];

function none(): OrderShortfall {
  return OrderShortfall.fromSnapshot({
    orderId: "ord_1",
    reference: "CMD-0001",
    reportedAt: null,
    lines: null,
    clearedAt: null,
  });
}

describe("OrderShortfall — « Manque signalé — décision attendue » (E6a)", () => {
  it("un signalement pose l'instant et les quantités", () => {
    const shortfall = none();

    expect(shortfall.report(T1, FIRST)).toBe(true);
    expect(shortfall.awaitingDecision).toBe(true);
    expect(shortfall.toSnapshot()).toMatchObject({ reportedAt: T1, lines: FIRST });
  });

  it("un signalement plus récent REMPLACE les quantités", () => {
    const shortfall = none();
    shortfall.report(T1, FIRST);

    expect(shortfall.report(T2, SECOND)).toBe(true);
    expect(shortfall.toSnapshot()).toMatchObject({ reportedAt: T2, lines: SECOND });
  });

  it("un signalement plus ancien, livré en retard, ne gagne pas", () => {
    const shortfall = none();
    shortfall.report(T2, SECOND);

    expect(shortfall.report(T1, FIRST)).toBe(false);
    expect(shortfall.toSnapshot()).toMatchObject({ reportedAt: T2, lines: SECOND });
  });

  it("le même signalement rejoué est sans effet", () => {
    const shortfall = none();
    shortfall.report(T1, FIRST);

    expect(shortfall.report(T1, FIRST)).toBe(false);
  });

  it("refuse un signalement sans ligne", () => {
    expect(() => none().report(T1, [])).toThrow(EmptyShortfallError);
  });

  it("l'effacement lève la décision attendue", () => {
    const shortfall = none();
    shortfall.report(T1, FIRST);

    expect(shortfall.clear(T2)).toBe(true);
    expect(shortfall.awaitingDecision).toBe(false);
    expect(shortfall.toSnapshot()).toMatchObject({ reportedAt: null, lines: null, clearedAt: T2 });
  });

  it("un effacement plus ancien que le signalement en vigueur est sans effet", () => {
    const shortfall = none();
    shortfall.report(T2, SECOND);

    expect(shortfall.clear(T1)).toBe(false);
    expect(shortfall.awaitingDecision).toBe(true);
  });

  it("un signalement plus ancien qu'un effacement déjà reçu ne ressuscite pas", () => {
    const shortfall = none();
    shortfall.clear(T2);

    expect(shortfall.report(T1, FIRST)).toBe(false);
    expect(shortfall.awaitingDecision).toBe(false);
  });

  it("un signalement après un effacement rouvre la décision attendue", () => {
    const shortfall = none();
    shortfall.report(T1, FIRST);
    shortfall.clear(T2);

    expect(shortfall.report(T3, SECOND)).toBe(true);
    expect(shortfall.awaitingDecision).toBe(true);
  });
});
