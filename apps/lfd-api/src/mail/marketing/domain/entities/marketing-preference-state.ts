import type { MailBrandCode } from "../../../requests/domain/value-objects/mail-brand.js";
import type {
  ConsentOrigin,
  ConsentPlace,
  MarketingStatus,
  UnsubscribeSource,
} from "../value-objects/marketing-vocabulary.js";

/**
 * **La preuve d'un accord** (plan de désinscription, règle 18) : la version
 * et la langue du texte de la case, le lieu, et la référence opaque de
 * l'acte (commande, compte) — ce que la CNIL demande de pouvoir montrer.
 */
export interface ConsentProof {
  readonly textVersion: string;
  readonly locale: string;
  readonly place: ConsentPlace;
  /** `null` : un lieu sans acte (le pied de page de la boutique). */
  readonly ref: string | null;
}

/** L'état complet, tel que l'adaptateur le range et le relit. */
export interface MarketingPreferenceSnapshot {
  readonly id: string;
  readonly space: MailBrandCode;
  /** `null` : effacée (seulement sur une désinscription, règle 23). */
  readonly recipientKey: string | null;
  readonly print: string;
  readonly status: MarketingStatus;
  /** `null` : aucun accord n'a jamais été recueilli (désinscrit d'emblée). */
  readonly origin: ConsentOrigin | null;
  /** `null` : aucun accord n'a jamais été recueilli. */
  readonly proof: ConsentProof | null;
  readonly requestedAt: Date | null;
  readonly confirmedAt: Date | null;
  readonly unsubscribedAt: Date | null;
  readonly unsubscribedSource: UnsubscribeSource | null;
}

/** Ce qu'une désinscription retient : l'instant et ce qui l'a faite. */
export interface UnsubscribeAct {
  readonly at: Date;
  readonly source: UnsubscribeSource;
}

/** Ce qu'il faut pour recueillir un accord (C1, C2) — posé dès U2, le registre étant complet. */
export interface ConsentDraft {
  readonly proof: ConsentProof;
  readonly origin: ConsentOrigin;
  readonly at: Date;
}

/**
 * Ce que l'effacement laisse (règle 23) : `forget` — la ligne part ;
 * `print-kept` — la clé en clair part, l'empreinte reste.
 */
export type MarketingErasure = "forget" | "print-kept";
