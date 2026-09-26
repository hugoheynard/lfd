/** De quoi nommer à l'équipe la commande dont le règlement est mort. */
export interface FailedSettlementSubject {
  readonly orderNumber: string;
  /** Figée à la passation ; `null` = commande d'avant la distinction. */
  readonly clientele: "pro" | "public" | null;
  /** L'enseigne, à défaut la raison sociale ; `null` sans société. */
  readonly companyName: string | null;
}

/**
 * Port de **lecture** de la cloche des règlements morts : la seule chose
 * qu'elle a besoin de savoir d'une commande. Étroit par construction (ISP) —
 * `OrderReader` rend la vue entière d'une commande, et ne dit pas sa clientèle.
 */
export abstract class FailedSettlementReader {
  abstract subjectOf(orderId: string): Promise<FailedSettlementSubject | null>;
}
