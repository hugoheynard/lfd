import {
  FEATURE_KEYS,
  isExemptible,
  type FeatureKey,
  type FeatureLevel,
  type FeatureLevelsView,
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
   * **Tous** les niveaux pour ce sujet, en une lecture des dérogations au lieu
   * d'une par clé — ce que lisent `GET /feature-access` et `GET /me`.
   *
   * Même résolution que {@link levelFor}, clé par clé : seules les clés
   * exemptibles cherchent l'adresse (aucune depuis le 2026-10-09, donc aucune
   * lecture d'exemption aujourd'hui). La dérogation d'une clé exemptée est lue
   * quand même, dans le même `IN` : elle n'y change rien.
   */
  async levelsFor(subject: FeatureSubject): Promise<FeatureLevelsView> {
    const email = exemptionLookupEmail(subject);
    const [overrides, exemptKeys] = await Promise.all([
      this.lookup.storedOverrides(FEATURE_KEYS),
      this.exemptKeys(email),
    ]);
    const facts = (key: FeatureKey) => ({
      exempt: exemptKeys.has(key),
      storedOverride: overrides.get(key) ?? null,
    });
    // Écrit clé par clé : une clé ajoutée au catalogue fait échouer la
    // compilation ici, `FeatureLevelsView` étant indexé par lui.
    return {
      customerMandate: resolveFeatureLevel("customerMandate", facts("customerMandate")),
      facebookLogin: resolveFeatureLevel("facebookLogin", facts("facebookLogin")),
      proSignupCallback: resolveFeatureLevel("proSignupCallback", facts("proSignupCallback")),
    };
  }

  /** Les clés exemptibles où cette adresse prouvée est exemptée. */
  private async exemptKeys(email: string | null): Promise<ReadonlySet<FeatureKey>> {
    if (email === null) {
      return new Set();
    }
    const exemptible = FEATURE_KEYS.filter((key) => isExemptible(key));
    const answers = await Promise.all(
      exemptible.map(async (key) => ((await this.lookup.isExempt(key, email)) ? [key] : [])),
    );
    return new Set(answers.flat());
  }

  /**
   * Le niveau d'une clé **qu'aucune exemption n'ouvre** — sans sujet, parce
   * qu'il n'y en a pas besoin.
   *
   * Existe pour les handlers qui gardent une surface fermée par le serveur
   * (`customerMandate`) : ils n'ont pas de `FeatureSubject` sous la main, et
   * leur en fabriquer un ferait croire qu'une adresse pouvait compter. Le TYPE
   * refuse une clé exemptible — il n'en reste aucune depuis le 2026-10-09.
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
