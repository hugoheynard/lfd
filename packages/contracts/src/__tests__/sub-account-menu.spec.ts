import { subAccountMenuPayloadSchema } from "../sub-account-menu.js";

describe("subAccountMenuPayloadSchema — la forme de la carte entière", () => {
  it("accepte une carte, et `except` sans entrée (aucune restriction)", () => {
    expect(
      subAccountMenuPayloadSchema.safeParse({
        mode: "only",
        offMenu: "visible_locked",
        entries: [{ level: "family", ref: "fam_1", effect: "include" }],
      }).success,
    ).toBe(true);
    expect(
      subAccountMenuPayloadSchema.safeParse({ mode: "except", offMenu: "hidden", entries: [] })
        .success,
    ).toBe(true);
  });

  it("refuse un grain, un mode ou une clé inconnus", () => {
    for (const payload of [
      { mode: "all", offMenu: "hidden", entries: [] },
      {
        mode: "only",
        offMenu: "hidden",
        entries: [{ level: "category", ref: "x", effect: "include" }],
      },
      { mode: "only", offMenu: "hidden", entries: [], extra: true },
    ]) {
      expect(subAccountMenuPayloadSchema.safeParse(payload).success).toBe(false);
    }
  });
});
