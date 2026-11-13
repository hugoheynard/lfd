import type {
  CardRefundForm,
  CardRefundNature,
  CardRefundRequestState,
  CardRefundSource,
  CardRefundStatus,
} from "../../domain/value-objects/card-refund-values.js";
import type { CardSubject, SubjectPaymentRole, SubjectSettledState } from "../subjects/index.js";

export type {
  CardRefundForm,
  CardRefundNature,
  CardRefundRequestState,
  CardRefundSource,
  CardRefundStatus,
};

/** Un paiement d'un sujet, tel que la position le rend. */
export interface CardPaymentLine {
  readonly paymentId: string;
  readonly account: string;
  readonly providerRef: string | null;
  readonly role: SubjectPaymentRole;
  readonly state: SubjectSettledState;
  readonly amountCents: number;
  readonly paidAt: Date | null;
}

/**
 * **L'argent rendu d'un sujet** (plan M2, §3.3) — ce que le canal retour
 * reçoit avec chaque issue d'un remboursement (`onRefundOutcome`), recalculé
 * APRÈS l'écriture, et le socle de la position complète.
 *
 * Une seule arithmétique : `refundedCents` se lit ici, jamais recalculé
 * depuis `refundsOf` (§3.3).
 */
export interface SubjectRefundPosition {
  readonly subject: CardSubject;
  /** **Encaissé** : `Σ montant` des paiements `paid`, en centimes. */
  readonly chargedCents: number;
  /** **Remboursé**, toute nature : `Σ` des remboursements `succeeded`. */
  readonly refundedCents: number;
  /**
   * Le remboursé par nature (§2) ; `unattributed` : un `re_…` fait hors de la
   * plateforme, sans demande — il compte au remboursé, sans nature.
   */
  readonly refundedByNature: Readonly<Record<CardRefundNature | "unattributed", number>>;
  /**
   * L'argent **en vol** (en attente de la banque) par forme de la demande qui
   * l'a émis ; `unattributed` sans demande. L'annulation ne lit que ce qui
   * n'est pas une `amount` (§6.2, `refund_in_flight`).
   */
  readonly inFlightByForm: Readonly<Record<CardRefundForm | "unattributed", number>>;
}

/** Une demande non terminale (`to_issue`, `issued`, `stopped`) d'un sujet. */
export interface OpenCardRefundRequest {
  readonly requestId: string;
  readonly paymentId: string;
  readonly form: CardRefundForm;
  readonly nature: CardRefundNature;
  readonly state: CardRefundRequestState;
}

/**
 * **La position carte d'un sujet** (plan M2, §3.3) : ses paiements, l'argent
 * encaissé et rendu, ses demandes en cours. Un sujet sans paiement est rendu
 * avec des listes vides : c'est au commerce d'appeler `adopt` (§4.6).
 */
export interface CardSettlementPosition extends SubjectRefundPosition {
  /** Du plus ancien au plus récent. */
  readonly payments: readonly CardPaymentLine[];
  /** Les demandes non terminales, de la plus ancienne à la plus récente. */
  readonly openRequests: readonly OpenCardRefundRequest[];
}

/** Un remboursement réussi — ce que l'avoir lit (`RefundReconciler`). */
export interface SucceededCardRefund {
  readonly refundId: string;
  readonly paymentId: string;
  /**
   * La demande qui l'a émis — `null` pour un `re_…` fait hors de la
   * plateforme. Une demande encore ouverte peut déjà porter un réussi (une
   * génération précédente arrivée tard, une `amount` émise pour un autre
   * montant puis arrêtée) : c'est ce qui permet de ne pas compter deux fois
   * le même euro (plan `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.2).
   */
  readonly requestId: string | null;
  readonly amountCents: number;
  readonly nature: CardRefundNature | null;
  readonly source: CardRefundSource;
}

/** Un remboursement, quel que soit son statut — la carte des remboursements du back-office. */
export interface CardRefundView {
  readonly refundId: string;
  readonly paymentId: string;
  readonly source: CardRefundSource;
  readonly status: CardRefundStatus;
  readonly amountCents: number;
  readonly currency: string;
  readonly nature: CardRefundNature | null;
  /** L'instant du prestataire pour un `provider`, celui du geste pour un `manual`. */
  readonly refundedAt: Date;
  readonly recordedAt: Date;
}

/** Une demande de remboursement, terminées comprises — le bandeau du back-office (§5.3). */
export interface CardRefundRequestView {
  readonly id: string;
  readonly paymentId: string;
  readonly form: CardRefundForm;
  readonly nature: CardRefundNature;
  readonly state: CardRefundRequestState;
  readonly reason: string;
  readonly announcedCents: number;
  readonly issuedCents: number | null;
  readonly requestedAt: Date;
  readonly issuedAt: Date | null;
  readonly attempts: number;
  readonly generation: number;
  /** Le code BRUT du dernier échec : c'est le sujet qui en fait la phrase. */
  readonly lastFailure: string | null;
  /** Toute la règle de « Relancer » (§3.4), bail compris — invisible au front. */
  readonly retryable: boolean;
}

/** Les remboursements d'un sujet. */
export interface SubjectCardRefunds {
  readonly subject: CardSubject;
  /** Triés par `recordedAt` — l'ordre de lecture d'aujourd'hui. */
  readonly refunds: readonly CardRefundView[];
}

/** Les demandes d'un sujet. */
export interface SubjectCardRefundRequests {
  readonly subject: CardSubject;
  /** De la plus ancienne à la plus récente. */
  readonly requests: readonly CardRefundRequestView[];
}

/**
 * **Lire l'argent carte de sujets, par lot** (plan M2, §3.3) — déclaré ET
 * implémenté par `card-payment`. 🔴 N'écrit JAMAIS (§4.6) : un sujet sans
 * ligne y est rendu tel quel.
 */
export abstract class CardSettlementReader {
  /** Une position par sujet demandé, dans l'ordre de la demande. */
  abstract positionOf(subjects: readonly CardSubject[]): Promise<readonly CardSettlementPosition[]>;

  /**
   * Les remboursements réussis d'un sujet, **triés par `recordedAt, id`** —
   * l'ordre que `RefundReconciler` suppose pour ventiler le dernier avoir au
   * reste exact.
   */
  abstract succeededRefundsOf(subject: CardSubject): Promise<readonly SucceededCardRefund[]>;

  /** Tous les remboursements de chaque sujet, par lot, dans l'ordre de la demande. */
  abstract refundsOf(subjects: readonly CardSubject[]): Promise<readonly SubjectCardRefunds[]>;

  /** Toutes les demandes de chaque sujet, par lot, dans l'ordre de la demande. */
  abstract refundRequestsOf(
    subjects: readonly CardSubject[],
  ): Promise<readonly SubjectCardRefundRequests[]>;

  /**
   * **Ce qui reste à rendre sur UN paiement** (plan S2, R11) : encaissé −
   * remboursé − ce que les demandes non terminales annoncent déjà — le reste
   * même que `CardRefunds.requestAmount` accepterait. `0` pour un paiement
   * non encaissé ou inconnu. Lu sous le verrou du sujet que l'appelant tient :
   * il ne baisse pas avant la demande qui suit.
   */
  abstract remainderOf(paymentId: string): Promise<number>;
}
