import type { PickupSchedule } from "./pickup-schedule.js";

/**
 * Port d'**écriture** de l'horaire public d'un point : il prend et rend
 * l'agrégat, jamais des colonnes.
 *
 * Pas de `saveRule(id, columns)` ni de `setCapacity(id, n)` : le chevauchement
 * se juge sur l'ensemble, et une écriture ciblée le ferait remonter dans le
 * handler — donc invisible au prochain handler qui touchera le même point
 * (`CLAUDE.md` §3.1).
 *
 * Séparé de {@link PublicPickupScheduleReader} : un écran qui affiche une grille
 * n'a rien à faire d'un port capable de la réécrire (ISP).
 */
export abstract class PickupScheduleRepository {
  /**
   * L'horaire du point. Un point **sans** créneaux publics rend un horaire
   * **vide**, jamais `null` : l'absence de réglage est un état normal, et c'est
   * lui qui garantit qu'un point non réglé se comporte comme avant (D6).
   */
  abstract load(pickupAddressId: string): Promise<PickupSchedule>;

  /**
   * Écrit l'horaire **en une transaction** : règles et fermetures partent
   * ensemble ou pas du tout. Une grille à moitié enregistrée ouvrirait des
   * heures que personne n'a voulues.
   */
  abstract save(schedule: PickupSchedule): Promise<void>;
}
