import {
  PackedResupplyQuantityOutOfRangeError,
  PackingResupplyClosedError,
  PackingResupplyIncompleteError,
  PackingResupplyLineNotFoundError,
} from "../../errors/packing-resupply-errors.js";
import { PackingResupply } from "../packing-resupply.js";

/** Instants recopiés, jamais comparés à l'horloge — exception étroite du §5. */
const AT = new Date("2026-10-21T04:00:00.000Z");
const MARK = { at: AT, by: "staff_lou" };

function sheet(): PackingResupply {
  return PackingResupply.fromSnapshot({
    serviceDay: "2026-10-22",
    resupplyId: "rs_1",
    siteId: "site_village",
    siteLabel: "Le Village",
    name: null,
    kind: "evening",
    drawnAt: AT,
    closed: null,
    lines: [
      { sku: "CRO", productName: "Croissant", quantity: 12, packed: null },
      { sku: "PAC", productName: "Pain au chocolat", quantity: 6, packed: null },
    ],
  });
}

describe("PackingResupply — la fiche de réassort au colisage (R3b)", () => {
  it("se titre « Réassort <point> », et son identifiant à défaut de nom", () => {
    expect(sheet().title).toBe("Réassort Le Village");
    const anonymous = PackingResupply.fromSnapshot({ ...sheet().toSnapshot(), siteLabel: null });
    expect(anonymous.title).toBe("Réassort site_village");
  });

  it("nommé (R1g), se titre « <nom> — <point> »", () => {
    const named = PackingResupply.fromSnapshot({
      ...sheet().toSnapshot(),
      name: "Vitrine du matin",
    });
    expect(named.title).toBe("Vitrine du matin — Le Village");
    expect(named.toSnapshot().name).toBe("Vitrine du matin");
  });

  it("lancé « au plus tôt » (R4b), se titre « <nom> — <point> · au plus tôt »", () => {
    const launched = PackingResupply.fromSnapshot({
      ...sheet().toSnapshot(),
      name: "Rupture de midi",
      kind: "asap",
    });
    expect(launched.title).toBe("Rupture de midi — Le Village · au plus tôt");
    const anonymous = PackingResupply.fromSnapshot({ ...sheet().toSnapshot(), kind: "asap" });
    expect(anonymous.title).toBe("Réassort Le Village · au plus tôt");
  });

  it("saisit l'emballé, 0 et la quantité demandée compris, et rend l'écart à la réserve", () => {
    const fiche = sheet();

    expect(fiche.enterPacked("CRO", 12, MARK)).toEqual({
      sku: "CRO",
      productName: "Croissant",
      delta: 12,
    });
    expect(fiche.enterPacked("CRO", 10, MARK).delta).toBe(-2);
    expect(fiche.enterPacked("PAC", 0, MARK).delta).toBe(0);
    expect(fiche.lines.map((line) => line.packed?.quantity)).toEqual([10, 0]);
    expect(fiche.started).toBe(true);
  });

  it("refuse plus que demandé, un négatif, un décimal, un article non demandé", () => {
    const fiche = sheet();

    expect(() => fiche.enterPacked("CRO", 13, MARK)).toThrow(PackedResupplyQuantityOutOfRangeError);
    expect(() => fiche.enterPacked("CRO", -1, MARK)).toThrow(PackedResupplyQuantityOutOfRangeError);
    expect(() => fiche.enterPacked("CRO", 1.5, MARK)).toThrow(
      PackedResupplyQuantityOutOfRangeError,
    );
    expect(() => fiche.enterPacked("BAG", 1, MARK)).toThrow(PackingResupplyLineNotFoundError);
    expect(fiche.started).toBe(false);
  });

  it("ne se clôt pas tant qu'une ligne n'est pas saisie, et nomme laquelle", () => {
    const fiche = sheet();
    fiche.enterPacked("CRO", 12, MARK);

    expect(() => fiche.close(MARK)).toThrow(PackingResupplyIncompleteError);
    expect(() => fiche.close(MARK)).toThrow("« Pain au chocolat »");
    expect(fiche.closed).toBeNull();
  });

  it("close, elle ne bouge plus ; une seconde clôture ne réécrit rien", () => {
    const fiche = sheet();
    fiche.enterPacked("CRO", 12, MARK);
    fiche.enterPacked("PAC", 6, MARK);

    expect(fiche.close(MARK)).toBe(true);
    expect(fiche.close({ at: new Date(AT.getTime() + 1), by: "staff_max" })).toBe(false);
    expect(fiche.closed).toEqual(MARK);
    expect(() => fiche.enterPacked("CRO", 1, MARK)).toThrow(PackingResupplyClosedError);
  });
});
