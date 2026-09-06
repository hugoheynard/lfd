import { pickupSlots, type PickupOpening } from "../pickup.js";

const opening = (
  pro: PickupOpening["proPickup"],
  pub: PickupOpening["publicOpening"],
): PickupOpening => ({ proPickup: pro, publicOpening: pub });

/**
 * 🔴 **La grille de créneaux était écrite en dur dans le front**, huit heures
 * identiques pour tous les points, avec des états sans source (« complet »,
 * « sortie du four »). Elle se déduit désormais des heures DÉCLARÉES du point.
 */
describe("pickupSlots — la grille se lit sur les heures déclarées", () => {
  it("découpe la fenêtre en heures pleines", () => {
    const slots = pickupSlots(opening(null, { start: "07:00", end: "10:00" }));

    expect(slots.map((s) => s.id)).toEqual(["07:00-08:00", "08:00-09:00", "09:00-10:00"]);
    expect(slots.every((s) => s.access === "public")).toBe(true);
  });

  /** Jeter la demie ferait disparaître une demi-heure d'ouverture RÉELLE. */
  it("garde la dernière demi-heure plutôt que de l’arrondir", () => {
    const slots = pickupSlots(opening({ start: "05:00", end: "06:30" }, null));

    expect(slots.map((s) => s.id)).toEqual(["05:00-06:00", "06:00-06:30"]);
    expect(slots.at(-1)?.end).toBe("06:30");
  });

  /**
   * L'union des deux fenêtres peut avoir un TROU — pros 5 h–6 h 30 puis public
   * 7 h–8 h laisse une demi-heure fermée. Rien ne doit la combler.
   */
  it("n’invente pas l’heure qui sépare les deux fenêtres", () => {
    const slots = pickupSlots(
      opening({ start: "05:00", end: "06:30" }, { start: "07:00", end: "08:00" }),
    );

    expect(slots.map((s) => s.id)).toEqual(["05:00-06:00", "06:00-06:30", "07:00-08:00"]);
  });

  it("dit qui peut venir, et le chevauchement reste PUBLIC", () => {
    const slots = pickupSlots(
      opening({ start: "06:00", end: "08:00" }, { start: "07:00", end: "09:00" }),
    );

    expect(slots.map((s) => [s.id, s.access])).toEqual([
      ["06:00-07:00", "pro"],
      ["07:00-08:00", "public"],
      ["08:00-09:00", "public"],
    ]);
  });

  /** « Avant 8 h » ne dit pas depuis quand : remplir depuis minuit ouvrirait la nuit. */
  it("ne découpe pas une fenêtre sans borne basse", () => {
    const slots = pickupSlots(opening(null, { start: null, end: "08:00" }));

    expect(slots).toEqual([{ id: "-08:00", start: null, end: "08:00", access: "public" }]);
  });

  it("ne rend RIEN quand le point n’a déclaré aucune heure", () => {
    expect(pickupSlots(opening(null, null))).toEqual([]);
  });
});
