import type { PickupAddressView } from "@lfd/contracts";

import { InMemorySites, storedSite } from "../../../sites/application/__tests__/site-doubles.js";
import type { SitePlace } from "../../../sites/domain/site.js";
import { PickupDiscount } from "../../domain/pickup-discount.js";

/** Les champs d'un point de retrait, communs aux specs de création et de modification. */
export const FIELDS = {
  label: "Laboratoire",
  ligne1: "18 rue des Archives",
  ligne2: "",
  codePostal: "75004",
  ville: "Paris",
  pays: "France",
  opening: { publicOpening: null, proPickup: null },
} as const;

/**
 * Un point en base — un SITE depuis le lot S1 (2026-10-13) — et le dernier
 * lieu qu'on y a écrit. Les gestes historiques passent par l'agrégat : le
 * double est celui du port des sites, rempli depuis la vue d'un point.
 */
export class StoredPoints extends InMemorySites {
  constructor(stored: PickupAddressView | null) {
    super(
      ...(stored === null
        ? []
        : [
            storedSite(stored.id, {
              place: {
                label: stored.label,
                ligne1: stored.ligne1,
                ligne2: stored.ligne2,
                codePostal: stored.codePostal,
                ville: stored.ville,
                pays: stored.pays,
                opening: stored.opening,
                gps: stored.gps ?? null,
                discount: PickupDiscount.of(stored.discount, stored.discountAudiences),
              },
            }),
          ]),
    );
  }

  /** Le lieu du dernier site écrit, ou `null` si rien ne l'a été. */
  get written(): SitePlace | null {
    const last = this.saved.at(-1);
    return last === undefined ? null : (this.stateOf(last)?.place ?? null);
  }
}
