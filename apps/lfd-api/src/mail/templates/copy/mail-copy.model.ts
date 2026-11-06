import type { ContentLocale } from "@lfd/contracts";

/**
 * **Les textes des e-mails, côté serveur, en trois langues.**
 *
 * ## Pourquoi ici et pas dans le front
 *
 * Un e-mail part du **backend**. Le dictionnaire de l'app cliente ne lui est pas
 * accessible, et le recopier créerait deux vérités sur les mêmes phrases : celle
 * qu'on lit à l'écran, et celle qui arrive dans la boîte. La première divergence
 * se produirait au premier ajustement de ton, sur le côté qu'on relit le moins.
 *
 * ## Le garde-fou, et il est structurel
 *
 * {@link MailCopyBook} est un `Record` sur les trois langues : **ajouter une
 * phrase ne compile pas** tant que `fr`, `en` et `it` ne l'ont pas. C'est la
 * même garantie que le dictionnaire de l'app cliente, et pour la même raison —
 * un gabarit qui écrit ses propres phrases sort du filet, partira en français à
 * un client italien, et personne ne le saura avant qu'il le dise.
 *
 * ## Ce que ces textes NE font pas
 *
 * Ils ne décident rien. Le régime de règlement, la présence d'une remise, le
 * mode d'acheminement : tout est déjà tranché dans la feuille que le gabarit
 * reçoit. Le dictionnaire ne fait que **nommer** ce qu'elle porte.
 *
 * ⚠️ **Réserve de frontière, écrite plutôt que tue.** Ce fichier vit dans
 * `platform/`, qui selon la matrice du `CLAUDE.md` racine « ne connaît aucun
 * contexte ». Il parle pourtant de commandes, de retrait et de TVA. La dérive
 * est antérieure — le registre porte déjà `customer.access-opened` et
 * `staff.appointment-booked` — mais elle s'aggrave ici. La sortie propre est que
 * chaque contexte fournisse ses gabarits et que `appBootstrap/` les assemble ;
 * c'est un refactor du registre entier, pas de ce lot.
 */

import type { AccountMailsCopy } from "./model/account-mails.model.js";
import type { BillingMailsCopy } from "./model/billing-mails.model.js";
import type { OrderChangeMailsCopy } from "./model/order-change-mails.model.js";
import type { OrderMailsCopy } from "./model/order-mails.model.js";
import type { OrderShortfallMailsCopy } from "./model/order-shortfall-mails.model.js";
import type { PaymentMailsCopy } from "./model/payment-mails.model.js";
import type { TeamMailsCopy } from "./model/team-mails.model.js";

export type * from "./model/account-mails.model.js";
export type * from "./model/billing-mails.model.js";
export type * from "./model/order-change-mails.model.js";
export type * from "./model/order-mails.model.js";
export type * from "./model/order-shortfall-mails.model.js";
export type * from "./model/payment-mails.model.js";
export type * from "./model/team-mails.model.js";

/**
 * Tout ce qu'un e-mail sait dire, dans une langue — **une section par clé du
 * registre** (`B2bMails`, `mail-templates.ts`), depuis le 2026-10-23 (plan
 * `documentation/contenu-ecommerce/plan-textes-des-e-mails.md`, E1).
 *
 * Objet, titre, paragraphes, libellés, boutons, pied, textes alternatifs :
 * tout ce qu'un destinataire lit est ici, et rien n'est resté dans les
 * gabarits. Les DONNÉES (numéro, montant, jour, nom) sont des variables
 * `{nom}` que le texte place où il veut ; `mail-copy.variables.ts` dit
 * lesquelles chaque texte peut porter. Ce qui reste au gabarit est la mise
 * en page : l'ordre des blocs, les sauts de paragraphe, la forme
 * « Libellé : valeur » des e-mails internes, les séparateurs d'une liste.
 *
 * Rangé par famille (commande, paiement, facturation, compte, équipe) pour
 * tenir chaque fichier sous 300 lignes ; un futur écran les lit par clé.
 */
export type MailCopy = OrderMailsCopy &
  PaymentMailsCopy &
  BillingMailsCopy &
  AccountMailsCopy &
  TeamMailsCopy &
  OrderChangeMailsCopy &
  OrderShortfallMailsCopy;

/**
 * Les trois langues. `Record` **exhaustif par construction** : une langue
 * oubliée ne compile pas, et une phrase ajoutée non plus tant qu'elle n'est pas
 * traduite partout.
 */
export type MailCopyBook = Readonly<Record<ContentLocale, MailCopy>>;
