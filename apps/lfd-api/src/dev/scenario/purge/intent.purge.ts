import { SEED_STAFF_SUB } from "../../seeding/order-placing.seed.js";
import type { PurgeClient } from "./scenario-scope.js";

/**
 * **Les intentions de geste du semis** (`platform.gesture_intent`) : celles
 * dont l'acteur est le compte du semis (`SEED_STAFF_SUB`).
 *
 * Le semis rejoue chaque geste avec une clé neuve (colisage, réassort,
 * mercuriale…) : sans cette purge, chaque remise à l'état de base laisse une
 * intention par ligne semée. Le filtre est l'ACTEUR, pas le geste : une liste
 * de gestes serait à tenir à jour à chaque geste que le semis apprend, et
 * l'oubli ne se verrait qu'à la table qui grossit. Le compte du semis n'est
 * celui d'aucune personne : les intentions d'un membre du staff qui joue la
 * démo à la main restent intactes. Aucune clé étrangère ne tient ces lignes.
 */
export async function purgeSeedIntents(tx: PurgeClient): Promise<number> {
  const removed = await tx.gestureIntent.deleteMany({ where: { actorId: SEED_STAFF_SUB } });
  return removed.count;
}
