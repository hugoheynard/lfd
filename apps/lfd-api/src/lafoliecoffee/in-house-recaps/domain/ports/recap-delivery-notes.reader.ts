import type { RecapSourceNote } from "../services/recap-aggregation.js";
import type { RecapWindow } from "../value-objects/recap-month.js";

/**
 * **Les BL qu'un récapitulatif couvre** (`restaurants-maison.md`) :
 * les BL COURANTS (jamais une version figée) au statut `handed_over`, dont
 * `handed_over_at` tombe dans `[from, to[`, d'une commande interne
 * (`offer_nature = 'in_house'`) dont le payeur est
 * `billed_company_id ?? company_id`, et qui ne sont dans aucun récapitulatif
 * non remplacé.
 */
export abstract class RecapDeliveryNotesReader {
  /** Les payeurs qui ont au moins un tel BL dans la fenêtre. */
  abstract payersWithUncoveredNotes(window: RecapWindow): Promise<readonly string[]>;

  /**
   * Les BL d'un payeur dans la fenêtre. `releasing` : le récapitulatif qu'un
   * rectificatif va remplacer — ses BL comptent comme libres.
   */
  abstract uncoveredNotesOf(
    payerId: string,
    window: RecapWindow,
    releasing: string | null,
  ): Promise<readonly RecapSourceNote[]>;
}
