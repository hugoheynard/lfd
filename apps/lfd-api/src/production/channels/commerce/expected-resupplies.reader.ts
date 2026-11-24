import type { ServiceRange } from "../../day/domain/value-objects/service-range.value-object.js";
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
 * `documentation/reassort-boutiques/README.md`, Hugo
 * 2026-10-21). Port que le fournil DÉCLARE et que le commerce implémente.
 *
 * Un port à part d'{@link ExpectedProductionReader} (ISP) : le prévisionnel
 * compte les réassorts à part des commandes, et la fiche d'atelier les
 * additionne à sa demande d'une journée ouverte (après l'arrêt, ils sont
 * dans le compte figé) ; et à part de
 * {@link DayResuppliesReader}, qui rend des réassorts entiers, une journée à
 * la fois, pour les figer — une matrice de sept jours ne veut que des pièces.
 *
 * Seuls les réassorts « pour demain », envoyés et non annulés : « au plus
 * tôt » n'entre pas au plan (R4). Un jour sans réassort peut manquer.
 */
export abstract class ExpectedResuppliesReader {
  abstract expectedBetween(range: ServiceRange): Promise<readonly ExpectedDayResupplies[]>;
}
