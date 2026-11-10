import type { CarriedFamily } from "../entities/decision-carry-over.js";

/**
 * Port de **lecture** : les audiences des décisions d'une famille, debout à
 * `at` sur `toSku` (non archivées, fenêtre ouverte ou close plus tard), dont
 * l'origine dit « reportée depuis `fromSku` » (`plan-report-apres-detachement.md`, § 3).
 *
 * L'audience est la clé du domaine : `ruleCarryKey` pour une règle (étage,
 * audience, seuil), `audienceKey` pour un barème, la clientèle pour un plancher, la société pour un engagement. Une
 * méthode (ISP) : le report n'a besoin de rien d'autre.
 */
export abstract class CarriedDecisionsReader {
  abstract carriedAudiences(
    family: CarriedFamily,
    fromSku: string,
    toSku: string,
    at: Date,
  ): Promise<readonly string[]>;
}
