import { PERSONAL_WORKSPACE } from "@lfd/contracts";

import type { PrincipalMembership } from "./principal.js";

/**
 * **Pour quelle société cette requête agit-elle ?**
 *
 * Une déclaration d'abord, puis trois branches — et la dernière est celle qui
 * compte.
 *
 * - **« perso » déclaré** ({@link PERSONAL_WORKSPACE}) — `null`, **quel que soit**
 *   le nombre de rattachements. Sans cette valeur, l'espace perso était
 *   inexprimable pour qui a exactement une société : la branche suivante
 *   ignorait l'en-tête.
 *
 *   ⚠️ Ce n'est PAS un cran qui ne ferait que retirer. En accès, `null` ne
 *   franchit aucun mur ; en **prix**, il en ouvre : un rattaché commande alors
 *   hors de sa mercuriale (donc avec les promotions qu'elle scelle), hors du
 *   cumul d'un engagement de volume, et en perso même quand sa société est
 *   suspendue. Ouvert sans condition par décision (Hugo, 2026-09-15, Q1 de
 *   `documentation/b2b/plan-espace-de-travail.md`).
 * - **aucun rattachement** — `null`. La personne commande à titre personnel :
 *   c'est le parcours par défaut de la boutique, pas un trou à combler.
 * - **un seul** — celui-là. Ce n'est **pas** le raccourci que `principal.ts`
 *   interdit : il n'y a aucun choix à faire, donc aucun risque de se tromper de
 *   tenant. « La première de plusieurs » et « la seule » ne se ressemblent que
 *   dans le code. Une déclaration qui nomme une AUTRE société est ignorée.
 * - **plusieurs** — la requête doit **déclarer** laquelle, et la déclaration est
 *   vérifiée contre les rattachements. Sans déclaration, `null` : on ne devine
 *   pas. Une société déclarée à laquelle la personne n'appartient pas est
 *   ignorée, jamais servie.
 *
 * Pure : elle ne lit ni en-tête ni base, elle reçoit ce qui a déjà été vérifié.
 * C'est ce qui permet d'énumérer ses cas au lieu de monter une requête HTTP.
 */
export function resolveCompany(
  memberships: readonly PrincipalMembership[],
  declared: string | null,
): string | null {
  if (declared === PERSONAL_WORKSPACE) {
    return null;
  }
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
