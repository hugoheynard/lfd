/**
 * Ce que rendent les routes qui **créent**.
 *
 * Ces formes étaient écrites en anonyme des deux côtés — `Promise<{ id: string }>`
 * dans le contrôleur, `post<{ id: string }>` dans le service Angular. Deux
 * littéraux identiques ne sont pas un contrat : ils se ressemblent, et rien ne
 * les tient ensemble. Le jour où la route rend `{ id, reference }`, le front
 * compile toujours et ignore simplement le second champ.
 *
 * Les nommer ici les rend **joignables** : le backend et le front désignent
 * enfin la même chose, et le compilateur peut le dire.
 */

/**
 * L'identifiant de ce qui vient de naître, et rien d'autre.
 *
 * Rien d'autre volontairement : une route de création rend de quoi retrouver ce
 * qu'elle a créé, pas une projection complète. Qui veut la suite fait un `GET`
 * — et gagne au passage le droit de la voir changer.
 */
export interface CreatedIdResponse {
  readonly id: string;
}

/** `POST /admin/staff-users/:id/invitation` — l'invitation est-elle partie ? */
export interface InvitationSentResponse {
  /** `false` quand le courrier n'a pas pu être remis : l'écran propose alors le lien. */
  readonly mailSent: boolean;
}

/**
 * Un lien d'accès **frais**, fabriqué à la demande.
 *
 * L'échéance vient du serveur et n'est pas négociable côté écran : un lien de
 * mot de passe est à usage unique et daté.
 */
export interface IssuedLinkResponse {
  readonly url: string;
  /** ISO. Jusqu'à quand il ouvre. */
  readonly expiresAt: string;
}

/** `POST /admin/price-templates/:id/apply` — combien de règles le gabarit a posées. */
export interface PosedRulesResponse {
  readonly posedRules: number;
}

/** Le jeton d'appairage d'un point de vente, rendu une seule fois à sa création. */
export interface IssuedTokenResponse {
  readonly token: string;
}

/**
 * Une personne à qui l'accès a été ouvert et qui **n'a jamais posé de mot de
 * passe**. Ce que le staff a besoin de savoir pour lui remettre son lien.
 *
 * Vit ici et non côté backend parce que le front en rendait sa PROPRE copie —
 * `RawClient` — champ pour champ. Deux formes qui décrivent la même ligne et
 * qu'aucun compilateur ne rapproche : c'est exactement ce que les contrats
 * existent pour empêcher.
 */
export interface PendingAccessView {
  readonly userId: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  /** La société pour laquelle l'accès a été ouvert. */
  readonly companyId: string;
  readonly companyName: string;
  /** ISO. Depuis quand elle attend — c'est l'âge qui fait agir. */
  readonly invitedAt: string;
}

/**
 * La même attente, côté ÉQUIPE. Pas de société : une fonction.
 *
 * Deux formes et non une : un membre du staff n'a pas de `companyId`, et lui en
 * inventer un vide obligerait chaque lecteur à savoir lequel des deux cas il
 * tient. Le front les réunit à l'affichage, ce qui est son travail.
 */
export interface PendingStaffAccessView {
  readonly staffUserId: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly jobTitle: string;
  /** ISO. */
  readonly invitedAt: string;
}
