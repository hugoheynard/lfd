import { optionAudience, optionChoice, optionChoiceKey } from "../option-choice.js";
import {
  EmptyOptionChoiceLabelError,
  InvalidOptionChoiceAudienceError,
  InvalidOptionChoiceKeyError,
} from "../../errors/option-group-errors.js";

/** Un choix d'option : une clé stable, un libellé, une clientèle — sans prix. */
describe("optionChoiceKey", () => {
  it.each(["tranche", "tranche-fin", "x2", "a-b-c"])("admet « %s »", (key) => {
    expect(optionChoiceKey(key)).toBe(key);
  });

  it.each([
    "Tranché",
    "tranché",
    "tranche fin",
    "-tranche",
    "tranche-",
    "a--b",
    "",
    "a".repeat(41),
  ])("refuse « %s »", (key) => {
    expect(() => optionChoiceKey(key)).toThrow(InvalidOptionChoiceKeyError);
  });
});

describe("optionChoice", () => {
  it("nettoie le libellé et garde rang et archive", () => {
    expect(optionChoice({ key: "tranche", label: " Tranché ", audience: "both" }, 2, null)).toEqual(
      { key: "tranche", label: "Tranché", audience: "both", position: 2, archivedAt: null },
    );
  });

  it("refuse un libellé vide", () => {
    expect(() => optionChoice({ key: "tranche", label: "  ", audience: "both" }, 0, null)).toThrow(
      EmptyOptionChoiceLabelError,
    );
  });
});

describe("optionAudience", () => {
  it.each(["pro", "public", "both"])("admet « %s »", (raw) => {
    expect(optionAudience(raw)).toBe(raw);
  });

  it("refuse le réassort : un choix se propose à qui commande", () => {
    expect(() => optionAudience("resupply")).toThrow(InvalidOptionChoiceAudienceError);
  });
});
