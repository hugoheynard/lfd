import { isFeatureKey, isFeatureLevel, featureLevelsOf, type FeatureKey } from "@lfd/contracts";

import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";
import { UnknownFeatureError, UnknownFeatureLevelError } from "./feature-access-errors.js";

/**
 * Une **dérogation** au défaut du code, telle qu'elle s'écrit.
 *
 * Pas un agrégat : c'est de la configuration sans transition (CLAUDE.md §3.1).
 * Mais la seule règle qui peut refuser l'écriture — « la valeur est un niveau de
 * cette clé » — vit ICI, dans la factory, et nulle part ailleurs : ni le
 * contrôleur (qui ne connaît que la forme), ni l'adaptateur.
 */
export class FeatureOverride {
  private constructor(
    readonly key: FeatureKey,
    readonly value: string,
    readonly at: Date,
    readonly author: StaffTrace,
  ) {}

  /**
   * Pose une valeur pour une clé du catalogue.
   *
   * @throws {UnknownFeatureError} la clé n'est pas au catalogue.
   * @throws {UnknownFeatureLevelError} la valeur n'est pas un niveau de cette clé.
   */
  static pose(input: {
    readonly key: string;
    readonly value: string;
    readonly at: Date;
    readonly author: StaffTrace;
  }): FeatureOverride {
    const key = requireFeatureKey(input.key);
    const value = input.value.trim();
    if (!isFeatureLevel(key, value)) {
      throw new UnknownFeatureLevelError(key, value, featureLevelsOf(key));
    }
    return new FeatureOverride(key, value, input.at, input.author);
  }
}

/**
 * La clé, confrontée au catalogue.
 *
 * @throws {UnknownFeatureError} la clé n'est pas au catalogue.
 */
export function requireFeatureKey(raw: string): FeatureKey {
  if (!isFeatureKey(raw)) {
    throw new UnknownFeatureError(raw);
  }
  return raw;
}
