import { assignDeliveryStopPayloadSchema } from "../delivery-rounds.js";

describe("assignDeliveryStopPayloadSchema (CA7, « Placer ici »)", () => {
  it("accepte l'ancienne forme, sans rang : en dernier, comme avant", () => {
    expect(assignDeliveryStopPayloadSchema.safeParse({ orderId: "o_1", version: 3 }).success).toBe(
      true,
    );
  });

  it("accepte un rang entier positif ou nul, et refuse le reste", () => {
    const parse = (after: unknown) =>
      assignDeliveryStopPayloadSchema.safeParse({ orderId: "o_1", version: 3, after }).success;

    expect(parse(0)).toBe(true);
    expect(parse(4)).toBe(true);
    expect(parse(-1)).toBe(false);
    expect(parse(1.5)).toBe(false);
    expect(parse("2")).toBe(false);
  });
});
