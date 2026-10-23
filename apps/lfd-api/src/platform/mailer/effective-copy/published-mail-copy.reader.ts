import type { MailCopyOverlay } from "../copy/mail-copy-overlay.js";
import type { MailSectionOrders } from "../sections/mail-layout-scope.js";

/**
 * **Les textes d'e-mails publiés**, tels que le mailer les applique (plan
 * `documentation/contenu-ecommerce/plan-textes-des-e-mails.md`, C2).
 *
 * Port déclaré par la couche technique : le mailer ne connaît pas le contexte
 * qui tient les textes publiés (`b2b/mail-copy`), et `appBootstrap/` relie ce
 * port à son adaptateur (CLAUDE.md §3 — `platform` ne connaît aucun contexte).
 *
 * L'adaptateur garde le publié en mémoire : il est lu à chaque envoi. Il ne
 * rend que des textes encore valides contre le dictionnaire de ce code — une
 * orpheline, ou un texte qui a perdu une variable que le code exige
 * désormais, n'en sort pas.
 */
export abstract class PublishedMailCopyReader {
  /** @throws ce que la base lève : c'est l'appelant qui se replie sur le code. */
  abstract read(): Promise<MailCopyOverlay>;

  /**
   * L'ordre publié des sections, par e-mail (plan `plan-textes-des-e-mails.md`,
   * E4, S3) — seulement ceux qui tiennent encore contre les sections que le
   * code déclare : un e-mail absent part dans l'ordre du code. Même source et
   * même version que les textes : « Publier » les met en service ensemble.
   *
   * @throws ce que la base lève : c'est l'appelant qui se replie sur le code.
   */
  abstract sectionOrders(): Promise<MailSectionOrders>;
}
