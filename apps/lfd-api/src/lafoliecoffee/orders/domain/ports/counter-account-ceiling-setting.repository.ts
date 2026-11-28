import type { CounterAccountCeilingSetting } from "../value-objects/counter-account-ceiling-setting.js";

/** Port d'**écriture** du plafond des comptes du comptoir : une ligne, remplacée à chaque geste. */
export abstract class CounterAccountCeilingSettingRepository {
  abstract put(setting: CounterAccountCeilingSetting): Promise<void>;
}
