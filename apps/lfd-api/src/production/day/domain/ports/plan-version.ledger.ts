import type { PlanVersion } from "../entities/plan-version.js";

/**
 * **Le registre des versions du plan** — port d'ÉCRITURE, en ajout seul
 * (`documentation/fournil/les-versions-du-plan.md`). Ni mise
 * à jour ni effacement : une version n'est jamais réécrite. Appelé sous le
 * verrou de la journée, dans la transaction du geste — un échec fait échouer
 * le geste (§ 2 bis).
 */
export abstract class PlanVersionLedger {
  abstract append(version: PlanVersion): Promise<void>;
}
