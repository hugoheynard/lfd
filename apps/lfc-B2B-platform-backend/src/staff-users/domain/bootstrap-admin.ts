import type { StaffUserPayload } from "@lfd/contracts";

/**
 * E-mail (clé humaine) de l'**admin racine** ineffaçable. Normalisé en minuscule,
 * comme toutes les clés e-mail de l'annuaire.
 */
export const BOOTSTRAP_ADMIN_EMAIL = "dev@lafoliedouce.com";

/**
 * Identité par défaut de l'admin **bootstrap** — le tout premier compte staff,
 * celui qui provisionne tous les autres. Il résout le poulet-œuf du 1er admin :
 * sans lui, personne ne peut créer de comptes. Il est :
 * - **semé au boot** s'il manque (`ensureBootstrapAdmin`) — réapparaît même si on
 *   l'a supprimé en base ;
 * - **ineffaçable** et **non rétrogradable** hors du scope `admin` (garde repo).
 *
 * `auth0Id` reste nul : le lien de connexion se fait quand ce staff se logue via
 * Auth0 (résolution par e-mail), pas ici.
 */
export const BOOTSTRAP_ADMIN: StaffUserPayload = {
  firstName: "Dev",
  lastName: "La Folie Coffee",
  email: BOOTSTRAP_ADMIN_EMAIL,
  scopes: ["admin"],
};

/** Vrai si cet e-mail est celui de l'admin racine (comparaison normalisée). */
export function isBootstrapAdminEmail(email: string): boolean {
  return email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL;
}
