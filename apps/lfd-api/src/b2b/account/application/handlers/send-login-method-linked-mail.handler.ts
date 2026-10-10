import { Inject, Injectable } from "@nestjs/common";

import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  ACCOUNT_LOGIN_METHOD_LINKED,
  LoginMethodLinkedFact,
} from "../../domain/events/login-method-linked.fact.js";
import { UserProfileRepository } from "../../domain/ports/user-profile.repository.js";

/**
 * Les mots de l'écran pour une méthode de connexion. Un fournisseur inconnu
 * garde son nom technique : mieux vaut un mot brut qu'un mot faux, et la liste
 * s'allonge d'une ligne quand on ouvre une connexion de plus.
 */
const METHOD_LABELS: Readonly<Record<string, string>> = {
  "google-oauth2": "Google",
  facebook: "Facebook",
  auth0: "par mot de passe",
};

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const SEND_LOGIN_METHOD_LINKED_MAIL = "account.send-login-method-linked-mail";

/**
 * **« Une connexion Google a été ajoutée à votre compte »** — à l'adresse du
 * compte, après chaque rattachement.
 *
 * 🔴 C'est la **seule alerte** si la preuve exigée au rattachement était un
 * jour contournée : rien d'autre ne dirait à quelqu'un qu'une porte de plus
 * ouvre chez lui (plan `plan-rattachement-depuis-le-profil.md`, R7). Il part
 * donc aussi quand le geste est parfaitement normal.
 *
 * Hors de la requête, comme tous les courriels du dépôt : le rattachement est
 * déjà fait chez le fournisseur quand on arrive ici, et un hoquet du mailer ne
 * doit pas faire échouer une écriture qu'on ne saurait pas annuler.
 *
 * ## Durable depuis le 2026-10-10 (lot E5)
 *
 * Il écoutait `LoginMethodLinkedEvent` en mémoire : un redémarrage entre le
 * rattachement et le saut perdait l'alerte — c'est-à-dire le seul signal de
 * sécurité de ce geste. Il lit désormais `account.login_method_linked`, écrit
 * par `LinkLoginMethodHandler` dans l'unité de travail de sa trace
 * (`documentation/journalisation/plan-evenements-durables.md`, §7 quater).
 */
@Injectable()
@DurableHandler({ type: ACCOUNT_LOGIN_METHOD_LINKED, subscriber: SEND_LOGIN_METHOD_LINKED_MAIL })
export class SendLoginMethodLinkedMail implements DurableSubscriber {
  constructor(
    private readonly profiles: UserProfileRepository,
    @Inject(MAILER) private readonly mailer: B2bMailer,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = LoginMethodLinkedFact.fromPayload(delivery.payload);
    const profile = await this.profiles.findById(event.userId);
    // Un profil disparu entre le geste et l'envoi : rien à alerter, et rien à
    // faire échouer. Le fait, lui, est déjà au journal.
    if (profile === null) {
      return;
    }
    await this.mailer.send({
      to: profile.email,
      template: "customer.login-method-linked",
      data: {
        firstName: profile.firstName,
        methodLabel: METHOD_LABELS[event.provider] ?? event.provider,
      },
      // Clé **déterministe** par compte et par méthode : un fait rejoué par la
      // boîte d'envoi ne fait pas partir un second message. Rattacher à
      // nouveau la même méthode après l'avoir retirée dans la même journée est
      // le seul cas qu'elle dédoublonne à tort — et il n'apprend rien de neuf
      // à qui vient de le faire.
      idempotencyKey: `login_method.linked:${event.userId}:${event.provider}`,
    });
  }
}
