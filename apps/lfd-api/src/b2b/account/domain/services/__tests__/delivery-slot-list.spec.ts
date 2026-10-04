import type { DeliverySpecs, PreferredSlots } from "@lfd/contracts";

import { withSlotList } from "../delivery-slot-list.js";

const MORNING = { start: "06:00", end: "08:00" };
const EVENING = { start: "18:00", end: "20:00" };
const NO_DAYS = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };

function specs(slotList?: PreferredSlots | null): DeliverySpecs {
  return {
    note: "",
    slots: { mode: "everyday", slot: null },
    deliveryContact: null,
    gps: null,
    signatureRequired: null,
    ...(slotList === undefined ? {} : { slotList }),
  };
}

describe("withSlotList — les créneaux à écrire (CA3b)", () => {
  it("dérive l'ancien créneau du premier de chaque jour", () => {
    const list: PreferredSlots = { mode: "perDay", byDay: { ...NO_DAYS, mon: [MORNING, EVENING] } };
    expect(withSlotList(specs(list), null).slots).toEqual({
      mode: "perDay",
      byDay: { ...NO_DAYS, mon: MORNING },
    });
  });

  it("garde la liste rangée quand la charge l'ignore", () => {
    const stored = specs({ mode: "everyday", slots: [EVENING] });
    const written = withSlotList(specs(), stored);
    expect(written.slotList).toEqual({ mode: "everyday", slots: [EVENING] });
    expect(written.slots).toEqual({ mode: "everyday", slot: EVENING });
  });

  it("une liste vide dérive « aucun créneau »", () => {
    expect(withSlotList(specs({ mode: "everyday", slots: [] }), null).slots).toEqual({
      mode: "everyday",
      slot: null,
    });
  });

  it("rend la charge telle quelle quand personne n'a de liste", () => {
    const incoming = specs();
    expect(withSlotList(incoming, specs())).toBe(incoming);
  });
});
