import { RESUPPLY_NAME_MAX } from "@lfd/contracts";

import { ResupplyNameTooLongError } from "./site-resupply-errors.js";

/**
 * **Le nom d'un réassort** (lot R1g, Hugo 2026-10-21 : « vitrine du
 * matin ») — libre et facultatif, sans liste à administrer. Rogné, ses
 * blancs intérieurs ramenés à un seul espace ; vide, il n'y a pas de nom
 * (`null`). Plus de {@link RESUPPLY_NAME_MAX} caractères : refusé, jamais
 * tronqué en silence. La base tient la même borne (CHECK
 * `site_resupply_name_trimmed`).
 */
export function resupplyNameOf(raw: string | null): string | null {
  const name = (raw ?? "").replace(/\s+/gu, " ").trim();
  if (name === "") {
    return null;
  }
  if ([...name].length > RESUPPLY_NAME_MAX) {
    throw new ResupplyNameTooLongError(RESUPPLY_NAME_MAX);
  }
  return name;
}
