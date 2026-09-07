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

/** Les trois régimes de règlement, tels que le client les lit. */
export interface OrderSettlementCopy {
  /** Déjà réglée par carte. */
  readonly paid: string;
  /** Enregistrée, mais il reste à payer. */
  readonly due: string;
  /** Portée au compte, rien à encaisser maintenant. */
  readonly account: string;
}

/** Ce que dit le courriel de confirmation d'une commande. */
export interface OrderPlacedCopy {
  /** Objet du message. `{ref}` = le numéro de commande. */
  readonly subject: string;
  /** Sur-titre de l'en-tête, en capitales. */
  readonly kicker: string;
  /** Titre, selon ce que la commande doit encore. */
  readonly title: OrderSettlementCopy;
  readonly intro: string;
  /** Libellé de la ligne de total, selon le même régime. */
  readonly totalLabel: OrderSettlementCopy;
  readonly recapPickup: string;
  readonly recapDelivery: string;
  readonly recapContent: string;
  /** `{count}` = le nombre de pièces. */
  readonly recapPieces: string;
  readonly recapDiscount: string;
  readonly recapVat: string;
  /**
   * Le bloc du QR de retrait. Il est **dans le corps** et non en pièce jointe :
   * c'est la seule chose qu'on vient chercher debout devant un comptoir, et un
   * PDF à ouvrir sur un téléphone, la main sur la porte, ne se scanne pas.
   */
  readonly qrTitle: string;
  readonly qrLine: string;
  readonly cta: string;
  /** Ce que le client fait s'il veut changer quelque chose. */
  readonly changeNote: string;
  readonly footer: string;
}

/** Tout ce qu'un e-mail sait dire, dans une langue. */
export interface MailCopy {
  readonly orderPlaced: OrderPlacedCopy;
}

/**
 * Les trois langues. `Record` **exhaustif par construction** : une langue
 * oubliée ne compile pas, et une phrase ajoutée non plus tant qu'elle n'est pas
 * traduite partout.
 */
export type MailCopyBook = Readonly<Record<ContentLocale, MailCopy>>;
