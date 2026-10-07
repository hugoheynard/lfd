import type { DeliverySpecs, DeliverySpecsPayload, PreferredSlots } from "@lfd/contracts";

import { withSlotList } from "../delivery-slot-list.js";

const MORNING = { start: "06:00", end: "08:00" };
const EVENING = { start: "18:00", end: "20:00" };
const NO_DAYS = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };

const BASE = { note: "", deliveryContact: null, gps: null, signatureRequired: null } as const;

/** Une charge d'écriture, avec ou sans liste. */
function payload(slotList?: PreferredSlots): DeliverySpecsPayload {
  return { ...BASE, ...(slotList === undefined ? {} : { slotList }) };
}

/** Des consignes rangées — elles portent toujours une liste. */
function stored(slotList: PreferredSlots): DeliverySpecs {
  return { ...BASE, slotList };
}

describe("withSlotList — les créneaux à écrire (plan-retrait-slots, S2)", () => {
  it("écrit la liste de la charge, telle quelle", () => {
    const list: PreferredSlots = { mode: "perDay", byDay: { ...NO_DAYS, mon: [MORNING, EVENING] } };
    const written = withSlotList(payload(list), stored({ mode: "everyday", slots: [EVENING] }));
    expect(written.slotList).toEqual(list);
  });

  /** Non-régression : un onglet resté sur l'ancien front n'envoie pas de liste. */
  it("garde la liste rangée quand la charge n'en porte pas", () => {
    const written = withSlotList(payload(), stored({ mode: "everyday", slots: [EVENING] }));
    expect(written.slotList).toEqual({ mode: "everyday", slots: [EVENING] });
  });

  /** Non-régression : une adresse neuve sans liste serait illisible à la lecture. */
  it("donne la liste vide à une adresse neuve dont la charge n'en porte pas", () => {
    expect(withSlotList(payload(), null).slotList).toEqual({ mode: "everyday", slots: [] });
  });

  it("ne dérive plus l'ancien créneau unique", () => {
    expect(withSlotList(payload({ mode: "everyday", slots: [MORNING] }), null)).not.toHaveProperty(
      "slots",
    );
  });
});
