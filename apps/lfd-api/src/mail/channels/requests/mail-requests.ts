import type { MailReceipt } from "@lfd/mailer";

import type { B2bMails } from "../../../platform/mailer/mail-templates.js";

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
 * attachées à un client est ouvert au 2026-11-06 (le bon de commande) ; celui
 * du fournil s'ouvrira avec le dossier du jour.
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
 * Les modèles à PDF ouverts à `request`, leur pièce passant par référence.
 * Au 2026-11-06 : le bon joint à la confirmation de commande (lot S2a). La
 * facture, le mandat et le dossier du fournil s'ouvriront avec leur bloc.
 */
type OpenedByReference = "customer.order-placed";

/**
 * Les modèles que `request` accepte : ceux dont les données — sous leur forme
 * différée — traversent la boîte d'envoi intactes, et parmi ceux qui joignent
 * un PDF, seulement ceux que {@link OpenedByReference} ouvre. Au 2026-11-06,
 * trois en restent exclus (`customer.invoice-issued`,
 * `customer.mandate-to-sign`, `staff.production-dossier`) : ils n'ont que
 * `sendNow` d'ici le passage de leur bloc.
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
 * **La porte du bloc `mail`** : demander un e-mail. Déclarée et implémentée
 * par le bloc ; tout bloc métier l'importe en « port uniquement » (`CLAUDE.md`
 * § 3, colonne `mail`).
 *
 * Deux gestes (C2) :
 *
 * - `request` — **le défaut**. La demande s'écrit dans la transaction de
 *   l'appelant et part après la validation, par la boîte d'envoi. Une
 *   écriture annulée n'envoie rien ; un service arrêté retarde, ne perd pas.
 * - `sendNow` — pour le geste qui doit lire le résultat à l'écran (`mailSent`),
 *   l'essai et la sonde. Envoi immédiat, reçu rendu ; jamais sous une unité
 *   de travail.
 */
export abstract class MailRequests {
  /**
   * @returns l'identifiant de la demande — celle qui existait déjà pour une
   *   clé d'idempotence connue —, pour qu'un bloc puisse suivre son envoi.
   * @throws {MailRequestOutsideUnitOfWorkError} hors d'une `UnitOfWork`.
   */
  abstract request<K extends DeferrableMailTemplate>(
    demand: DeferredMailDemand<K>,
  ): Promise<string>;

  /**
   * Le suivi s'écrit APRÈS l'envoi, dans sa propre écriture. Une demande de
   * même clé déjà envoyée n'est pas renvoyée : son reçu est rendu.
   *
   * @throws {ImmediateMailInsideUnitOfWorkError} sous une `UnitOfWork`.
   * @throws l'erreur du mailer si l'envoi échoue (après l'avoir suivie).
   */
  abstract sendNow<K extends keyof B2bMails>(demand: MailDemand<K>): Promise<MailReceipt>;
}
