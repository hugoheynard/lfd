import type { PlannedColumnView } from "@lfd/contracts";

import type { IsoDate } from "../../../basket/domain/value-objects/iso-date.js";

/** Les colonnes d'une société (le site) entre deux jours, bornes comprises. */
export interface PlannedColumnsWindow {
  readonly companyId: string;
  readonly from: IsoDate;
  readonly to: IsoDate;
}

/** Port de **lecture** des colonnes planifiées, muré par la société. */
export abstract class PlannedColumnsReader {
  /** Les colonnes non retirées de la fenêtre, par jour puis créneau croissants. */
  abstract window(window: PlannedColumnsWindow): Promise<readonly PlannedColumnView[]>;
}
