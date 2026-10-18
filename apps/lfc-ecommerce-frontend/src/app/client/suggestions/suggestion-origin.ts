import type { CartSuggestionReason } from '@lfd/contracts';

import type { AudienceOrigin } from '../audience/product-audience-queue';

/**
 * **D'où vient une suggestion, pour ses compteurs** : le décidé compte sous
 * `staff`, à l'id de sa règle (`suggestions-du-staff.md` §8.1) ; le calculé
 * sous `data`, à son genre (`bought_with`) — une ligne par source et par
 * genre, jamais par client.
 */
export function suggestionOrigin(reason: CartSuggestionReason): AudienceOrigin {
  return reason.source === 'staff'
    ? { source: 'staff', placement: reason.ruleId }
    : { source: 'data', placement: reason.kind };
}
