/**
 * `Session` = l'identité **autoritaire depuis la base** renvoyée par le backend
 * B2B sur `GET /me`. Elle reflète le `Principal` du backend (`src/infra/auth/
 * principal.ts`) : le jeton Auth0 ne prouve que le `subject` (sub) ; `userId`,
 * `companyId`, `role`, `email` viennent de la base de données B2B.
 *
 * Distinction clé côté front :
 *   - `authUser` (profil Auth0, claims du token)  → « qui a prouvé son sub »
 *   - `session`  (ce type, résolu par le backend)  → « qui je suis chez nous »
 */
export interface Session {
  readonly subject: string;
  readonly userId: string;
  readonly companyId: string;
  readonly role: string;
  readonly email: string;
  readonly scopes: readonly string[];
}
