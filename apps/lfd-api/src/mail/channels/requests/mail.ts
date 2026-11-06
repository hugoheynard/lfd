import type { MailReceipt } from "@lfd/mailer";

import type { B2bMails } from "../templates/b2b-mails.js";

/**
 * La marque au nom de laquelle un e-mail part. La Folie Coffee seule
 * aujourd'hui ; le bloc refuse une marque qu'il ne connaît pas.
 */
export type MailBrandName = "lfc";

/**
 * **Une demande d'e-mail** (plan `documentation/editeur-de-contenu/plan-service-e-mails.md`, C2) :
 * le modèle (clé du registre `B2bMails`), ses données — vérifiées par le
 * compilateur, comme `mailer.send()` —, le destinataire, la marque et une clé
 * d'idempotence.
 *
 * La langue n'est pas un second champ : elle est lue dans les données du
 * modèle (`locale`), là où le gabarit la lit déjà.
 */
export interface MailDemand<K extends keyof B2bMails> {
  readonly template: K;
  readonly to: string;
  readonly data: B2bMails[K];
  readonly brand: MailBrandName;
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
 * facture) ; le dossier du fournil n'y passe pas : il part en `sendAndAwaitReceipt`
 * (lot S2f).
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
 * Au 2026-11-06 : le bon joint à la confirmation de commande (lot S2a) et la
 * facture Factur-X, rangée au même stockage sous `Invoice.documentKey` (lot
 * S2d). Le dossier du fournil RESTE fermé (S2f). Le mandat RESTE fermé :
 * son seul envoyeur passe par `sendAndAwaitReceipt` (lot S2e, le fait lit le reçu).
 */
type OpenedByReference = "customer.order-placed" | "customer.invoice-issued";

/**
 * Les modèles que `send` accepte : ceux dont les données — sous leur forme
 * différée — traversent la boîte d'envoi intactes, et parmi ceux qui joignent
 * un PDF, seulement ceux que {@link OpenedByReference} ouvre. Au 2026-11-06,
 * deux en restent exclus (`customer.mandate-to-sign`,
 * `staff.production-dossier`) : ils n'ont que
 * `sendAndAwaitReceipt` — le mandat (S2e) et le dossier (S2f) par choix : leur appelant lit le reçu.
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
   * @returns l'identifiant de la demande — celle qui existait déjà pour une
   *   clé d'idempotence connue —, pour qu'un bloc puisse suivre son envoi.
   * @throws {MailRequestOutsideUnitOfWorkError} appelé hors d'une
   *   `UnitOfWork` : la demande serait écrite sans le fait qui la fait partir.
   */
  abstract send<K extends DeferrableMailTemplate>(demand: DeferredMailDemand<K>): Promise<string>;

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
  ): Promise<MailReceipt>;
}
