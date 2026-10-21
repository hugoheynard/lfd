import type { ServiceRange } from "../../domain/value-objects/service-range.value-object.js";
import type { ExpectedItem } from "./expected-production.reader.js";

/** Les réassorts « pour demain » attendus une journée, fusionnés par article. */
export interface ExpectedDayResupplies {
  /** `AAAA-MM-JJ`. */
  readonly day: string;
  readonly items: readonly ExpectedItem[];
}

/**
 * **« Quels réassorts pour demain sont envoyés sur ces journées ? »** — le
 * prévisionnel les compte à part des commandes (lot R3d,
 * `documentation/reassort-boutiques/plan-reapprovisionnement.md`, Hugo
 * 2026-10-21). Port que le fournil DÉCLARE et que le commerce implémente.
 *
 * Un port à part d'{@link ExpectedProductionReader} (ISP) : la fiche
 * d'atelier lit la demande en commandes et n'a que faire des réassorts, qui
 * entrent dans son compte par le gel de l'arrêt ; et à part de
 * {@link DayResuppliesReader}, qui rend des réassorts entiers, une journée à
 * la fois, pour les figer — une matrice de sept jours ne veut que des pièces.
 *
 * Seuls les réassorts « pour demain », envoyés et non annulés : « au plus
 * tôt » n'entre pas au plan (R4). Un jour sans réassort peut manquer.
 */
export abstract class ExpectedResuppliesReader {
  abstract expectedBetween(range: ServiceRange): Promise<readonly ExpectedDayResupplies[]>;
}
