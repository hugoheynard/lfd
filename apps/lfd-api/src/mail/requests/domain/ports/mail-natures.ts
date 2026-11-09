import type { MailNature } from "@lfd/mail-blocks";

/**
 * Port de **la nature d'un modèle** (plan
 * `documentation/mail/la-desinscription-et-l-accord.md`, règle 1) : le
 * contrôle à l'envoi la lit pour savoir s'il doit lire le registre de
 * préférence. Un port plutôt que la table du registre en direct : un test
 * peut y déclarer un modèle marketing d'essai sans que la production en
 * porte un (U3).
 */
export abstract class MailNatures {
  /** `null` : une clé que le registre ne connaît pas (un envoi d'un modèle retiré). */
  abstract natureOf(template: string): MailNature | null;
}
