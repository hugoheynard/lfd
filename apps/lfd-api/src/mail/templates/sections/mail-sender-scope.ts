import { AsyncLocalStorage } from "node:async_hooks";

import type { MailSenderIdentity } from "@lfd/mail-blocks";

/**
 * **L'identité d'envoi que l'envoi en cours prend**, quand l'appelant l'a
 * choisie (plan `plan-editeur-par-blocs.md`, § 25, C3) : l'essai d'une
 * identité avant son enregistrement, et la sonde de déploiement qui éprouve
 * celle de chaque espace. Sans périmètre ouvert, l'envoi prend l'identité
 * rangée de l'espace du modèle, sinon celle de la configuration.
 */
const senderScope = new AsyncLocalStorage<MailSenderIdentity>();

/** Envoie `run` sous cette identité. */
export function withMailSender<T>(identity: MailSenderIdentity, run: () => T): T {
  return senderScope.run(identity, run);
}

/** L'identité du périmètre ouvert ; `undefined` si aucun ne l'est. */
export function activeMailSender(): MailSenderIdentity | undefined {
  return senderScope.getStore();
}
