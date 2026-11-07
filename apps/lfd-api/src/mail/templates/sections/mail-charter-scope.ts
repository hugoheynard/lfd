import { AsyncLocalStorage } from "node:async_hooks";

import type { MailRenderCharter } from "@lfd/mailer";

/**
 * **La charte que le rendu en cours applique** (plan
 * `plan-editeur-par-blocs.md`, § 25, C1) — déjà résolue pour l'e-mail et la
 * langue de l'envoi : la charte publiée de son espace, ou `null` pour la
 * charte de départ (le rendu d'avant, à l'octet).
 *
 * Un périmètre à part de la mise en page (`withMailLayout`) : un essai ou
 * un aperçu qui choisit ses phrases et son document reçoit quand même la
 * charte en service, et l'aperçu de la charte pose la sienne.
 */
const charterScope = new AsyncLocalStorage<MailRenderCharter | null>();

/** Rend `run` sous cette charte ; `null` : la charte de départ. */
export function withMailCharter<T>(charter: MailRenderCharter | null, run: () => T): T {
  return charterScope.run(charter, run);
}

/**
 * La charte du périmètre ouvert : `undefined` si aucun n'est ouvert (rien
 * n'a été décidé — l'envoi lira la publiée), `null` pour la charte de départ.
 */
export function activeMailCharter(): MailRenderCharter | null | undefined {
  return charterScope.getStore();
}
