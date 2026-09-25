import {
  editOperationPayloadSchema,
  prepareOperationPayloadSchema,
  rescheduleOperationPayloadSchema,
  setOperationAudiencePayloadSchema,
} from "../index.js";

/**
 * Le contrat des opérations ne juge que la FORME. L'ordre des dates, la forme
 * de la clé, un jour qui existe : c'est l'agrégat du référentiel qui refuse —
 * ces tests vérifient que le contrat ne le fait pas à sa place.
 */
describe("le contrat des opérations datées", () => {
  const prepare = {
    key: "noel-2026",
    name: { fr: "Noël" },
    lede: null,
    image: null,
    announceFrom: "2026-11-01T00:00:00+01:00",
    orderFrom: null,
    orderUntil: "2026-12-21T12:00:00+01:00",
    pickupFrom: "2026-12-20",
    pickupUntil: "2026-12-24",
    audience: "both",
  };

  it("accepte une préparation minimale, instants avec décalage", () => {
    expect(prepareOperationPayloadSchema.safeParse(prepare).success).toBe(true);
    expect(
      prepareOperationPayloadSchema.safeParse({ ...prepare, orderUntil: "2026-12-21T11:00:00Z" })
        .success,
    ).toBe(true);
  });

  it("refuse un instant sans fuseau, une clientèle inconnue, une clé en trop", () => {
    expect(
      prepareOperationPayloadSchema.safeParse({ ...prepare, orderUntil: "2026-12-21T12:00:00" })
        .success,
    ).toBe(false);
    expect(prepareOperationPayloadSchema.safeParse({ ...prepare, audience: "tous" }).success).toBe(
      false,
    );
    expect(prepareOperationPayloadSchema.safeParse({ ...prepare, state: "open" }).success).toBe(
      false,
    );
  });

  it("laisse passer ce que seul le domaine juge : l'ordre des dates, la forme de la clé", () => {
    expect(
      prepareOperationPayloadSchema.safeParse({
        ...prepare,
        key: "Noël",
        pickupFrom: "2026-12-30",
      }).success,
    ).toBe(true);
  });

  it("borne chaque section à ses propres champs", () => {
    const { announceFrom, orderFrom, orderUntil, pickupFrom, pickupUntil } = prepare;
    const schedule = { announceFrom, orderFrom, orderUntil, pickupFrom, pickupUntil };

    expect(rescheduleOperationPayloadSchema.safeParse(schedule).success).toBe(true);
    expect(rescheduleOperationPayloadSchema.safeParse({ ...schedule, key: "x" }).success).toBe(
      false,
    );
    expect(
      editOperationPayloadSchema.safeParse({ name: { fr: "Noël" }, lede: null, image: null })
        .success,
    ).toBe(true);
    expect(setOperationAudiencePayloadSchema.safeParse({ audience: "pro" }).success).toBe(true);
  });
});
