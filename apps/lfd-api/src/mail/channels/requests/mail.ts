import type { MailSpace } from "@lfd/mail-blocks";

import type { B2bMails } from "../templates/b2b-mails.js";

/**
 * La marque au nom de laquelle un e-mail part : **l'espace de son modèle**
 * (plan `plan-editeur-par-blocs.md`, § 25, C3 — « une marque = un espace =
 * une charte = une identité d'envoi »). L'appelant ne la choisit pas : le
 * bloc la lit du modèle (`mailSpaceOf`).
 */
export type MailBrandName = MailSpace;

/**
 * **Une demande d'e-mail** (plan `documentation/mail/plan-service-e-mails.md`, C2) :
 * le modèle (clé du registre `B2bMails`), ses données — vérifiées par le
 * compilateur, comme `mailer.send()` —, le destinataire et une clé
 * d'idempotence. La marque n'en est plus (C3) : elle découle du modèle.
 *
 * La langue n'est pas un second champ : elle est lue dans les données du
 * modèle (`locale`), là où le gabarit la lit déjà.
 */
export interface MailDemand<K extends keyof B2bMails> {
  readonly template: K;
  readonly to: string;
  readonly data: ImmediateMailData<K>;
  /**
   * Déterministe chez l'appelant (`order.placed:<orderId>`) : une seconde
   * demande de même clé ne fait rien, et un rejeu de la boîte d'envoi ne
   * double pas l'envoi.
   */
  readonly idempotencyKey: string;
  /**
   * L'adresse à laquelle répondre, quand ce n'est pas l'expéditeur : l'auteur
   * d'une demande client, pour que l'équipe lui réponde d'un clic (lot S2c).
   * Le mailer la revalide avant d'en faire un en-tête ; une adresse refusée
   * refuse l'envoi — à l'appelant de l'écarter avant (`isValidReplyTo`).
   */
  readonly replyTo?: string;
}

/**
 * Vrai si `T` traverse un `jsonb` intact ET ne porte pas de PDF en base64.
 *
 * Une demande différée voyage dans la boîte d'envoi (`platform.outbox`, colonne
 * `jsonb`) : un `Date` y deviendrait une chaîne, une fonction y disparaîtrait,
 * et un PDF y serait écrit puis rejoué (plan, C2 : « une pièce jointe n'entre
 * jamais dans la demande »).
 */
type DefersIntact<T> = T extends string | number | boolean | null | undefined
  ? true
  : T extends Date | Uint8Array | ((...args: never[]) => unknown)
    ? false
    : T extends readonly (infer U)[]
      ? DefersIntact<U>
      : T extends object
        ? "pdfBase64" extends keyof T
          ? false
          : { [P in keyof T]-?: DefersIntact<T[P]> }[keyof T]
        : false;

/** `true` seulement si TOUTES les branches le sont (une union distribue). */
type Every<B> = [B] extends [true] ? true : false;

/**
 * **Une pièce jointe par référence** (plan C2 : « une pièce jointe n'entre
 * jamais dans la demande ») : le PDF est déposé au stockage par l'appelant,
 * la demande ne porte que sa clé, et le bloc le relit au moment de l'envoi —
 * après la validation, comme au balayeur.
 *
 * `store` nomme le stockage où la pièce est rangée. Seul celui des pièces
 * attachées à un client est ouvert au 2026-11-06 (le bon de commande, la
 * facture, le mandat à signer) ; le dossier du fournil n'y passe pas : il
 * part en `sendAndAwaitReceipt` (lot S2f).
 */
export interface StoredPdf {
  readonly store: "customer-documents";
  readonly key: string;
}

/**
 * La forme différée des données d'un modèle : partout où le gabarit attend
 * `pdfBase64`, la demande porte `pdfStored`, la référence au stockage. Le
 * bloc fait la substitution inverse à l'envoi ; le gabarit ne change pas.
 */
export type ByReference<T> = T extends string | number | boolean | null | undefined
  ? T
  : T extends readonly (infer U)[]
    ? readonly ByReference<U>[]
    : T extends object
      ? "pdfBase64" extends keyof T
        ? { readonly [P in keyof T as Exclude<P, "pdfBase64">]: ByReference<T[P]> } & {
            readonly pdfStored: StoredPdf;
          }
        : { readonly [P in keyof T]: ByReference<T[P]> }
      : T;

/**
 * Les modèles à PDF ouverts à `send`, leur pièce passant par référence.
 * Au 2026-11-06 : le bon joint à la confirmation de commande (lot S2a), la
 * facture Factur-X, rangée au même stockage sous `Invoice.documentKey` (lot
 * S2d), et le mandat à signer, rangé avant l'envoi sous
 * `mandates/<société>/<mandat>/<intention>.pdf` (revue, cas 7). Le dossier
 * du fournil RESTE fermé : il est rangé au stockage du fournil, que le bloc
 * n'ouvre pas.
 */
type OpenedByReference =
  "customer.order-placed" | "customer.invoice-issued" | "customer.mandate-to-sign";

/**
 * Les données d'un envoi immédiat : la pièce par référence (`pdfStored`), ou
 * encore en octets (`pdfBase64`). Le bloc relit la pièce rangée dans les deux
 * gestes.
 *
 * Revue, cas 7 (Hugo, 2026-11-06) : « tout document envoyé est l'exemplaire
 * gardé ». Les octets restent exprimables ici parce que le bloc lui-même en
 * envoie (l'essai d'un modèle, ses données d'exemple) ; HORS du bloc,
 * `lint:mail-attachment-by-reference` refuse `pdfBase64` dans une demande,
 * sauf les envoyeurs inscrits en dette datée. Un type qui distinguerait
 * l'appelant n'existe pas : c'est la porte qui tient la frontière.
 */
