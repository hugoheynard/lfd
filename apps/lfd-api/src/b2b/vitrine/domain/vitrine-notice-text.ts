import {
  VitrineNoticeMessageInvalidError,
  VitrineNoticeSubjectInvalidError,
} from "./errors/vitrine-notice-errors.js";

/** L'objet d'une annonce : une ligne, assez court pour tenir dans une boîte de réception. */
export const VITRINE_NOTICE_SUBJECT_MAX = 150;
/** Le message d'une annonce, en texte brut. */
export const VITRINE_NOTICE_MESSAGE_MAX = 5000;

// Un retour à la ligne dans un objet d'e-mail est une injection d'en-tête en puissance.
const LINE_BREAK = /[\r\n]/u;

/**
 * **L'objet et le message d'une annonce aux abonnés**, validés une fois et
 * partagés par l'aperçu et l'envoi : ce qui a été relu est ce qui part.
 */
export class VitrineNoticeText {
  private constructor(
    readonly subject: string,
    readonly message: string,
  ) {}

  /** @throws {VitrineNoticeSubjectInvalidError} {VitrineNoticeMessageInvalidError} */
  static of(subject: string, message: string): VitrineNoticeText {
    const cleanSubject = subject.trim();
    if (
      cleanSubject === "" ||
      cleanSubject.length > VITRINE_NOTICE_SUBJECT_MAX ||
      LINE_BREAK.test(cleanSubject)
    ) {
      throw new VitrineNoticeSubjectInvalidError(VITRINE_NOTICE_SUBJECT_MAX);
    }
    const cleanMessage = message.trim();
    if (cleanMessage === "" || cleanMessage.length > VITRINE_NOTICE_MESSAGE_MAX) {
      throw new VitrineNoticeMessageInvalidError(VITRINE_NOTICE_MESSAGE_MAX);
    }
    return new VitrineNoticeText(cleanSubject, cleanMessage);
  }
}
