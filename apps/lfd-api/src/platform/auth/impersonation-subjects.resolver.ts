/**
 * **Le port qui résout un identifiant d'impersonation** — et rien de plus.
 *
 * ## Pourquoi il existe
 *
 * `DevImpersonation` accepte un **e-mail** ou un `auth0_sub`, et doit rendre le
 * `auth0_sub` réel. Répondre suppose de lire l'annuaire des clients — c'est une
 * lecture de **domaine**, et le domaine qui la possède est celui des comptes.
 *
 * Elle se faisait en `prisma.user.findUnique` **depuis la couche technique**.
 * Rien ne la signalait : le graphe d'imports ne voyait pas de dépendance —
 * `PrismaService` est technique —, et la porte des schémas ne voyait pas de SQL
 * écrit à la main. C'est exactement la faille que `CLAUDE.md` nomme en toutes
 * lettres : « une frontière qu'on ne franchit qu'en SQL est franchie quand
 * même », et « c'est arrivé deux fois ».
 *
 * Le geste est celui de {@link PrincipalResolver} et de `StaffAccessResolver` :
 * la couche technique **déclare ce dont elle a besoin**, le domaine le fournit,
 * la racine de composition les relie. `lint:prisma-model-ownership` tient
 * désormais la ligne.
 */
export abstract class ImpersonationSubjects {
  /**
   * Le `auth0_sub` correspondant à cet identifiant — e-mail ou `sub` —, ou
   * `null` s'il n'existe pas.
   *
   * `null` plutôt qu'une exception : c'est l'appelant qui sait quel refus
   * opposer, et il n'y a qu'un appelant. Un port qui lèverait imposerait sa
   * grammaire d'erreur à une couche qui n'est pas la sienne.
   */
  abstract resolve(identifier: string): Promise<string | null>;
}