export type ImmediateMailData<K extends keyof B2bMails> = B2bMails[K] | ByReference<B2bMails[K]>;

/**
 * Les modèles que `send` accepte : ceux dont les données — sous leur forme
 * différée — traversent la boîte d'envoi intactes, et parmi ceux qui joignent
 * un PDF, seulement ceux que {@link OpenedByReference} ouvre. Au 2026-11-06,
 * un seul en reste exclu (`staff.production-dossier`) : il n'a que
 * `sendAndAwaitReceipt`, ses octets en mémoire (S2f).
 */
export type DeferrableMailTemplate = {
  [K in keyof B2bMails]: Every<DefersIntact<B2bMails[K]>> extends true
    ? K
    : K extends OpenedByReference
      ? Every<DefersIntact<ByReference<B2bMails[K]>>> extends true
        ? K
        : never
      : never;
}[keyof B2bMails];

/** Une demande différée : ses pièces jointes y sont des références. */
export interface DeferredMailDemand<K extends DeferrableMailTemplate> extends Omit<
  MailDemand<K>,
  "data"
> {
  readonly data: ByReference<B2bMails[K]>;
}

/**
 * **L'étape « demandée »** — ce que rend `mail.send` (plan
 * `documentation/mail/le-suivi-des-e-mails.md`, T4 ; revue, cas 5) : la
 * demande est écrite dans la transaction de l'appelant, **rien n'est parti**.
 * Elle ne dit ni « envoyé » ni « prévenu » : un champ servi qui la lit
 * s'appelle `mailRequested` (`lint:mail-status-honest`).
 *
 * Le nom `MailDemand` était pris : il désigne le CONTENU d'une demande
 * (modèle, destinataire, données), pas son étape.
 */
export interface MailRequested {
  /** La demande — celle qui existait déjà pour une clé d'idempotence connue. */
  readonly requestId: string;
}

/**
 * **L'étape « acceptée »** — ce que rend `mail.sendAndAwaitReceipt` : Resend
 * a pris l'e-mail, ce qui ne dit pas qu'il est arrivé. `providerId` nul :
 * le mailer tourne à blanc, rien n'est accepté. Se lit par
 * {@link isMailAccepted}, et un champ servi s'appelle `mailAccepted`.
 *
 * L'étape suivante — remise, retardée, rebondie, spam — est `MailDelivery`,
 * le retour du fournisseur, que seul le suivi du bloc connaît (T1,
 * `mail/requests/domain/value-objects/mail-delivery.ts`).
 */
export interface MailAcceptance {
  readonly providerId: string | null;
}

/** Vrai si Resend a accepté l'e-mail — faux à blanc. */
export function isMailAccepted(acceptance: MailAcceptance): boolean {
  return acceptance.providerId !== null;
}

/**
 * **La porte du bloc `mail`** : envoyer un e-mail. Déclarée et implémentée
 * par le bloc ; tout bloc métier l'importe en « port uniquement » (`CLAUDE.md`
 * § 3, colonne `mail`) et l'injecte sous le nom `mail`
 * (`lint:mail-receipt-admitted` le tient).
 *
 * Deux gestes (C2, nommés au § 21 de `plan-service-e-mails.md`) :
 *
 * - `mail.send` — **le défaut**. Durable : la demande s'écrit dans la
 *   transaction de l'appelant, part après l'enregistrement par la boîte
 *   d'envoi, et se relance seule. Une écriture annulée n'envoie rien ; un
 *   service arrêté retarde, ne perd pas.
 * - `mail.sendAndAwaitReceipt` — **l'exception**, réservée à une liste
 *   admise : envoi immédiat, on attend le reçu de Resend. Pour le geste qui
 *   doit lire le résultat à l'écran (`mailSent`), l'essai et la sonde ;
 *   jamais sous une unité de travail.
 *
 * Des méthodes statiques ont été écartées (§ 21) : elles cacheraient la base,
 * l'outbox et le mailer dans un singleton, et les tests n'y injecteraient
 * plus de doublure.
 */
export abstract class Mail {
  /**
   * **Le geste par défaut.** À appeler DANS l'`UnitOfWork` de l'écriture
   * qu'il accompagne : l'e-mail part après l'enregistrement, relancé tant
   * que Resend ne l'a pas accepté. Une seconde demande de même clé ne fait
   * rien.
   *
   * @returns l'étape « demandée » ({@link MailRequested}) — jamais une
   *   acceptation : rien n'est parti au retour de l'appel.
   * @throws {MailRequestOutsideUnitOfWorkError} appelé hors d'une
   *   `UnitOfWork` : la demande serait écrite sans le fait qui la fait partir.
   */
  abstract send<K extends DeferrableMailTemplate>(
    demand: DeferredMailDemand<K>,
  ): Promise<MailRequested>;

  /**
   * **L'exception** : envoi immédiat, reçu de Resend rendu — sans outbox,
   * donc sans relance. Hors du bloc, seuls les appelants admis par
   * `lint:mail-receipt-admitted` y ont droit. Le suivi s'écrit APRÈS l'envoi,
   * dans sa propre écriture ; une demande de même clé déjà envoyée n'est pas
   * renvoyée : son reçu est rendu.
   *
   * @throws {ImmediateMailInsideUnitOfWorkError} sous une `UnitOfWork`.
   * @throws l'erreur du mailer si l'envoi échoue (après l'avoir suivie).
   */
  abstract sendAndAwaitReceipt<K extends keyof B2bMails>(
    demand: MailDemand<K>,
  ): Promise<MailAcceptance>;
}
