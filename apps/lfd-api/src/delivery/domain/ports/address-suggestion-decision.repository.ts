import type { AddressSuggestionDecision } from "../entities/address-suggestion-decision.js";

/**
 * Port d'**écriture** des décisions sur les suggestions de correction du
 * carnet (§6). Un seul geste : ajouter — une décision ne se réécrit pas.
 */
export abstract class AddressSuggestionDecisionRepository {
  abstract record(decision: AddressSuggestionDecision): Promise<void>;
}
