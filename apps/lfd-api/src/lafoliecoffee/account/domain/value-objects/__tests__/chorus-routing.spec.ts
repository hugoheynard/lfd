import { InvalidChorusRoutingError } from "../../errors/account-errors.js";
import { ChorusRoutingQuoteWithoutCommitmentError } from "../../errors/chorus-routing-errors.js";
import { ChorusRouting } from "../chorus-routing.js";

const AGENT = { staffUserId: "staff_1", name: "Camille", role: "commercial" };
const READING = {
  commitmentRequired: true,
  serviceCodeRequired: true,
  defaultServiceCode: "  SERVICE-A  ",
  commitmentTiming: "at_order" as const,
  checkedOn: "2026-11-01",
};

describe("ChorusRouting — la fiche relevée dans l'annuaire", () => {
  it("garde le relevé, le code service rogné", () => {
    const routing = ChorusRouting.record(READING, AGENT);

    expect(routing.defaultServiceCode).toBe("SERVICE-A");
    expect(routing.checkedOn).toBe("2026-11-01");
    expect(routing.checkedBy).toEqual(AGENT);
  });

  it("permet un code service exigé sans défaut : il se saisira à la commande", () => {
    expect(
      ChorusRouting.record({ ...READING, defaultServiceCode: "" }, AGENT).defaultServiceCode,
    ).toBe("");
  });

  it("refuse un code service de plus de 100 caractères", () => {
    expect(() =>
      ChorusRouting.record({ ...READING, defaultServiceCode: "x".repeat(101) }, AGENT),
    ).toThrow(InvalidChorusRoutingError);
  });

  it.each(["2026-02-30", "2026-13-01", "01/11/2026", "2025-02-29"])(
    "refuse une date du relevé qui n'est pas un jour : %s",
    (checkedOn) => {
      expect(() => ChorusRouting.record({ ...READING, checkedOn }, AGENT)).toThrow(
        InvalidChorusRoutingError,
      );
    },
  );

  it("accepte le 29 février d'une année bissextile", () => {
    expect(ChorusRouting.record({ ...READING, checkedOn: "2028-02-29" }, AGENT).checkedOn).toBe(
      "2028-02-29",
    );
  });

  it("reconnaît le même relevé, quel que soit l'agent", () => {
    const first = ChorusRouting.record(READING, AGENT);
    const again = ChorusRouting.record(READING, { ...AGENT, staffUserId: "staff_2" });

    expect(first.sameReadingAs(again)).toBe(true);
    expect(
      first.sameReadingAs(ChorusRouting.record({ ...READING, checkedOn: "2026-11-02" }, AGENT)),
    ).toBe(false);
  });

  it("refuse le devis de période sans engagement exigé", () => {
    expect(() =>
      ChorusRouting.record(
        { ...READING, commitmentRequired: false, commitmentTiming: "on_period_quote" },
        AGENT,
      ),
    ).toThrow(ChorusRoutingQuoteWithoutCommitmentError);
  });

  it("dit un changement de mode, une fiche absente valant « à la commande »", () => {
    const atOrder = ChorusRouting.record(READING, AGENT);
    const onQuote = ChorusRouting.record(
      { ...READING, commitmentTiming: "on_period_quote" },
      AGENT,
    );

    expect(atOrder.changesTimingFrom(null)).toBe(false);
    expect(onQuote.changesTimingFrom(null)).toBe(true);
    expect(onQuote.changesTimingFrom(atOrder)).toBe(true);
    expect(onQuote.sameReadingAs(atOrder)).toBe(false);
  });
});
