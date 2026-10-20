import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Les gestes d'un site sur son carnet de livraison, écrits en DURABLE
 * (`plan-notifications-sous-comptes.md`, N4b). Toute charge porte
 * `siteCompanyId` : la purge du scénario de dev s'en sert pour les effacer. Les noms sont ceux du journal
 * (`packages/contracts/src/journal-facts/accounts.ts`) : un même nom désigne le
 * même geste dans les deux registres.
 */
export const DELIVERY_ADDRESS_ADDED = "company.delivery_address_added";
export const DELIVERY_ADDRESS_UPDATED = "company.delivery_address_updated";
export const DELIVERY_ADDRESS_REMOVED = "company.delivery_address_removed";
export const DEFAULT_DELIVERY_SET = "company.default_delivery_set";

/** Les gestes d'un site sur ses contacts (N4c) — mêmes noms qu'au journal. */
export const CONTACT_ADDED = "company.contact_added";
export const CONTACT_UPDATED = "company.contact_updated";
export const CONTACT_REMOVED = "company.contact_removed";
export const PRIMARY_CONTACT_CHANGED = "company.primary_contact_changed";

/**
 * Les gestes d'un site sur son RIB et son mandat (N4d) — mêmes noms qu'au
 * journal : `company.bank_account_changed`, et `payment_mandate.proof_attached`
 * pour la preuve (le plan v2 le croyait neuf ; il existait au journal, vérifié
 * le 2026-10-20 dans `packages/contracts/src/journal-facts/accounting.ts`).
 */
export const BANK_ACCOUNT_CHANGED = "company.bank_account_changed";
export const MANDATE_PROOF_ATTACHED = "payment_mandate.proof_attached";

/** Un geste de site écrit en durable. */
export type SiteGestureType =
  | typeof DELIVERY_ADDRESS_ADDED
  | typeof DELIVERY_ADDRESS_UPDATED
  | typeof DELIVERY_ADDRESS_REMOVED
  | typeof DEFAULT_DELIVERY_SET
  | typeof CONTACT_ADDED
  | typeof CONTACT_UPDATED
  | typeof CONTACT_REMOVED
  | typeof PRIMARY_CONTACT_CHANGED
  | typeof BANK_ACCOUNT_CHANGED
  | typeof MANDATE_PROOF_ATTACHED;

/** Qui a fait le geste : un client nommé par son id, ou l'équipe. */
export type GestureActor =
  { readonly kind: "customer"; readonly userId: string } | { readonly kind: "team" };

/**
 * Ce qu'un geste de site FIGE au moment où il est validé : le site, son nom,
 * son principal lu sous le verrou de sa ligne, l'auteur. Jamais le contenu
 * du geste (ni adresse, ni contact) : un abonné n'a pas à le connaître.
 */
export interface SiteGestureStamp {
  readonly siteCompanyId: string;
  readonly siteName: string;
  readonly principalCompanyId: string | null;
  /** Le client auteur ; `null` quand l'équipe a agi. */
  readonly authorUserId: string | null;
  readonly byTeam: boolean;
}

/**
 * **Un site a fait un geste sur son compte** — écrit par `account/` dans la
 * transaction de l'écriture. Le contexte ne sait pas qui l'écoute.
 *
 * Clé : `<type>:<gestureId>`, un `gestureId` tiré par geste — dix
 * modifications de la même adresse font dix faits (décision de Hugo,
 * 2026-10-20 : un mail par geste). Une requête rejouée fait un second geste.
 */
export class SiteGestureFact implements DurableEvent {
  constructor(
    readonly type: SiteGestureType,
    readonly gestureId: string,
    /** L'objet du geste (l'adresse, le contact ; le site pour le contact principal) — un identifiant, jamais son contenu. */
    readonly subjectId: string,
    readonly stamp: SiteGestureStamp,
  ) {}

  durableFact(): DurableFact {
    return {
      type: this.type,
      key: `${this.type}:${this.gestureId}`,
      payload: { gestureId: this.gestureId, subjectId: this.subjectId, ...this.stamp },
    };
  }

  /** @throws {SiteGesturePayloadError} charge hors forme — faute d'émetteur. */
  static stampOf(payload: Readonly<Record<string, unknown>>): SiteGestureStamp {
    const { siteCompanyId, siteName, principalCompanyId, authorUserId, byTeam } = payload;
    if (
      !isText(siteCompanyId) ||
      !isText(siteName) ||
      !isTextOrNull(principalCompanyId) ||
      !isTextOrNull(authorUserId) ||
      typeof byTeam !== "boolean"
    ) {
      throw new SiteGesturePayloadError();
    }
    return { siteCompanyId, siteName, principalCompanyId, authorUserId, byTeam };
  }
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isTextOrNull(value: unknown): value is string | null {
  return value === null || isText(value);
}

/** Un fait de geste de site illisible : personne n'est prévenu, le message reste visible. */
export class SiteGesturePayloadError extends TechnicalError {
  constructor() {
    super(
      "site_gesture.payload_invalid",
      "Un fait « geste d'un site » est illisible : son principal n'a pas été prévenu. Le geste " +
        "lui-même est bien enregistré. Le message reste dans la boîte d'envoi ; corriger " +
        "l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
