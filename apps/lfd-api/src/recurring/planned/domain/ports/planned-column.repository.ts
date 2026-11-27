import type { IsoDate } from "../../../basket/domain/value-objects/iso-date.js";
import type { PlannedColumn } from "../entities/planned-column.js";

/** Ce qui désigne une colonne vivante : la société (le mur, et le site : un site est une société), le jour et le créneau. */
export interface PlannedColumnSlot {
  readonly companyId: string;
  readonly serviceDay: IsoDate;
  readonly windowStart: string | null;
  readonly windowEnd: string;
}

/**
 * Port d'**écriture** des colonnes planifiées. Séparé de la lecture (ISP).
 *
 * Il prend et rend l'agrégat. L'écriture est **conditionnée à la version
 * lue** : deux onglets qui écrivent la même colonne ne s'écrasent pas, le
 * second est refusé.
 */
export abstract class PlannedColumnRepository {
  /** La colonne, murée par sa société — retirée comprise ; `null` si absente ou d'une autre société. */
  abstract load(companyId: string, columnId: string): Promise<PlannedColumn | null>;

  /** La colonne VIVANTE (non retirée) qui occupe ce créneau, s'il y en a une. */
  abstract loadSlot(slot: PlannedColumnSlot): Promise<PlannedColumn | null>;

  /**
   * Les colonnes en BROUILLON servies au plus tard `lastDay`, toutes sociétés
   * confondues — ce que le balayage lit (index partiel `planned_columns_draft_idx`),
   * par jour servi puis instant de conversion croissants, au plus `limit`.
   * La machine n'a pas de mur : elle passe chaque colonne sous le mur de son
   * acheteur, rejoué par la passation.
   */
  abstract draftsThrough(lastDay: IsoDate, limit: number): Promise<PlannedColumn[]>;

  /**
   * Écrit la colonne (insérée si neuve) et rend sa nouvelle version.
   *
   * @throws {PlannedColumnVersionConflictError} écrite ailleurs depuis la lecture.
   * @throws {PlannedWindowTakenError} une autre colonne vivante occupe le créneau.
   */
  abstract save(day: PlannedColumn, at: Date): Promise<number>;
}
