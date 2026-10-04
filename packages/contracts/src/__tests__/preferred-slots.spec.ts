import {
  deliveryAddressPayloadSchema,
  deliverySpecsSchema,
  type DeliverySlot,
  type PreferredSlots,
} from "../address.js";
import { legacySlotsOf, slotsFor } from "../preferred-slots.js";

const MORNING: DeliverySlot = { start: "06:00", end: "08:00" };
const EVENING: DeliverySlot = { start: "18:00", end: "20:00" };
const NO_DAYS = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };

/** Une charge d'adresse dont seules les consignes de créneau varient. */
function payload(slotList: PreferredSlots | null | undefined): unknown {
  return {
    ligne1: "18 rue des Archives",
    codePostal: "75004",
    ville: "Paris",
    pays: "France",
    specs: {
      slots: { mode: "everyday", slot: null },
      deliveryContact: null,
      gps: null,
      ...(slotList === undefined ? {} : { slotList }),
    },
  };
}

describe("plusieurs créneaux par adresse — la charge (CA3b)", () => {
  it("accepte deux créneaux triés, et deux créneaux bord à bord", () => {
    const everyday = { mode: "everyday", slots: [MORNING, EVENING] } as const;
    expect(deliveryAddressPayloadSchema.safeParse(payload(everyday)).success).toBe(true);
    const touching = {
      mode: "everyday",
      slots: [MORNING, { start: "08:00", end: "09:00" }],
    } as const;
    expect(deliveryAddressPayloadSchema.safeParse(payload(touching)).success).toBe(true);
  });

  it("refuse une liste dans le désordre", () => {
    const result = deliveryAddressPayloadSchema.safeParse(
      payload({ mode: "everyday", slots: [EVENING, MORNING] }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["specs", "slotList", "slots"]);
  });

  it("refuse deux créneaux qui se chevauchent, en nommant le jour", () => {
    const overlap = { start: "07:00", end: "09:00" };
    const result = deliveryAddressPayloadSchema.safeParse(
      payload({ mode: "perDay", byDay: { ...NO_DAYS, tue: [MORNING, overlap] } }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["specs", "slotList", "byDay", "tue"]);
  });

  it("accepte une charge sans slotList (l'ancien front)", () => {
    expect(deliveryAddressPayloadSchema.safeParse(payload(undefined)).success).toBe(true);
  });

  it("ne refuse pas le désordre à la LECTURE : une ligne rangée reste lisible", () => {
    const stored = {
      slots: { mode: "everyday", slot: null },
      deliveryContact: null,
      gps: null,
      slotList: { mode: "everyday", slots: [EVENING, MORNING] },
    };
    expect(deliverySpecsSchema.safeParse(stored).success).toBe(true);
  });
});

describe("slotsFor — le seul point de lecture", () => {
  const legacyEveryday = { mode: "everyday", slot: MORNING } as const;

  it("lit la liste quand l'adresse en porte une", () => {
    const specs = {
      slots: legacyEveryday,
      slotList: { mode: "everyday", slots: [MORNING, EVENING] },
    } as const;
    expect(slotsFor(specs, "mon")).toEqual([MORNING, EVENING]);
    expect(slotsFor(specs, null)).toEqual([MORNING, EVENING]);
  });

  it("lit la liste du jour, et rien tant que le jour n'est pas choisi", () => {
    const specs = {
      slots: legacyEveryday,
      slotList: { mode: "perDay", byDay: { ...NO_DAYS, fri: [EVENING] } },
    } as const;
    expect(slotsFor(specs, "fri")).toEqual([EVENING]);
    expect(slotsFor(specs, "mon")).toEqual([]);
    expect(slotsFor(specs, null)).toEqual([]);
  });

  it("retombe sur l'ancien créneau unique quand la liste est absente ou nulle", () => {
    expect(slotsFor({ slots: legacyEveryday }, "mon")).toEqual([MORNING]);
    expect(slotsFor({ slots: legacyEveryday, slotList: null }, null)).toEqual([MORNING]);
    expect(slotsFor({ slots: { mode: "everyday", slot: null } }, "mon")).toEqual([]);
    const perDay = { mode: "perDay", byDay: { ...NO_DAYS, wed: EVENING } } as const;
    expect(slotsFor({ slots: perDay }, "wed")).toEqual([EVENING]);
    expect(slotsFor({ slots: perDay }, "thu")).toEqual([]);
    expect(slotsFor({ slots: perDay }, null)).toEqual([]);
  });
});

describe("legacySlotsOf — l'ancien slots dérivé de la liste", () => {
  it("garde le premier créneau de tous les jours, ou aucun", () => {
    expect(legacySlotsOf({ mode: "everyday", slots: [MORNING, EVENING] })).toEqual({
      mode: "everyday",
      slot: MORNING,
    });
    expect(legacySlotsOf({ mode: "everyday", slots: [] })).toEqual({
      mode: "everyday",
      slot: null,
    });
  });

  it("garde le premier créneau de chaque jour", () => {
    const derived = legacySlotsOf({
      mode: "perDay",
      byDay: { ...NO_DAYS, mon: [MORNING, EVENING], tue: [], sat: [EVENING] },
    });
    expect(derived).toEqual({ mode: "perDay", byDay: { ...NO_DAYS, mon: MORNING, sat: EVENING } });
  });
});
