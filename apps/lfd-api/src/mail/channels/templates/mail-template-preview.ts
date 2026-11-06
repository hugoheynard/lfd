import type { B2bMails } from "./b2b-mails.js";

/** Un e-mail rendu pour être relu : l'objet tel que la boîte l'affichera, et le corps HTML. */
export interface MailPreview {
  readonly subject: string;
  readonly html: string;
}

/**
 * **« Rends-moi l'aperçu de ce modèle avec ces données »** (lot S3b, plan
 * `documentation/editeur-de-contenu/plan-service-e-mails.md`, § 19 bis).
 *
 * Déclaré par le bloc `mail` et implémenté par lui : un bloc métier qui montre
 * à l'équipe ce qui partira (l'aperçu de l'avis de vitrine) passe par ce port,
 * et le rendu est celui de l'envoi — même gabarit, même marque. Il ne voit ni
 * le registre, ni la marque, ni le dictionnaire.
 */
export abstract class MailTemplatePreview {
  abstract render<K extends keyof B2bMails>(template: K, data: B2bMails[K]): MailPreview;
}
