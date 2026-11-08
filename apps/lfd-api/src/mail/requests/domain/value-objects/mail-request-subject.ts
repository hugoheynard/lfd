import {
  isMailSubjectType,
  MAIL_SUBJECT_ID_MAX,
  MAIL_SUBJECT_TYPES,
  type MailSubject,
} from "../../../channels/requests/mail-subject.js";
import { InvalidMailRequestError } from "../errors/mail-request.errors.js";

/**
 * **Un sujet de demande, revalidé** (`le-sujet-des-e-mails.md`,
 * règle 1) : un type de la liste fermée du canal, un identifiant non vide
 * d'au plus {@link MAIL_SUBJECT_ID_MAX} caractères. Le type arrive en chaîne
 * brute quand il est relu (base, boîte d'envoi) : c'est ici qu'il redevient
 * un type connu, ou qu'il est refusé.
 *
 * @throws {InvalidMailRequestError} type inconnu, identifiant vide ou trop long.
 */
export function mailRequestSubjectOf(type: string, id: string): MailSubject {
  if (!isMailSubjectType(type)) {
    throw new InvalidMailRequestError(
      `le sujet « ${type} »`,
      `n'est pas un type connu (connus : ${MAIL_SUBJECT_TYPES.join(", ")})`,
    );
  }
  // Opaque : rangé tel quel, jamais retaillé — seul un identifiant blanc est refusé.
  if (id.trim().length === 0) {
    throw new InvalidMailRequestError(`l'identifiant du sujet « ${type} »`, "est vide");
  }
  if (id.length > MAIL_SUBJECT_ID_MAX) {
    throw new InvalidMailRequestError(
      `l'identifiant du sujet « ${type} »`,
      `dépasse ${MAIL_SUBJECT_ID_MAX} caractères`,
    );
  }
  return { type, id };
}

/**
 * Les sujets d'une demande, chacun revalidé, sans doublon : la table enfant
 * a sa clé primaire sur le triplet, et un doublon y ferait échouer
 * l'écriture de l'appelant. L'ordre d'arrivée est gardé.
 */
export function mailRequestSubjectsOf(
  subjects: readonly { readonly type: string; readonly id: string }[],
): readonly MailSubject[] {
  const seen = new Set<string>();
  const kept: MailSubject[] = [];
  for (const raw of subjects) {
    const subject = mailRequestSubjectOf(raw.type, raw.id);
    const key = `${subject.type}\u0000${subject.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      kept.push(subject);
    }
  }
  return kept;
}
