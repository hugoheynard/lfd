import type { MailRequest } from "../entities/mail-request.js";

/**
 * Port d'**écriture** du suivi des demandes.
 *
 * Deux écritures, et non une : `addIfAbsent` sert la demande, qui s'écrit dans
 * la transaction de l'APPELANT — une violation d'unicité y annulerait l'écriture
 * de celui qui demande ; elle saute donc une clé déjà connue au lieu de lever.
 * `save` range une demande dont l'agrégat a décidé la transition.
 */
export abstract class MailRequestRepository {
  /** La demande de cette clé d'idempotence, ou `null`. */
  abstract findByIdempotencyKey(key: string): Promise<MailRequest | null>;
  /** @returns `false` si une demande de même clé existait déjà (rien n'est écrit). */
  abstract addIfAbsent(request: MailRequest): Promise<boolean>;
  /** Range une demande, neuve ou chargée (par sa clé d'idempotence). */
  abstract save(request: MailRequest): Promise<void>;
}
