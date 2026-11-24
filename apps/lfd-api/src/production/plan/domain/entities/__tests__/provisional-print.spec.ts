import {
  ProvisionalPrint,
  type ProvisionalPrintState,
  plainChoiceOf,
  provisionalPdfKey,
  selectionOfChoice,
} from "../provisional-print.js";
import { InvalidProvisionalRunError } from "../../errors/provisional-print-errors.js";
import { DOSSIER_PARTS } from "../../services/day-dossier-selection.js";

const STATE: ProvisionalPrintState = {
  id: "print_1",
  serviceDay: "2026-11-26",
  run: 1,
  commerceVersion: 42,
  printedAt: new Date(),
  printedBy: "staff_1",
  orderFingerprints: new Map(),
  choice: { parts: new Set(DOSSIER_PARTS), groups: "all", orders: { kind: "all" } },
};

describe("une impression provisoire", () => {
  it("commence à 1 et suit le dernier numéro tiré", () => {
    expect(ProvisionalPrint.nextRunAfter(0)).toBe(1);
    expect(ProvisionalPrint.nextRunAfter(3)).toBe(4);
  });

  it.each([0, -1, 1.5])("refuse le numéro %p", (run) => {
    expect(() => ProvisionalPrint.drawn({ ...STATE, run })).toThrow(InvalidProvisionalRunError);
  });

  it("se range sous son jour et son numéro", () => {
    expect(provisionalPdfKey("2026-11-26", 4)).toBe("2026-11-26/provisoire-4.pdf");
  });
});

describe("le choix des commandes, vers la sélection du rendu", () => {
  const changed = new Set(["ord_2"]);

  it("« toutes » tire toutes les commandes", () => {
    expect(selectionOfChoice(STATE.choice, changed).orders).toBe("all");
  });

  it("« depuis #N » tire les commandes changées", () => {
    const choice = { ...STATE.choice, orders: { kind: "since" as const, run: 3 } };
    expect(selectionOfChoice(choice, changed).orders).toBe(changed);
  });

  it("« choisies » tire les commandes cochées, et se garde en liste", () => {
    const orderIds = new Set(["ord_1"]);
    const choice = { ...STATE.choice, orders: { kind: "chosen" as const, orderIds } };
    expect(selectionOfChoice(choice, changed).orders).toBe(orderIds);
    expect(plainChoiceOf(choice).orders).toEqual({ kind: "chosen", orderIds: ["ord_1"] });
  });
});
