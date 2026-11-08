import type { OrderShortfallDraftData } from "../../templates/order-shortfall-mail.js";

export type {
  OrderShortfallDraftData,
  OrderShortfallDraftLine,
} from "../../templates/order-shortfall-mail.js";

/**
 * **« Rédige la proposition de la lettre de manque »** (lot S3b, plan
 * `documentation/mail/plan-service-e-mails.md`, § 19 bis) : ce
 * qui part, ce qui manque, la suite, dans la langue demandée, par le
 * dictionnaire des e-mails et les textes PUBLIÉS — comme à l'envoi.
 *
 * Déclaré et implémenté par le bloc `mail` ; la commande ne connaît ni le
 * dictionnaire, ni le publié. Ne lève pas quand le publié est illisible : la
 * proposition suit alors le texte du code, et l'implémentation le journalise.
 */
export abstract class ShortfallLetterDrafter {
  abstract draft(data: OrderShortfallDraftData): Promise<string>;
}
