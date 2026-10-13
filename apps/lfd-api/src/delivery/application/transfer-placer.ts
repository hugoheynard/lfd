import type { TransferSiteFacts } from "../channels/commerce/index.js";
import type { TransferInsertion } from "../domain/services/place-transfer-stop.js";

/**
 * **Placer les transferts internes d'un jour, plus tard** (plan du transfert
 * interne, §5, lot T1) — ce que la composition du jour et le retirage
 * demandent, et rien d'autre (ISP). Implémenté par `TransferPlacement`.
 */
export abstract class TransferPlacer {
  /** Tout de suite, hors transaction : rend le nombre de transferts placés. */
  abstract placeDay(day: string): Promise<number>;
  /** Après la validation de l'appelant, en fond : un abonné tourne dans une transaction. */
  abstract placeDaySoon(day: string): void;
}

/** Une place trouvée, et la version de la tournée telle qu'on l'a lue. */
export interface TransferPlace extends TransferInsertion {
  readonly version: number;
}

/**
 * **Où le transfert d'un site entre-t-il dans les tournées du jour ?** — la
 * lecture routière que le placement fait avant d'écrire (DIP : le placement ne
 * connaît ni la matrice ni le géocodage). Implémenté par `TransferRouting`.
 */
export abstract class TransferPlaceFinder {
  /** `null` : aucune place à temps, ou la route ne se calcule pas. */
  abstract placeFor(day: string, site: TransferSiteFacts): Promise<TransferPlace | null>;
}
