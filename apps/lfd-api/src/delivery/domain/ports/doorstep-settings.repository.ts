import type { DoorstepRule } from "@lfd/contracts";

import type { DeliveryAuthor } from "../entities/departure-choice.js";

/** Port d'**écriture** du réglage global à la porte : une ligne, remplacée, auteur figé. */
export abstract class DoorstepSettingsRepository {
  abstract put(rule: DoorstepRule, at: Date, author: DeliveryAuthor): Promise<void>;
}
