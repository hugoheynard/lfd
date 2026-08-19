import type { StaffUserPayload } from "@lfd/contracts";

import { normalizeBootstrapEmail } from "../../../platform/config/bootstrap-admin-email.js";

/**
 * Identité de l'admin **racine** — le tout premier compte staff, celui qui
 * provisionne tous les autres. Il résout le poulet-œuf du 1er admin : sans lui,
 * personne ne peut créer de comptes. Il est :
 * - **semé au boot** s'il manque (`ensureBootstrapAdmin`) — il réapparaît même
 *   supprimé directement en base ;
 * - **ineffaçable**, **non rétrogradable** et **non renommable**
 *   (`staff-access.policy.ts`). Le renommage compte : c'est l'e-mail qui
 *   l'identifie, donc le changer était le chemin en deux temps vers sa
 *   suppression.
 *
 * Il protège une **ligne** ; la propriété « il reste au moins un administrateur »
 * est un invariant distinct, tenu par la même politique.
 *
 * `auth0Id` reste nul : la liaison se fait à la première connexion de ce staff
 * (rapprochement par e-mail), pas ici.
 */
export function bootstrapAdmin(email: string): StaffUserPayload {
  return {
    firstName: "Admin",
    lastName: "La Folie Coffee",
    email: normalizeBootstrapEmail(email),
    phone: "",
    jobTitle: "",
    role: "admin",
    overrides: [],
  };
}
