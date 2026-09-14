import type { FeatureExemptionAccountState } from "@lfd/contracts";

import type { StaffTrace } from "../../../account/domain/value-objects/staff-trace.js";

/** Une dérogation telle qu'elle est en base — clé et valeur non interprétées. */
export interface StoredOverrideRow {
  readonly key: string;
  readonly value: string;
  readonly updatedAt: Date;
  readonly updatedBy: StaffTrace;
}

/** Une exemption telle qu'elle est en base, avec l'état du compte qui porte l'adresse. */
export interface StoredExemptionRow {
  readonly id: string;
  readonly key: string;
  readonly email: string;
  readonly createdAt: Date;
  readonly createdBy: StaffTrace;
  readonly accountState: FeatureExemptionAccountState;
}

/** Tout ce qui est en base, pour l'écran admin. */
export interface StoredFeatureAccess {
  readonly overrides: readonly StoredOverrideRow[];
  readonly exemptions: readonly StoredExemptionRow[];
}

/**
 * Port de **lecture staff** : TOUTES les lignes, y compris celles que le
 * catalogue ne sait plus lire — c'est à la composition de les signaler.
 *
 * L'état du compte est lu dans la table des personnes du même bloc, en lecture
 * seule. C'est une entorse assumée à « on ne cherche pas les personnes »,
 * limitée à cet écran (plan §8, Q7).
 */
export abstract class FeatureAccessBoardReader {
  abstract read(): Promise<StoredFeatureAccess>;
}
