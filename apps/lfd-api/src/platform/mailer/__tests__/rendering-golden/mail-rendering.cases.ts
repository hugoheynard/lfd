import { CUSTOMER_CASES } from "./customer-cases.js";
import type { MailCases } from "./mail-cases.type.js";
import { ORDER_CASES } from "./order-cases.js";
import { TEAM_CASES } from "./team-cases.js";

/**
 * **Les données d'exemple des 28 e-mails**, une liste de cas par clé du
 * registre, choisis pour passer par CHAQUE branche du texte : avec et sans
 * prénom, avec et sans lien, chaque régime, chaque geste.
 *
 * Elles servent l'empreinte de rendu (`mail-rendering-golden.spec.ts`) : le
 * passage des textes au dictionnaire (plan `plan-textes-des-e-mails.md`, E1)
 * ne devait changer AUCUN octet, et ces cas sont ce qui le prouve.
 *
 * Les dates y sont des données mises en forme, jamais comparées à l'horloge :
 * aucun gabarit ne lit le temps.
 */
export const MAIL_CASES: MailCases = { ...ORDER_CASES, ...CUSTOMER_CASES, ...TEAM_CASES };
