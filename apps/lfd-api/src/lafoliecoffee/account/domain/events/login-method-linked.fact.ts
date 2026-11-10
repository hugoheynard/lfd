import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/** Nom STABLE du fait, clé de routage vers `@DurableHandler`. */
export const ACCOUNT_LOGIN_METHOD_LINKED = "account.login_method_linked";

/**
 * **Une méthode de connexion de plus ouvre le compte** — fait DURABLE, écrit
 * par `LinkLoginMethodHandler` dans la même unité de travail que la trace du
 * rattachement (lot E5, 2026-10-10,
 * `documentation/journalisation/plan-evenements-durables.md` §7 quater).
 *
 * 🔴 L'alerte qu'il déclenche est la SEULE si la preuve du rattachement était
 * un jour contournée : la perdre sur un redémarrage, c'est laisser une porte
 * de plus ouverte sans que le titulaire le sache.
 *
 * ## Le contrat, et pourquoi pas le `sub` secondaire
 *
 * `{ userId, provider, linkId }`. L'identité chez le tiers n'entre ni dans la
 * charge ni dans la clé : un identifiant chez un tiers ne se range pas chez
 * nous hors de ses lecteurs admis (`lint:auth0-id-readers`), et la boîte
 * d'envoi est une table comme une autre. `linkId` est tiré une fois par
 * rattachement (`IdGenerator`) : rattacher, détacher puis rattacher à nouveau
 * le même fournisseur est un SECOND geste, qui doit alerter — une clé
 * `<userId>:<provider>` le dédoublonnerait en silence.
 *
 * Clé : `account.login_method_linked:<userId>:<provider>:<linkId>`.
 */
export class LoginMethodLinkedFact implements DurableEvent {
  constructor(
    readonly userId: string,
    readonly provider: string,
    readonly linkId: string,
  ) {}

  durableFact(): DurableFact {
    return {
      type: ACCOUNT_LOGIN_METHOD_LINKED,
      key: `${ACCOUNT_LOGIN_METHOD_LINKED}:${this.userId}:${this.provider}:${this.linkId}`,
      payload: { userId: this.userId, provider: this.provider, linkId: this.linkId },
    };
  }

  /** @throws {LoginMethodLinkedPayloadError} payload hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): LoginMethodLinkedFact {
    const userId = payload["userId"];
    const provider = payload["provider"];
    const linkId = payload["linkId"];
    if (!isFilled(userId) || !isFilled(provider) || !isFilled(linkId)) {
      throw new LoginMethodLinkedPayloadError();
    }
    return new LoginMethodLinkedFact(userId, provider, linkId);
  }
}

function isFilled(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Un fait « méthode rattachée » illisible : l'alerte n'est pas partie. */
export class LoginMethodLinkedPayloadError extends TechnicalError {
  constructor() {
    super(
      "account_login_method_linked.payload_invalid",
      "Le fait « méthode de connexion rattachée » reçu est illisible (compte, fournisseur ou " +
        "geste manquant) : le courriel d'alerte au titulaire n'est pas parti. Le message reste " +
        "dans la boîte d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
