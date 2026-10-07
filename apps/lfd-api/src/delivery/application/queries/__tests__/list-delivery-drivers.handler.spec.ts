import { FixedStaffPermissionHolders } from "../../../../staff/directory/domain/__tests__/fixed-staff-permission-holders.js";
import { ListDeliveryDriversHandler } from "../list-delivery-drivers.handler.js";

const PAUL = { staffUserId: "staff_paul", firstName: "Paul", lastName: "Roux" };
const MARC = { staffUserId: "staff_marc", firstName: "Marc", lastName: "Blanc" };
const ZOE = { staffUserId: "staff_zoe", firstName: "Zoé", lastName: "" };
const INES = { staffUserId: "staff_ines", firstName: "Inès", lastName: "Vidal" };

describe("ListDeliveryDriversHandler — les livreurs proposables (MT-D2 v2)", () => {
  /**
   * Régression (audit 2026-10-07, B8) : la liste ne lisait que
   * `delivery_driving:write`. Marc, qui conduit sans les gestes à la porte,
   * était proposé — puis, affecté, bloqué à chaque arrêt.
   */
  it("🔴 ne propose que qui tient les deux droits — ni le conducteur seul, ni la porte seule", async () => {
    const holders = new FixedStaffPermissionHolders(
      new Map([
        ["delivery_driving:write", [MARC, PAUL, ZOE]],
        ["delivery_doorstep:write", [PAUL, ZOE, INES]],
      ]),
    );

    const view = await new ListDeliveryDriversHandler(holders).execute();

    expect(view.drivers).toEqual([
      { staffUserId: "staff_paul", name: "Paul Roux" },
      { staffUserId: "staff_zoe", name: "Zoé" },
    ]);
    expect(holders.asked).toEqual(["delivery_driving:write", "delivery_doorstep:write"]);
  });

  it("ne propose personne quand personne ne tient les gestes à la porte", async () => {
    const holders = new FixedStaffPermissionHolders(
      new Map([["delivery_driving:write", [PAUL, MARC]]]),
    );

    expect((await new ListDeliveryDriversHandler(holders).execute()).drivers).toEqual([]);
  });
});
