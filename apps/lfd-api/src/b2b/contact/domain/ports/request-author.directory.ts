import type { RequestAuthor } from "../customer-request.js";

/**
 * Port de **lecture** de l'auteur d'un signalement : nom, e-mail et téléphone
 * pris AU COMPTE, jamais au corps (`demandes-clients.md`, §3.2).
 */
export abstract class RequestAuthorDirectory {
  /** `null` si le compte n'existe pas. */
  abstract of(userId: string): Promise<RequestAuthor | null>;
}
