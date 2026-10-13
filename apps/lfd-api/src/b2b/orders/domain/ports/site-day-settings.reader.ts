import type { GpsPoint } from "@lfd/contracts";

import type {
  ClockWindow,
  PublicClosureOfDay,
  PublicSlotRuleOfDay,
} from "../services/transfer-departure.js";

/**
 * Ce qu'un site dit de lui-même **pour un jour donné** — ce que le calcul de
 * l'échéance par site lit (plan du transfert interne, §7, lot T0).
 *
 * Déjà RÉDUIT au jour : les règles de créneaux publics qui visent ce jour de
 * semaine, les fermetures datées qui le couvrent. La règle du calendrier est
 * à l'adaptateur ; celle qui combine les heures est dans `transferDeparture`.
 */
export interface SiteDaySettings {
  readonly supply: "on_site" | "transfer";
  /** Mise en place au comptoir, ≥ 0 (tenu par l'agrégat `Site`). */
  readonly counterSetupMinutes: number;
  /** `null` = non saisi : un trajet ne se calcule pas sans lui. */
  readonly gps: GpsPoint | null;
  /** Le créneau réservé aux pros, ou `null`. */
  readonly proPickup: ClockWindow | null;
  readonly publicRules: readonly PublicSlotRuleOfDay[];
  readonly publicClosures: readonly PublicClosureOfDay[];
}

/**
 * **Les réglages des sites, pour un jour** — port de lecture à lui (ISP) :
 * l'échéance n'a que faire des couleurs, de l'adresse ni de la remise que
 * `SiteReader` rend à l'écran.
 *
 * Les sites ARCHIVÉS se résolvent aussi : une commande déjà passée garde son
 * site, et son échéance ne doit pas changer parce qu'on l'a archivé depuis.
 */
export abstract class SiteDaySettingsReader {
  /**
   * `day` : `AAAA-MM-JJ`. Un id inconnu est ABSENT du résultat — l'appelant le
   * traite comme un site non résolu (l'ancien calcul), jamais comme un défaut.
   */
  abstract forDay(
    day: string,
    siteIds: readonly string[],
  ): Promise<ReadonlyMap<string, SiteDaySettings>>;
}
