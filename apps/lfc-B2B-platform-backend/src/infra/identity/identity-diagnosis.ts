/**
 * Ce que le canal d'identité doit pouvoir faire, et comment le **constater**
 * sans rien créer chez le fournisseur.
 *
 * Écrit le 2026-08-16, après un `500` sur l'ouverture d'un accès client qu'on a
 * cherché une demi-heure. Le corps d'erreur d'Auth0 était journalisé à chaque
 * tentative, mais les journaux du container n'étaient captés nulle part ; et
 * quand ils l'ont été, le refus ne s'est plus reproduit à la demande. Une panne
 * qu'on ne peut pas provoquer se diagnostique par un **contrôle**, pas par une
 * attente.
 *
 * **Pur** : il ne parle à personne. Il lit un jeton déjà obtenu et dit ce qu'il
 * ouvre. C'est ce qui permet de l'éprouver en énumérant les cas.
 */

/**
 * Les autorisations que la plateforme demande à la Management API.
 *
 * Elles ne sont pas décoratives — chacune est le seul moyen de faire un geste
 * qu'un écran propose déjà :
 * - `read:users` : retrouver une identité par son adresse (le renvoi de lien) ;
 * - `create:users` : ouvrir un accès ;
 * - `update:users` : propager un changement d'adresse ;
 * - `create:user_tickets` : émettre le lien de mot de passe — sans lui, le
 *   compte existe et personne ne peut y entrer.
 */
export const REQUIRED_MANAGEMENT_SCOPES: readonly string[] = [
  "read:users",
  "create:users",
  "update:users",
  "create:user_tickets",
];

/**
 * Les autorisations réellement accordées, lues dans la revendication `scope` du
 * jeton d'accès.
 *
 * **La signature n'est pas vérifiée, et ce n'est pas un oubli.** Ce jeton vient
 * d'être obtenu par nous, en TLS, auprès du tenant : nous ne l'authentifions
 * pas, nous le lisons. Il n'ouvre par ailleurs aucune décision d'autorisation
 * ici — seulement un texte de diagnostic. Un jeton illisible rend une liste
 * vide, qui se lira « toutes les autorisations manquent » : le pire cas est un
 * faux négatif bruyant, jamais un accès accordé à tort.
 */
export function scopesFromAccessToken(token: string): readonly string[] {
  const payload = decodePayload(token);
  const scope = payload === null ? undefined : payload["scope"];
  return typeof scope === "string" ? scope.split(" ").filter((entry) => entry !== "") : [];
}

/** Celles qui manquent, dans l'ordre de déclaration — un diagnostic se lit. */
export function missingManagementScopes(granted: readonly string[]): readonly string[] {
  const owned = new Set(granted);
  return REQUIRED_MANAGEMENT_SCOPES.filter((scope) => !owned.has(scope));
}

/** Le corps d'un JWT, ou `null` s'il n'a pas la forme attendue. */
function decodePayload(token: string): Record<string, unknown> | null {
  const segments = token.split(".");
  if (segments.length !== 3) {
    return null;
  }
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(segments[1] ?? "", "base64url").toString("utf8"),
    );
    if (typeof decoded !== "object" || decoded === null) {
      return null;
    }
    return { ...decoded };
  } catch {
    return null;
  }
}
