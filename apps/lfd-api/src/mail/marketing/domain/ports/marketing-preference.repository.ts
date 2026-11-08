import type { MailBrandCode } from "../../../requests/domain/value-objects/mail-brand.js";
import type { MarketingPreference } from "../entities/marketing-preference.js";

/**
 * Port d'ÉCRITURE du registre de préférence marketing (plan de
 * désinscription, U2). On cherche par EMPREINTE, jamais par clé en clair :
 * une ligne effacée n'a plus que son empreinte, et elle doit protéger
 * quand même.
 */
export abstract class MarketingPreferenceRepository {
  /** La ligne de cet espace pour cette empreinte ; `null` : jamais demandé. */
  abstract load(space: MailBrandCode, print: string): Promise<MarketingPreference | null>;

  /** Toutes les lignes de cette empreinte, tous espaces — « tout le groupe », l'effacement. */
  abstract loadAll(print: string): Promise<readonly MarketingPreference[]>;

  /**
   * Range la ligne — créée ou mise à jour, sur `(space, print)` : deux
   * désinscriptions simultanées d'une adresse inconnue n'en font qu'une.
   */
  abstract save(preference: MarketingPreference): Promise<void>;

  /**
   * Range une ligne qui a CHANGÉ D'ADRESSE (règle 24,
   * {@link MarketingPreference.relocate}) : son couple `(space, print)` a
   * bougé, elle se retrouve par son identifiant. La nouvelle adresse n'a pas
   * de ligne dans cet espace — l'appelant l'a vérifié dans la même unité.
   */
  abstract relocate(preference: MarketingPreference): Promise<void>;

  /**
   * Supprime la ligne — SEULEMENT pour l'effacement d'un accord (règle 23),
   * quand l'agrégat a rendu `forget`. Aucun autre geste ne supprime.
   */
  abstract forget(preference: MarketingPreference): Promise<void>;
}
