import { instantToLocal } from "@lfd/contracts";

import { IsoDate } from "../../domain/value-objects/iso-date.js";

/** Le jour de Paris d'un instant : un panier vit au calendrier de la boutique, pas en UTC. */
export function parisDay(instant: Date): IsoDate {
  return IsoDate.fromString(instantToLocal(instant).day);
}
