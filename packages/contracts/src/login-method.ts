/**
 * Les **méthodes de connexion** d'une personne — ce que `GET /me/identities`
 * renvoie, et ce que la section « Méthodes de connexion » du profil affiche.
 *
 * Elles ne vivent pas chez nous : le rattachement se fait chez le fournisseur
 * d'identité, et notre base n'en garde rien (plan
 * `documentation/auth-inscription/plan-rattachement-depuis-le-profil.md`, R1).
 * C'est pour ça que cette liste n'est **pas** dans `AccountView` : la servir
 * avec `/me` mettrait un appel réseau sortant sur le chemin d'amorçage de
 * toutes les pages, pour une information qu'un seul écran affiche (R6).
 *
 * 🔴 **Aucun identifiant du fournisseur n'en sort.** Le `user_id` secondaire
 * reste à l'API : c'est elle qui le retrouve pour détacher, à partir du seul
 * `provider`. Le publier le ferait entrer dans une URL, donc dans tous les
 * journaux d'accès — ce que le §9.5 du plan interdit explicitement.
 */

/** Une façon de se connecter au même compte. */
export interface LoginMethodView {
  /**
   * La stratégie du fournisseur — `auth0` (mot de passe), `google-oauth2`,
   * `facebook`. C'est la clé que le retrait prend en paramètre d'URL, et le
   * front en tire le libellé et le logo.
   */
  readonly provider: string;
  /**
   * La base d'utilisateurs visée, quand le fournisseur la nomme ; `null` sur
   * certaines connexions sociales, qui n'en déclarent pas.
   */
  readonly connection: string | null;
  /**
   * L'identité qui **porte** le compte. Elle ne se détache jamais : la
   * Management API ne délie que des identités secondaires. L'écran ne propose
   * donc aucun geste de retrait dessus — une promesse qu'on ne pourrait pas
   * tenir vaut moins que son absence.
   */
  readonly isPrimary: boolean;
}

/** La liste, dans l'ordre où le fournisseur la rend. */
export type LoginMethodsView = readonly LoginMethodView[];
