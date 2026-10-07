import {
  deliveryAddressPayloadSchema,
  deliverySpecsSchema,
  type DeliverySlot,
  type PreferredSlots,
} from "../address.js";
import { slotsFor } from "../preferred-slots.js";

const MORNING: DeliverySlot = { start: "06:00", end: "08:00" };
const EVENING: DeliverySlot = { start: "18:00", end: "20:00" };
const NO_DAYS = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };

/** Une charge d'adresse dont seules les consignes de créneau varient. */
function payload(slotList: PreferredSlots | undefined): unknown {
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

  /**
   * Non-régression du retrait de `slots` (2026-10-07) : un onglet resté sur
   * l'ancien front n'envoie que `slots`. La charge l'accepte, ignore `slots`,
   * et laisse `slotList` absente — le serveur garde alors la liste rangée.
   */
  it("accepte une charge sans slotList (l'ancien front), et n'en garde pas slots", () => {
    const result = deliveryAddressPayloadSchema.safeParse(payload(undefined));
    expect(result.success).toBe(true);
    expect(result.data?.specs).not.toHaveProperty("slots");
    expect(result.data?.specs.slotList).toBeUndefined();
  });

  it("refuse slotList: null — « aucun créneau » est la liste vide", () => {
    const withNull = {
      ligne1: "18 rue des Archives",
      codePostal: "75004",
      ville: "Paris",
      pays: "France",
      specs: { deliveryContact: null, gps: null, slotList: null },
    };
    expect(deliveryAddressPayloadSchema.safeParse(withNull).success).toBe(false);
  });

  it("ne refuse pas le désordre à la LECTURE : une ligne rangée reste lisible", () => {
    const stored = {
      deliveryContact: null,
      gps: null,
      slotList: { mode: "everyday", slots: [EVENING, MORNING] },
    };
    expect(deliverySpecsSchema.safeParse(stored).success).toBe(true);
  });

  it("refuse à la LECTURE des consignes sans liste : la migration en a donné une à chacune", () => {
    const stored = { slots: { mode: "everyday", slot: null }, deliveryContact: null, gps: null };
    expect(deliverySpecsSchema.safeParse(stored).success).toBe(false);
  });

  it("retire l'ancienne clé slots encore rangée, à la lecture", () => {
    const stored = {
      slots: { mode: "everyday", slot: null },
      deliveryContact: null,
      gps: null,
      slotList: { mode: "everyday", slots: [] },
    };
    expect(deliverySpecsSchema.parse(stored)).not.toHaveProperty("slots");
  });
});

describe("slotsFor — le seul point de lecture", () => {
  it("lit la liste de tous les jours, jour choisi ou non", () => {
    const specs = { slotList: { mode: "everyday", slots: [MORNING, EVENING] } } as const;
    expect(slotsFor(specs, "mon")).toEqual([MORNING, EVENING]);
    expect(slotsFor(specs, null)).toEqual([MORNING, EVENING]);
  });

  it("lit la liste du jour, et rien tant que le jour n'est pas choisi", () => {
    const specs = { slotList: { mode: "perDay", byDay: { ...NO_DAYS, fri: [EVENING] } } } as const;
    expect(slotsFor(specs, "fri")).toEqual([EVENING]);
    expect(slotsFor(specs, "mon")).toEqual([]);
    expect(slotsFor(specs, null)).toEqual([]);
  });

  it("lit la liste vide comme « aucun créneau »", () => {
    expect(slotsFor({ slotList: { mode: "everyday", slots: [] } }, "mon")).toEqual([]);
  });
});
