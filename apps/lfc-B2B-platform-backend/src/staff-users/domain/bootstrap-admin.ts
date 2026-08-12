import type { StaffUserPayload } from "@lfd/contracts";

/**
 * E-mail de l'admin racine **par défaut**, quand `BOOTSTRAP_ADMIN_EMAIL` n'est
 * pas posée. Il convient au dev ; en production, pointer une **vraie boîte que
 * quelqu'un relève** — c'est la porte de secours, elle ne sert que si elle est
 * écoutée.
 */
export const DEFAULT_BOOTSTRAP_ADMIN_EMAIL = "dev@lafoliedouce.com";

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

/** L'adresse racine, normalisée comme toutes les clés e-mail de l'annuaire. */
export function normalizeBootstrapEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  return trimmed === "" ? DEFAULT_BOOTSTRAP_ADMIN_EMAIL : trimmed;
}
