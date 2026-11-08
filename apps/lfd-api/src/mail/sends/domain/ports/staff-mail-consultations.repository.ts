import type { StaffMailConsultations } from "../entities/staff-mail-consultations.js";

/**
 * Port d'ÉCRITURE des consultations d'une personne (décisions 7 et 8).
 * `load` compte la dernière heure — révélations ET recherches — sous un
 * verrou par personne tenu jusqu'à la fin de la transaction ; `save` range
 * les révélations neuves.
 */
export abstract class StaffMailConsultationsRepository {
  abstract load(staffId: string, now: Date): Promise<StaffMailConsultations>;
  abstract save(consultations: StaffMailConsultations): Promise<void>;
}
