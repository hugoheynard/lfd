import {
  isExemptible,
  type FeatureKey,
  type FeatureLevel,
  type UnexemptibleFeatureKey,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  exemptionLookupEmail,
  resolveFeatureLevel,
  type FeatureSubject,
} from "../domain/feature-level-resolution.js";
import { FeatureLevelLookup } from "../domain/ports/feature-level.lookup.js";

/**
 * **Le niveau d'une clé pour qui demande** — la question que les gardes du
 * lot 3 poseront à chaque requête, et que `GET /feature-access` pose sans sujet.
 *
 * Service applicatif et non handler de requête : une garde n'est pas un cas
 * d'usage, et la faire passer par le bus ajouterait un saut sans rien nommer.
 * **Aucun cache**, délibérément (plan §2.1).
 */
@Injectable()
export class FeatureLevelResolver {
  constructor(private readonly lookup: FeatureLevelLookup) {}

  async levelFor<Key extends FeatureKey>(
    key: Key,
    subject: FeatureSubject,
  ): Promise<FeatureLevel<Key>> {
    // Une clé non exemptible ne cherche même pas l'adresse : la réponse ne
    // pourrait rien changer, et la requête laisserait croire le contraire.
    const email = isExemptible(key) ? exemptionLookupEmail(subject) : null;
    const exempt = email !== null && (await this.lookup.isExempt(key, email));
    // Exempté, la dérogation ne changerait rien : on ne la lit pas.
    const storedOverride = exempt ? null : await this.lookup.storedOverride(key);
    return resolveFeatureLevel(key, { exempt, storedOverride });
  }

  /**
   * Le niveau d'une clé **qu'aucune exemption n'ouvre** — sans sujet, parce
   * qu'il n'y en a pas besoin.
   *
   * Existe pour les handlers qui gardent une surface fermée par le serveur
   * (`customerMandate`) : ils n'ont pas de `FeatureSubject` sous la main, et
   * leur en fabriquer un ferait croire qu'une adresse pouvait compter. Le TYPE
   * refuse une clé exemptible : `unexemptibleLevelOf("shop")` ne compile pas.
   */
  async unexemptibleLevelOf<Key extends UnexemptibleFeatureKey>(
    key: Key,
  ): Promise<FeatureLevel<Key>> {
    return resolveFeatureLevel(key, {
      exempt: false,
      storedOverride: await this.lookup.storedOverride(key),
    });
  }
}
