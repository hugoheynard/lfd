import { holderIds } from "../../domain/reservation-holders.js";
import { reservationHoldersOf } from "../read-reservation-holders.js";

/**
 * Pour qui un article réservé s'ouvre (`plan-articles-sur-mesure.md`, S1, Q8) :
 * la société, et son principal tant qu'il est `active` — la règle de
 * `inheritedSiteWhere`.
 */
describe("reservationHoldersOf", () => {
  it("une société sans principal n'ouvre que ce qui lui est réservé", () => {
    const holders = reservationHoldersOf("co_a", null);
    expect(holders).toEqual({ companyId: "co_a", activePrincipalId: null });
    expect(holderIds(holders)).toEqual(["co_a"]);
  });

  it("un site hérite de son principal actif", () => {
    const holders = reservationHoldersOf("co_site", { id: "co_a", status: "active" });
    expect(holderIds(holders)).toEqual(["co_site", "co_a"]);
  });

  it.each(["pending", "suspended", "terminated"] as const)(
    "un principal %s n'ouvre plus rien à ses sites (Q8)",
    (status) => {
      expect(reservationHoldersOf("co_site", { id: "co_a", status }).activePrincipalId).toBeNull();
    },
  );
});
