import { pickupOpenTo, preselectedPickupId } from "../pickup-audiences.values.js";

const LABO = { id: "labo" };
const VILLAGE = { id: "village" };

/** Hugo, 2026-10-15 : le « site par défaut » a disparu, la présélection est par client. */
describe("preselectedPickupId", () => {
  it("retient le point préféré quand il est ouvert à la clientèle", () => {
    expect(preselectedPickupId([LABO, VILLAGE], "village")).toBe("village");
  });

  it("ignore un point préféré absent des points ouverts", () => {
    expect(preselectedPickupId([LABO], "village")).toBe("labo");
    expect(preselectedPickupId([LABO, VILLAGE], "ailleurs")).toBeNull();
  });

  it("retient le seul point ouvert, sans préférence", () => {
    expect(preselectedPickupId([VILLAGE], null)).toBe("village");
  });

  it("ne présélectionne rien à plusieurs points sans préférence", () => {
    expect(preselectedPickupId([LABO, VILLAGE], null)).toBeNull();
  });

  it("ne présélectionne rien sans aucun point", () => {
    expect(preselectedPickupId([], null)).toBeNull();
    expect(preselectedPickupId([], "labo")).toBeNull();
  });
});

describe("pickupOpenTo", () => {
  it("lit la case de la clientèle", () => {
    const prosOnly = { pickupAudiences: { b2b: true, b2c: false } };
    expect(pickupOpenTo(prosOnly, "b2b")).toBe(true);
    expect(pickupOpenTo(prosOnly, "b2c")).toBe(false);
  });

  it("tient pour ouvert aux deux un point servi sans les cases", () => {
    expect(pickupOpenTo({}, "b2b")).toBe(true);
    expect(pickupOpenTo({}, "b2c")).toBe(true);
  });
});
