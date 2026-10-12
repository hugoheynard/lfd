import { InvalidAdminOrderCursorError } from "../../errors/admin-order-list-errors.js";
import { AdminOrderCursor } from "../admin-order-cursor.js";

/** Le curseur de la liste staff : comparé à d'autres dates, jamais à l'horloge. */
const PLACED_AT = new Date("2026-10-12T08:15:30.123Z");

describe("AdminOrderCursor", () => {
  it("se relit à l'identique : même instant à la milliseconde, même commande", () => {
    const token = AdminOrderCursor.after(PLACED_AT, "ord_42").encode();

    const back = AdminOrderCursor.decode(token);

    expect([back.placedAt.toISOString(), back.orderId]).toEqual([
      PLACED_AT.toISOString(),
      "ord_42",
    ]);
  });

  it("est opaque : ni la date ni l'identifiant ne se lisent en clair", () => {
    const token = AdminOrderCursor.after(PLACED_AT, "ord_42").encode();

    expect(token).not.toContain("ord_42");
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ["un jeton qui n'en est pas un", "pas-un-curseur"],
    ["une date bricolée", Buffer.from("2026-13-45|ord_1").toString("base64url")],
    ["une date presque ISO", Buffer.from("2026-10-12|ord_1").toString("base64url")],
    ["sans identifiant", Buffer.from(`${PLACED_AT.toISOString()}|`).toString("base64url")],
  ])("refuse %s plutôt que de reprendre ailleurs", (_case, token) => {
    expect(() => AdminOrderCursor.decode(token)).toThrow(InvalidAdminOrderCursorError);
  });
});
