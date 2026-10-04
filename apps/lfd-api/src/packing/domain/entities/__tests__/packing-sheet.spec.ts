import {
  ContainerCeilingReachedError,
  InvalidContainerCountError,
  PackedOrderSealedError,
  PackingLineNotFoundError,
} from "../../errors/packing-station-errors.js";
import { MAX_CONTAINERS_PER_ORDER, PackingSheet } from "../packing-sheet.js";

/** Instants recopiés, jamais comparés à l'horloge. */
const AT = new Date("2026-09-13T05:10:00.000Z");
const LATER = new Date("2026-09-13T05:20:00.000Z");

function sheet(containers = 0): PackingSheet {
  return PackingSheet.fromSnapshot({
    serviceDay: "2026-09-13",
    orderId: "ord_1",
    reference: "CMD-0001",
    packed: null,
    containers,
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 12, packed: null }],
  });
}

describe("PackingSheet — les lignes", () => {
  it("mettre au bac PREND la quantité de la ligne ; recocher n'en prend pas de plus", () => {
    const bac = sheet();
    expect(bac.put("CRO", { at: AT, by: "s1", initials: "MB" })).toBe(12);
    expect(bac.put("CRO", { at: LATER, by: "s2", initials: "" })).toBe(0);
    expect(bac.lines[0]?.packed).toEqual({ at: LATER, by: "s2", initials: "" });
  });

  it("ressortir REND la quantité ; ressortir une ligne vide ne rend rien", () => {
    const bac = sheet();
    expect(bac.takeOut("CRO")).toBe(0);
    bac.put("CRO", { at: AT, by: "s1", initials: "" });
    expect(bac.takeOut("CRO")).toBe(12);
    expect(bac.lines[0]?.packed).toBeNull();
  });

  it("refuse un SKU qui n'est pas sur ce bon", () => {
    expect(() => sheet().lineToTouch("PAI")).toThrow(PackingLineNotFoundError);
  });

  it("refuse de toucher une ligne d'un bac FERMÉ, dans les deux sens", () => {
    const bac = sheet();
    bac.seal({ at: AT, by: "s1" });
    expect(() => bac.put("CRO", { at: LATER, by: "s1", initials: "" })).toThrow(
      PackedOrderSealedError,
    );
    expect(() => bac.takeOut("CRO")).toThrow(PackedOrderSealedError);
  });
});

describe("PackingSheet — la fermeture", () => {
  it("ferme une fois ; refermer rend la signature d'ORIGINE, sans erreur", () => {
    const bac = sheet();
    expect(bac.seal({ at: AT, by: "s1" })).toEqual({ mark: { at: AT, by: "s1" }, fresh: true });
    expect(bac.seal({ at: LATER, by: "s2" })).toEqual({ mark: { at: AT, by: "s1" }, fresh: false });
  });
});

describe("PackingSheet — les containers", () => {
  it("un pas ajoute ou retire ; un retrait à zéro est sans effet", () => {
    const bac = sheet();
    bac.step("add");
    bac.step("remove");
    bac.step("remove");
    expect(bac.containers).toBe(0);
  });

  it("refuse un ajout au plafond", () => {
    expect(() => sheet(MAX_CONTAINERS_PER_ORDER).step("add")).toThrow(ContainerCeilingReachedError);
  });

  it("refuse un total qui n'est pas un nombre de bacs", () => {
    expect(() => sheet().declareContainers(-1)).toThrow(InvalidContainerCountError);
    expect(() => sheet().declareContainers(2.5)).toThrow(InvalidContainerCountError);
    expect(() => sheet().declareContainers(MAX_CONTAINERS_PER_ORDER + 1)).toThrow(
      InvalidContainerCountError,
    );
  });

  it("refuse tout compte sur un bac fermé", () => {
    const bac = sheet(2);
    bac.seal({ at: AT, by: "s1" });
    expect(() => bac.step("remove")).toThrow(PackedOrderSealedError);
    expect(() => bac.declareContainers(3)).toThrow(PackedOrderSealedError);
  });
});
