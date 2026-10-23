import { BankReturnCheckDay } from "../bank-return-check.js";
import {
  BankReturnCheckAlreadyAttestedError,
  BankReturnCheckNotAttestedError,
  InvalidBankReturnCheckError,
} from "../../errors/bank-return-check-errors.js";

/**
 * L'agrégat « Retours contrôlés » d'une entité pour un jour (P3). Les jours ne
 * se comparent qu'entre eux : « aujourd'hui » est un paramètre.
 */

const DAY = "2026-11-16";
const AT = new Date(Date.UTC(2026, 10, 16, 9, 0));
const LATER = new Date(Date.UTC(2026, 10, 16, 10, 0));

function empty(day = DAY): BankReturnCheckDay {
  return BankReturnCheckDay.rehydrate({ legalEntityId: "le1", day, entries: [] });
}

describe("« Retours contrôlés » — poser", () => {
  it("atteste le jour : une ligne neuve, qui fait foi", () => {
    const day = empty();
    const entry = day.attest("chk_1", { at: AT, staffId: "staff_1" }, DAY);

    expect(entry).toEqual({
      id: "chk_1",
      day: DAY,
      at: AT,
      staffId: "staff_1",
      withdrawn: false,
      note: null,
    });
    expect(day.standing?.id).toBe("chk_1");
    expect(day.newEntries()).toEqual([entry]);
  });

  it("un jour passé s'atteste encore ; un jour à venir, non", () => {
    expect(() => empty("2026-11-13").attest("a", { at: AT, staffId: "s" }, DAY)).not.toThrow();
    expect(() => empty("2026-11-17").attest("a", { at: AT, staffId: "s" }, DAY)).toThrow(
      InvalidBankReturnCheckError,
    );
  });

  it("refuse un jour déjà attesté", () => {
    const day = empty();
    day.attest("a", { at: AT, staffId: "s" }, DAY);
    expect(() => day.attest("b", { at: LATER, staffId: "s" }, DAY)).toThrow(
      BankReturnCheckAlreadyAttestedError,
    );
  });

  it("refuse un jour illisible", () => {
    expect(() => empty("16/11/2026")).toThrow(InvalidBankReturnCheckError);
  });
});

describe("« Retours contrôlés » — retirer, sans rien effacer", () => {
  it("le retrait est une ligne de plus, avec sa note ; la dernière fait foi", () => {
    const day = BankReturnCheckDay.rehydrate({
      legalEntityId: "le1",
      day: DAY,
      entries: [{ id: "a", day: DAY, at: AT, staffId: "s", withdrawn: false, note: null }],
    });

    const entry = day.withdraw("b", { at: LATER, staffId: "s2" }, "  fichier de la veille  ");

    expect(entry).toMatchObject({ withdrawn: true, note: "fichier de la veille" });
    expect(day.standing).toBeNull();
    expect(day.newEntries().map((added) => added.id)).toEqual(["b"]);
  });

  it("retiré, le jour se pose de nouveau", () => {
    const day = empty();
    day.attest("a", { at: AT, staffId: "s" }, DAY);
    day.withdraw("b", { at: LATER, staffId: "s" }, "erreur");
    day.attest("c", { at: new Date(LATER.getTime() + 1), staffId: "s" }, DAY);

    expect(day.standing?.id).toBe("c");
  });

  it("refuse de retirer ce qui n'est pas attesté", () => {
    expect(() => empty().withdraw("b", { at: AT, staffId: "s" }, "erreur")).toThrow(
      BankReturnCheckNotAttestedError,
    );
  });

  it("refuse un retrait sans raison", () => {
    const day = empty();
    day.attest("a", { at: AT, staffId: "s" }, DAY);
    expect(() => day.withdraw("b", { at: LATER, staffId: "s" }, "   ")).toThrow(
      InvalidBankReturnCheckError,
    );
  });
});
