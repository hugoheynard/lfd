import type { PurchaseScenarioContent } from "@lfd/contracts";

import { InvalidBinGapError } from "../../errors/delivery-floor-errors.js";
import {
  InvalidPurchaseScenarioNameError,
  PurchaseScenarioAlreadyArchivedError,
  PurchaseScenarioNotArchivedError,
  PurchaseScenarioUnreadableError,
} from "../../errors/delivery-purchase-scenario-errors.js";
import { PurchaseScenario } from "../purchase-scenario.js";

const AT = new Date(0);
const LATER = new Date(60_000);
const AUTHOR = { staffUserId: "staff_1", name: "Hugo H", role: "admin" };
const OTHER = { staffUserId: "staff_2", name: "Anne B", role: "admin" };

const CONTENT: PurchaseScenarioContent = {
  selection: {
    vehicles: [{ source: "candidate", id: "vc1" }],
    formats: [{ source: "bin_type", id: "bt1" }],
    gapCm: 1,
  },
  display: { criterion: "volume", showCostPerLiter: true },
};

const recorded = (name = "Kangoo contre Trafic"): PurchaseScenario =>
  PurchaseScenario.record({ id: "ps1", name, content: CONTENT, at: AT, author: AUTHOR });

describe("PurchaseScenario (B-D5)", () => {
  it("garde le nom rogné, le contenu et l'auteur figé", () => {
    const state = recorded("  Kangoo  ").toState();

    expect(state).toMatchObject({
      name: "Kangoo",
      stored: { readable: true, content: CONTENT },
      createdByStaffId: "staff_1",
      updatedBy: AUTHOR,
      archivedAt: null,
    });
  });

  it.each(["", "   ", "x".repeat(81)])("refuse le nom « %s »", (name) => {
    expect(() => recorded(name)).toThrow(InvalidPurchaseScenarioNameError);
  });

  it("refuse un jeu entre bacs que le tableau refuserait", () => {
    const content = { ...CONTENT, selection: { ...CONTENT.selection, gapCm: 11 } };

    expect(() =>
      PurchaseScenario.record({ id: "ps1", name: "Trop", content, at: AT, author: AUTHOR }),
    ).toThrow(InvalidBinGapError);
  });

  it("remplace le nom et le contenu, et retient le dernier auteur", () => {
    const scenario = recorded();
    const display = null;

    scenario.replace("Nouveau", { ...CONTENT, display }, LATER, OTHER);

    expect(scenario.toState()).toMatchObject({
      name: "Nouveau",
      stored: { readable: true, content: { display: null } },
      createdByStaffId: "staff_1",
      updatedAt: LATER,
      updatedBy: OTHER,
    });
  });

  it("répare un scénario illisible en le remplaçant", () => {
    const scenario = PurchaseScenario.restore({
      ...recorded().toState(),
      stored: { readable: false, reason: "selection.vehicles : au moins un véhicule" },
    });
    expect(() => scenario.content()).toThrow(PurchaseScenarioUnreadableError);

    scenario.replace("Réparé", CONTENT, LATER, OTHER);

    expect(scenario.content()).toEqual(CONTENT);
  });

  it("archive une fois, puis refuse de remplacer ou d'archiver encore", () => {
    const scenario = recorded();

    scenario.archive(LATER, OTHER);

    expect(scenario.archived).toBe(true);
    expect(() => scenario.archive(LATER, OTHER)).toThrow(PurchaseScenarioAlreadyArchivedError);
    expect(() => scenario.replace("X", CONTENT, LATER, OTHER)).toThrow(
      PurchaseScenarioAlreadyArchivedError,
    );
  });

  it("réactive un archivé, et refuse de réactiver un scénario en cours", () => {
    const scenario = recorded();
    expect(() => scenario.reactivate(LATER, OTHER)).toThrow(PurchaseScenarioNotArchivedError);

    scenario.archive(LATER, OTHER);
    scenario.reactivate(LATER, OTHER);

    expect(scenario.archived).toBe(false);
  });
});
