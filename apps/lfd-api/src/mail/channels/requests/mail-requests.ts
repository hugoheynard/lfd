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
 * Les modèles que `request` accepte : ceux dont les données traversent la
 * boîte d'envoi intactes. Au 2026-11-06, quatre en sont exclus parce qu'ils
 * joignent un PDF en base64 (`customer.order-placed`, `customer.invoice-issued`,
 * `customer.mandate-to-sign`, `staff.production-dossier`) : ils attendent le
 * passage des PDF au stockage (lot S2) et n'ont que `sendNow` d'ici là.
 */
export type DeferrableMailTemplate = {
  [K in keyof B2bMails]: Every<DefersIntact<B2bMails[K]>> extends true ? K : never;
}[keyof B2bMails];

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
   * @throws {MailRequestOutsideUnitOfWorkError} hors d'une `UnitOfWork`.
   */
  abstract request<K extends DeferrableMailTemplate>(demand: MailDemand<K>): Promise<void>;

  /**
   * Le suivi s'écrit APRÈS l'envoi, dans sa propre écriture. Une demande de
   * même clé déjà envoyée n'est pas renvoyée : son reçu est rendu.
   *
   * @throws {ImmediateMailInsideUnitOfWorkError} sous une `UnitOfWork`.
   * @throws l'erreur du mailer si l'envoi échoue (après l'avoir suivie).
   */
  abstract sendNow<K extends keyof B2bMails>(demand: MailDemand<K>): Promise<MailReceipt>;
}
