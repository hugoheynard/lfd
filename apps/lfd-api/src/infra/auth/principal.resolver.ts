import type { Principal, VerifiedToken } from "./principal.js";

/**
 * **Le port de résolution du principal** — ce que la couche technique sait
 * faire, et rien de plus.
 *
 * Le jeton prouve « ce porteur est ce `sub` ». Le transformer en `Principal` —
 * qui est cette personne chez nous, à quelle société elle appartient, quel rôle
 * elle détient — n'est PAS une affaire technique : c'est une lecture de domaine,
 * et le domaine qui la possède est celui des comptes.
 *
 * Ce port existe pour que le guard puisse continuer à orchestrer les deux étapes
 * (prouver, puis enrichir) **sans que `infra/auth` connaisse `account/`**. La
 * couche technique déclare ce dont elle a besoin ; le domaine le fournit ; la
 * racine de composition les relie.
 *
 * Sans lui, l'authentification — donc chaque requête — dépendait de la
 * plateforme marchande. Le jour où le socle staff ou le PIM se posent sur la
 * même application, cette dépendance-là les aurait suivis pour rien.
 */
export abstract class PrincipalResolver {
  /**
   * Résout le principal enrichi depuis un jeton **déjà vérifié**.
   *
   * @throws UnauthorizedException si le compte est refusé (inconnu, désactivé).
   *   Ce refus est **métier** : il porte son propre message et le guard le
   *   laisse passer tel quel plutôt que de le masquer derrière « jeton invalide ».
   */
  abstract resolve(token: VerifiedToken): Promise<Principal>;
}
