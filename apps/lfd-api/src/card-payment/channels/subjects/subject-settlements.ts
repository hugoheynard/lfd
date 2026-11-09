import { DuplicateSubjectSettlementError } from "../../domain/errors/card-payment-errors.js";
import type { SubjectSettlement } from "./subject-settlement.js";

/**
 * **Les implémenteurs du canal retour, un par type de sujet** (plan M2,
 * §3.3) — le jeton que `appBootstrap/` remplit (lot P0.c2) ; `card-payment`
 * le lit sans savoir qui l'a rempli.
 */
export abstract class SubjectSettlements {
  /** L'implémenteur de ce type, ou `null` : aucun bloc n'en répond. */
  abstract forType(subjectType: string): SubjectSettlement | null;

  /** Tous les implémenteurs, pour une revendication ou un rattrapage. */
  abstract all(): readonly SubjectSettlement[];
}

/**
 * La forme que la racine de composition instancie : une liste, refusée si
 * deux implémenteurs servent le même type — lequel croirait-on ?
 */
export class RegisteredSubjectSettlements extends SubjectSettlements {
  private readonly byType: ReadonlyMap<string, SubjectSettlement>;

  /** @throws {DuplicateSubjectSettlementError} deux implémenteurs pour un type. */
  constructor(settlements: readonly SubjectSettlement[]) {
    super();
    const byType = new Map<string, SubjectSettlement>();
    for (const settlement of settlements) {
      if (byType.has(settlement.subjectType)) {
        throw new DuplicateSubjectSettlementError(settlement.subjectType);
      }
      byType.set(settlement.subjectType, settlement);
    }
    this.byType = byType;
  }

  forType(subjectType: string): SubjectSettlement | null {
    return this.byType.get(subjectType) ?? null;
  }

  all(): readonly SubjectSettlement[] {
    return [...this.byType.values()];
  }
}
