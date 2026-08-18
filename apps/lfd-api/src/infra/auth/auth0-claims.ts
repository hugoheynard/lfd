/**
 * Les claims **namespacés** que le tenant Auth0 pose sur nos access tokens.
 *
 * Auth0 **strippe silencieusement** tout claim non namespacé d'un access token :
 * un `email` nu ne lève pas d'erreur, il n'arrive simplement jamais. Le nom
 * complet n'est donc pas une coquetterie, c'est la condition d'existence du
 * claim — et la panne qu'un oubli produit est invisible, ce qui la rend chère.
 *
 * Ces constantes vivent ici parce qu'elles ont **deux** lecteurs — le token
 * client et le token staff — et un seul écrivain, l'Action Auth0. Trois copies
 * d'une même chaîne, c'est une divergence qui attend son heure : elle s'est
 * déjà produite entre `.eu` et `.com`, et aucun test ne pouvait la voir puisque
 * l'écrivain vit hors du dépôt.
 *
 * ⚠️ **Contrepartie côté tenant** — Actions → Library → `add-email-claim`,
 * attachée au trigger Post Login :
 *
 * ```js
 * exports.onExecutePostLogin = async (event, api) => {
 *   const NS = "https://lafoliedouce.eu";
 *   api.accessToken.setCustomClaim(NS + "/email", event.user.email);
 *   api.accessToken.setCustomClaim(NS + "/email_verified", event.user.email_verified);
 * };
 * ```
 *
 * Le namespace n'a pas à être une URL joignable : Auth0 ne la résout jamais,
 * c'est un préfixe d'unicité. Il doit seulement être **le même des deux côtés**.
 */

/** Le préfixe d'unicité de nos claims. Jamais résolu, jamais appelé. */
const NAMESPACE = "https://lafoliedouce.eu";

/**
 * L'adresse de connexion, telle que le fournisseur d'identité la connaît.
 *
 * Côté client, absente = provisioning JIT avec e-mail vide. Côté staff, absente
 * = premier rapprochement impossible, donc `403` — jamais un accès accordé par
 * défaut.
 */
export const EMAIL_CLAIM = `${NAMESPACE}/email`;

/**
 * Si l'adresse a été **prouvée**. Absent ne veut pas dire « non » : c'est « on
 * ne sait pas », et seul ce second cas autorise à laisser la base telle quelle.
 */
export const EMAIL_VERIFIED_CLAIM = `${NAMESPACE}/email_verified`;

/** Lit un claim de type chaîne, en traitant la chaîne vide comme une absence. */
export function readStringClaim(
  payload: Readonly<Record<string, unknown>>,
  claim: string,
): string | undefined {
  const value = payload[claim];
  return typeof value === "string" && value !== "" ? value : undefined;
}
