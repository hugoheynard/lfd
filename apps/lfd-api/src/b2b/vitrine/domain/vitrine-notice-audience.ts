import { VitrineSubscriberNotFoundError } from "./errors/vitrine-errors.js";
import {
  VitrineNoticeNoRecipientError,
  VitrineNoticeRecipientWithoutContactError,
} from "./errors/vitrine-notice-errors.js";

/** Un abonné tel que l'annonce le voit : qui il est, et où lui écrire. */
export interface VitrineNoticeCandidate {
  readonly subscriberId: string;
  readonly name: string;
  /** `null` : pas de contact, l'abonné ne peut pas être choisi. */
  readonly contactEmail: string | null;
}

/** Un destinataire retenu : l'adresse telle qu'elle est À L'ENVOI. */
export interface VitrineNoticeAddressee {
  readonly subscriberId: string;
  readonly name: string;
  readonly contactEmail: string;
}

/**
 * **Qui recevra l'annonce.** `selection` `null` = tous les abonnés qui ont un
 * contact ; sinon les abonnés désignés, chacun devant en avoir un.
 *
 * Un abonné COUPÉ reste notifiable (décision du lot, 2026-10-18) : couper
 * arrête le webhook et la lecture, et c'est justement à lui qu'on peut avoir
 * à l'annoncer. Un même abonné choisi deux fois ne reçoit qu'un e-mail.
 *
 * @throws {VitrineSubscriberNotFoundError} un id choisi ne désigne aucun abonné.
 * @throws {VitrineNoticeRecipientWithoutContactError} un abonné choisi n'a pas de contact.
 * @throws {VitrineNoticeNoRecipientError} personne à qui écrire.
 */
export function selectVitrineNoticeAddressees(
  candidates: readonly VitrineNoticeCandidate[],
  selection: readonly string[] | null,
): readonly VitrineNoticeAddressee[] {
  const chosen = selection === null ? withContact(candidates) : designated(candidates, selection);
  if (chosen.length === 0) {
    throw new VitrineNoticeNoRecipientError();
  }
  return chosen;
}

function withContact(candidates: readonly VitrineNoticeCandidate[]): VitrineNoticeAddressee[] {
  return candidates.flatMap((candidate) =>
    candidate.contactEmail === null ? [] : [{ ...candidate, contactEmail: candidate.contactEmail }],
  );
}

function designated(
  candidates: readonly VitrineNoticeCandidate[],
  selection: readonly string[],
): VitrineNoticeAddressee[] {
  const byId = new Map(candidates.map((candidate) => [candidate.subscriberId, candidate]));
  return [...new Set(selection)].map((id) => {
    const candidate = byId.get(id);
    if (candidate === undefined) {
      throw new VitrineSubscriberNotFoundError(id);
    }
    if (candidate.contactEmail === null) {
      throw new VitrineNoticeRecipientWithoutContactError(candidate.name);
    }
    return { ...candidate, contactEmail: candidate.contactEmail };
  });
}
