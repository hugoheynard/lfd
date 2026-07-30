import { activationSupportPayloadSchema } from "../support.js";

/** Une date `AAAA-MM-JJ` décalée de `days` par rapport à aujourd'hui (UTC). */
function dateOffset(days: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
  return d.toISOString().slice(0, 10);
}

describe("contrat de la demande de support à l'activation", () => {
  it("accepte un e-mail nu (ni numéro ni créneau)", () => {
    const result = activationSupportPayloadSchema.safeParse({ channel: "email" });
    expect(result.success).toBe(true);
  });

  it("refuse un e-mail qui porte un créneau", () => {
    const result = activationSupportPayloadSchema.safeParse({
      channel: "email",
      scheduledDate: dateOffset(2),
      slot: "morning",
    });
    expect(result.success).toBe(false);
  });

  it("accepte un rappel « au plus vite » avec un numéro", () => {
    const result = activationSupportPayloadSchema.safeParse({
      channel: "phone",
      phoneNumber: "0102030405",
      asap: true,
    });
    expect(result.success).toBe(true);
  });

  it("refuse un rappel sans numéro", () => {
    const result = activationSupportPayloadSchema.safeParse({ channel: "phone", asap: true });
    expect(result.success).toBe(false);
  });

  it("refuse « au plus vite » assorti d'un créneau daté", () => {
    const result = activationSupportPayloadSchema.safeParse({
      channel: "phone",
      phoneNumber: "0102030405",
      asap: true,
      scheduledDate: dateOffset(2),
      slot: "afternoon",
    });
    expect(result.success).toBe(false);
  });

  it("accepte un rappel programmé (date future + créneau)", () => {
    const result = activationSupportPayloadSchema.safeParse({
      channel: "phone",
      phoneNumber: "0102030405",
      asap: false,
      scheduledDate: dateOffset(3),
      slot: "morning",
    });
    expect(result.success).toBe(true);
  });

  it("refuse un rappel programmé sans date ou sans créneau", () => {
    const noDate = activationSupportPayloadSchema.safeParse({
      channel: "phone",
      phoneNumber: "0102030405",
      asap: false,
      slot: "morning",
    });
    expect(noDate.success).toBe(false);
  });

  it("refuse une date impossible malgré le bon format (2026-13-40)", () => {
    const result = activationSupportPayloadSchema.safeParse({
      channel: "phone",
      phoneNumber: "0102030405",
      asap: false,
      scheduledDate: "2026-13-40",
      slot: "morning",
    });
    expect(result.success).toBe(false);
  });

  it("refuse une date de rappel dans le passé", () => {
    const result = activationSupportPayloadSchema.safeParse({
      channel: "phone",
      phoneNumber: "0102030405",
      asap: false,
      scheduledDate: dateOffset(-1),
      slot: "morning",
    });
    expect(result.success).toBe(false);
  });

  it("borne le message et le numéro", () => {
    const longMessage = activationSupportPayloadSchema.safeParse({
      channel: "email",
      message: "x".repeat(2001),
    });
    expect(longMessage.success).toBe(false);

    const longPhone = activationSupportPayloadSchema.safeParse({
      channel: "phone",
      phoneNumber: "0".repeat(31),
      asap: true,
    });
    expect(longPhone.success).toBe(false);
  });
});
