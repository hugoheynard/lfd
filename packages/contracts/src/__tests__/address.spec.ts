import {
  deliveryAddressPayloadSchema,
  deliverySlotSchema,
  deliverySlotsSchema,
  gpsPointSchema,
} from "../address.js";

describe("contrat des créneaux de livraison", () => {
  it("accepte un créneau bien ordonné", () => {
    expect(deliverySlotSchema.safeParse({ start: "07:00", end: "09:00" }).success).toBe(true);
  });

  it("refuse un créneau à l'envers (fin ≤ début)", () => {
    expect(deliverySlotSchema.safeParse({ start: "09:00", end: "07:00" }).success).toBe(false);
    expect(deliverySlotSchema.safeParse({ start: "08:00", end: "08:00" }).success).toBe(false);
  });

  it("refuse une heure mal formée", () => {
    expect(deliverySlotSchema.safeParse({ start: "7h", end: "09:00" }).success).toBe(false);
    expect(deliverySlotSchema.safeParse({ start: "24:00", end: "25:00" }).success).toBe(false);
  });

  it("discrimine everyday vs perDay sur `mode`", () => {
    expect(deliverySlotsSchema.safeParse({ mode: "everyday", slot: null }).success).toBe(true);
    expect(
      deliverySlotsSchema.safeParse({
        mode: "perDay",
        byDay: {
          mon: { start: "06:30", end: "08:00" },
          tue: null,
          wed: null,
          thu: null,
          fri: null,
          sat: null,
          sun: null,
        },
      }).success,
    ).toBe(true);
    // `everyday` ne doit pas accepter la forme `perDay`.
    expect(deliverySlotsSchema.safeParse({ mode: "everyday", byDay: {} }).success).toBe(false);
  });
});

describe("contrat du point GPS", () => {
  it("accepte des coordonnées dans les bornes", () => {
    expect(gpsPointSchema.safeParse({ lat: 48.8566, lng: 2.3522 }).success).toBe(true);
  });

  it("refuse hors bornes", () => {
    expect(gpsPointSchema.safeParse({ lat: 91, lng: 0 }).success).toBe(false);
    expect(gpsPointSchema.safeParse({ lat: 0, lng: 181 }).success).toBe(false);
  });
});

describe("contrat d'une adresse de livraison", () => {
  it("applique les défauts (label, ligne2, isDefault, note)", () => {
    const parsed = deliveryAddressPayloadSchema.parse({
      ligne1: "18 rue des Archives",
      codePostal: "75004",
      ville: "Paris",
      pays: "France",
      specs: { slots: { mode: "everyday", slot: null }, deliveryContact: null, gps: null },
    });
    expect(parsed.label).toBe("");
    expect(parsed.ligne2).toBe("");
    expect(parsed.isDefault).toBe(false);
    expect(parsed.specs.note).toBe("");
  });

  it("refuse une adresse sans ligne1", () => {
    const result = deliveryAddressPayloadSchema.safeParse({
      ligne1: "",
      codePostal: "75004",
      ville: "Paris",
      pays: "France",
      specs: { slots: { mode: "everyday", slot: null }, deliveryContact: null, gps: null },
    });
    expect(result.success).toBe(false);
  });
});
