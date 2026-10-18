import type { StaffSuggestionAudience, StaffSuggestionPlacement } from "@lfd/contracts";

import type { SuggestionPeriod } from "../value-objects/suggestion-period.js";
import type {
  SuggestionPhrase,
  SuggestionPhraseInput,
} from "../value-objects/suggestion-phrase.js";
import type {
  SuggestionTrigger,
  SuggestionTriggerInput,
} from "../value-objects/suggestion-trigger.js";

/** Qui a écrit, et quand — un `StaffUser.id`, ou `null` hors requête. */
export interface WriteStamp {
  readonly by: string | null;
  readonly at: Date;
}

/** Ce que le staff pose : une règle entière, à juger. Une réécriture remplace tout. */
export interface StaffSuggestionRuleInput {
  readonly trigger: SuggestionTriggerInput;
  readonly suggestedSkus: readonly string[];
  readonly placement: string;
  readonly audience: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly phrase: SuggestionPhraseInput | null;
  readonly priority: number;
}

/** Le corps d'une règle, jugé : tout ce qu'une réécriture peut changer. */
export interface StaffSuggestionRuleBody {
  readonly trigger: SuggestionTrigger;
  readonly suggestedSkus: readonly string[];
  readonly placement: StaffSuggestionPlacement;
  readonly audience: StaffSuggestionAudience;
  readonly period: SuggestionPeriod;
  readonly phrase: SuggestionPhrase | null;
  readonly priority: number;
}

/** L'état d'une règle, tel qu'on le lit et qu'on l'écrit. */
export interface StaffSuggestionRuleSnapshot extends StaffSuggestionRuleBody {
  readonly id: string;
  readonly active: boolean;
  readonly created: WriteStamp;
  readonly lastWrite: WriteStamp;
  readonly archivedAt: Date | null;
}

/** Une ligne relue : les valeurs brutes, que `reconstitute` rejuge. */
export interface StaffSuggestionRuleRecord extends StaffSuggestionRuleInput {
  readonly id: string;
  readonly active: boolean;
  readonly created: WriteStamp;
  readonly lastWrite: WriteStamp;
  readonly archivedAt: Date | null;
}
