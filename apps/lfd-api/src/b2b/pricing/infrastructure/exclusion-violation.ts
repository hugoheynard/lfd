/**
 * **Cette erreur est-elle le refus de CETTE contrainte d'exclusion ?**
 *
 * ## Pourquoi on guette le NOM, et pas le SQLSTATE
 *
 * `23P01` désigne n'importe quelle contrainte d'exclusion de la base. Le nom,
 * lui, est à nous : il vit dans la migration d'à côté et désigne *cette* règle
 * métier. Le jour où une seconde contrainte d'exclusion arrive sur la même
 * table, le SQLSTATE les confondrait et le refus nommerait la mauvaise.
 *
 * ## Pourquoi on descend la chaîne des causes
 *
 * Prisma emballe l'erreur du pilote, et le transport en rajoute une couche
 * (Accelerate en production, l'adaptateur `pg` en test). Le nom de la contrainte
 * peut donc être à deux ou trois niveaux de profondeur. La borne à cinq n'est
 * pas de la prudence décorative : une chaîne de causes cyclique bloquerait le
 * processus qui facture.
 *
 * Écrit une fois pour les trois tables qui portent une telle contrainte —
 * règles, barèmes, mercuriales. Il l'était deux fois avant le 2026-09-08, et une
 * troisième copie aurait fait de la divergence une question de temps.
 */
export function isExclusionViolation(error: unknown, constraintName: string): boolean {
  for (let current = error, depth = 0; current !== null && depth < 5; depth += 1) {
    if (typeof current !== "object") {
      return false;
    }
    const message: unknown = Reflect.get(current, "message");
    if (typeof message === "string" && message.includes(constraintName)) {
      return true;
    }
    current = Reflect.get(current, "cause");
  }
  return false;
}
