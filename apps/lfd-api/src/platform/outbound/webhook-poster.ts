/** Ce qu'on envoie : un corps déjà sérialisé (c'est lui qui est signé) et ses en-têtes. */
export interface WebhookPost {
  readonly url: string;
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * Ce qu'un envoi a donné. Une union plutôt qu'une exception : « l'abonné a
 * répondu 500 », « il ne répond pas » et « nous avons refusé d'y aller »
 * appellent trois lectures différentes dans le journal des envois.
 *
 * - `accepted` : un 2xx ;
 * - `rejected` : une autre réponse, redirections comprises (jamais suivies) ;
 * - `refused` : NOUS avons refusé d'envoyer (adresse privée, pas https) ;
 * - `unreachable` : nom introuvable, délai dépassé, TLS refusé, connexion coupée.
 */
export type WebhookPostOutcome =
  | { readonly kind: "accepted"; readonly status: number }
  | { readonly kind: "rejected"; readonly status: number }
  | { readonly kind: "refused"; readonly reason: string }
  | { readonly kind: "unreachable"; readonly reason: string };

/**
 * **Le relais HTTP sortant** vers une adresse fournie par un tiers (plan
 * vitrine, S2). Un port : le métier ne sait ni résoudre un nom, ni ouvrir une
 * socket, et ses tests n'ouvrent rien.
 */
export abstract class WebhookPoster {
  abstract post(request: WebhookPost): Promise<WebhookPostOutcome>;
}
