import type { StaffMailConsultations } from "../../../sends/domain/entities/staff-mail-consultations.js";

/**
 * Port d'ÉCRITURE des consultations du registre de préférence par une
 * personne (plan de désinscription, lot C4). L'agrégat est celui du suivi —
 * le plafond horaire est le MÊME, partagé — ; `load` compte les deux
 * familles sous un verrou par personne, `save` range dans les tables du
 * registre : une révélation porte l'identifiant de la LIGNE (le champ
 * `sendId` de l'agrégat, qui désigne ici la ligne consultée), une recherche
 * son empreinte et les lignes trouvées.
 */
export abstract class PreferenceConsultationsRepository {
  abstract load(staffId: string, now: Date): Promise<StaffMailConsultations>;
  abstract save(consultations: StaffMailConsultations): Promise<void>;
}
