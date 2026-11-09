/**
 * **Le canal que `card-payment` DÉCLARE pour les blocs qui possèdent un
 * sujet** (plan M2, §3.3) : une classe abstraite à implémenter par type de
 * sujet, et le jeton qui les range. `appBootstrap/` relie ; aucun bloc métier
 * n'atteint l'intérieur de `card-payment`.
 */
export {
  type CardSubject,
  type SubjectClaim,
  type SubjectDescription,
  type SubjectPaidOutcome,
  type SubjectPaymentRole,
  type SubjectReference,
  type SubjectSettledState,
  SubjectSettlement,
} from "./subject-settlement.js";
export { RegisteredSubjectSettlements, SubjectSettlements } from "./subject-settlements.js";
