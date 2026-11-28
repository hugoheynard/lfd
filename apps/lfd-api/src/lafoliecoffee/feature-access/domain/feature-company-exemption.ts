import { exemptionKindOf, type FeatureKey } from "@lfd/contracts";

import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";
import {
  ArchivedCompanyExemptionError,
  ExemptedCompanyNotFoundError,
  FeatureNotExemptibleByCompanyError,
} from "./feature-access-errors.js";
import { requireFeatureKey } from "./feature-override.js";

/** La société visée, telle que le compte la décrit au moment du geste. */
export interface ExemptionCompanyFacts {
  readonly id: string;
  /** Le nom d'usage : l'enseigne, sinon la raison sociale. */
  readonly name: string;
  /** Vrai si le compte a été supprimé (`archived_at`). */
  readonly archived: boolean;
}

/**
 * Une **exemption par société** : une société qui garde le niveau le plus
 * ouvert d'une clé, pour tous ceux qui agissent dans son espace.
 *
 * Pas un agrégat : de la configuration sans transition, qu'on ajoute ou
 * retire. Les règles qui refusent l'ajout vivent ici — la clé s'exempte
 * société par société, la société existe et n'est pas archivée —, et son
 * nom est figé : la ligne n'a pas de clé vers la société.
 */
export class FeatureCompanyExemption {
  private constructor(
    readonly key: FeatureKey,
    readonly companyId: string,
    readonly companyName: string,
    readonly at: Date,
    readonly author: StaffTrace,
  ) {}

  /**
   * @param company la société lue au compte, `null` si l'identifiant n'en désigne aucune.
   * @throws {UnknownFeatureError} la clé n'est pas au catalogue.
   * @throws {FeatureNotExemptibleByCompanyError} la clé ne s'ouvre pas société par société.
   * @throws {ExemptedCompanyNotFoundError} la société n'existe pas.
   * @throws {ArchivedCompanyExemptionError} le compte de la société a été supprimé.
   */
  static grant(input: {
    readonly key: string;
    readonly companyId: string;
    readonly company: ExemptionCompanyFacts | null;
    readonly at: Date;
    readonly author: StaffTrace;
  }): FeatureCompanyExemption {
    const key = requireFeatureKey(input.key);
    if (exemptionKindOf(key) !== "company") {
      throw new FeatureNotExemptibleByCompanyError(key);
    }
    const company = input.company;
    if (company === null) {
      throw new ExemptedCompanyNotFoundError(input.companyId);
    }
    if (company.archived) {
      throw new ArchivedCompanyExemptionError(company.id, company.name);
    }
    return new FeatureCompanyExemption(key, company.id, company.name, input.at, input.author);
  }
}
