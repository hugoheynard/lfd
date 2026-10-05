import { ContainersCountedError } from "../../errors/packing-container-errors.js";
import {
  PackedOrderSealedError,
  PackingLineNotFoundError,
} from "../../errors/packing-station-errors.js";
import { PackingSheet, type ContainerMode, type SheetMark } from "../packing-sheet.js";

/** Instants recopiés, jamais comparés à l'horloge. */
const AT = new Date("2026-09-13T05:10:00.000Z");
const LATER = new Date("2026-09-13T05:20:00.000Z");

function sheet(containerMode: ContainerMode, packed: SheetMark | null = null): PackingSheet {
  return PackingSheet.fromSnapshot({
    serviceDay: "2026-09-13",
    orderId: "ord_1",
    reference: "CMD-0001",
    packed,
    containers: 2,
    // Une commande sans ligne : rien à répartir, la fermeture ne bute que sur le mode.
    lines: [],
    containerMode,
    containerList: [],
    fulfillmentMethod: "pickup",
  });
}

describe("PackingSheet — une ligne", () => {
  it("refuse un SKU qui n'est pas sur ce bon", () => {
    expect(() => sheet("listed").lineToTouch("PAI")).toThrow(PackingLineNotFoundError);
  });

  it("refuse de toucher une ligne d'un bac FERMÉ", () => {
    expect(() => sheet("listed", { at: AT, by: "s1" }).lineToTouch("PAI")).toThrow(
      PackedOrderSealedError,
    );
  });
});

describe("PackingSheet — la fermeture", () => {
  it("ferme une fois ; refermer rend la signature d'ORIGINE, sans erreur", () => {
    const bac = sheet("listed");
    expect(bac.seal({ at: AT, by: "s1" })).toEqual({ mark: { at: AT, by: "s1" }, fresh: true });
    expect(bac.seal({ at: LATER, by: "s2" })).toEqual({ mark: { at: AT, by: "s1" }, fresh: false });
  });
});

describe("PackingSheet — une commande colisée avec l'ancien poste (`counted`, §17.6)", () => {
  it("🔴 ne se ferme plus, même vide, et le refus dit pourquoi", () => {
    const bac = sheet("counted");

    expect(() => bac.seal({ at: AT, by: "s1" })).toThrow(ContainersCountedError);
    expect(() => bac.seal({ at: AT, by: "s1" })).toThrow(
      "Commande CMD-0001 colisée avec l'ancien poste : elle ne se modifie plus ici.",
    );
    expect(bac.packed).toBeNull();
  });

  it("déjà fermée, elle ne se réannonce ni ne se rouvre", () => {
    const bac = sheet("counted", { at: AT, by: "s1" });

    expect(() => bac.seal({ at: LATER, by: "s2" })).toThrow(ContainersCountedError);
    expect(() => bac.reopen()).toThrow(ContainersCountedError);
    expect(bac.packed).toEqual({ at: AT, by: "s1" });
  });

  it("garde son compte de contenants, en lecture", () => {
    expect(sheet("counted").containers).toBe(2);
  });
});
