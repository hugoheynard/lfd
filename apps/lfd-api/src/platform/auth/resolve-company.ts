import type { PrincipalMembership } from "./principal.js";

/**
 * **Pour quelle société cette requête agit-elle ?**
 *
 * Trois branches, et la troisième est celle qui compte.
 *
 * - **aucun rattachement** — `null`. La personne commande à titre personnel :
 *   c'est le parcours par défaut de la boutique, pas un trou à combler.
 * - **un seul** — celui-là. Ce n'est **pas** le raccourci que `principal.ts`
 *   interdit : il n'y a aucun choix à faire, donc aucun risque de se tromper de
 *   tenant. « La première de plusieurs » et « la seule » ne se ressemblent que
 *   dans le code.
 * - **plusieurs** — la requête doit **déclarer** laquelle, et la déclaration est
 *   vérifiée contre les rattachements. Sans déclaration, `null` : on ne devine
 *   pas, et le tarif public est la réponse honnête à « je ne sais pas encore
 *   pour qui ». Une société déclarée à laquelle la personne n'appartient pas est
 *   ignorée, jamais servie.
 *
 * Pure : elle ne lit ni en-tête ni base, elle reçoit ce qui a déjà été vérifié.
 * C'est ce qui permet d'énumérer ses cas au lieu de monter une requête HTTP.
 */
export function resolveCompany(
  memberships: readonly PrincipalMembership[],
  declared: string | null,
): string | null {
  const [only, ...rest] = memberships;
  if (only === undefined) {
    return null;
  }
  if (rest.length === 0) {
    return only.companyId;
  }
  // Plusieurs : la déclaration décide, et seulement si elle désigne un
  // rattachement réel. Retomber sur « la première » ici servirait le tarif d'une
  // maison à quelqu'un qui en regarde une autre.
  if (declared === null) {
    return null;
  }
  return memberships.some((membership) => membership.companyId === declared) ? declared : null;
}

/**
 * L'en-tête par lequel un client dit **dans quel espace il travaille**.
 *
 * Un en-tête et non un paramètre de route : le contexte vaut pour TOUTE la
 * requête — la vitrine, le panier, la commande — et le répéter dans chaque URL
 * en ferait un argument qu'on peut oublier à un endroit. Il ne porte aucune
 * autorité : il est confronté aux rattachements, et ignoré s'il ment.
 */
export const COMPANY_HEADER = "x-lfc-company";
