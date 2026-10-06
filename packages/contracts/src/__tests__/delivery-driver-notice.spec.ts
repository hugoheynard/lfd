import { acknowledgeDriverNoticePayloadSchema } from "../delivery-driver-notice.js";

describe("acknowledgeDriverNoticePayloadSchema (« J'ai compris »)", () => {
  it("accepte une version entière positive, et refuse le reste", () => {
    const parse = (version: unknown) =>
      acknowledgeDriverNoticePayloadSchema.safeParse({ version }).success;

    expect(parse(1)).toBe(true);
    expect(parse(12)).toBe(true);
    expect(parse(0)).toBe(false);
    expect(parse(-1)).toBe(false);
    expect(parse(1.5)).toBe(false);
    expect(parse("1")).toBe(false);
    expect(parse(undefined)).toBe(false);
  });
});
