import type { CompanyFollowAspect } from "@lfd/contracts";

import { FollowPeriodWindowError } from "../errors/hierarchy-errors.js";

/**
 * **Une période de suivi** : du `validFrom` inclus au `validTo` exclu, ce
 * sous-compte suivait cet aspect de ce principal (plan-sous-comptes §2.1).
 *
 * Une période, et non un booléen : le prix et le payeur se relisent à date,
 * et « qui suivait qui le 12 mars » doit avoir une réponse. `validTo: null`
 * veut dire « en cours ». Le principal est FIGÉ dans la période : un
 * sous-compte rattaché ailleurs plus tard ne réécrit pas qui il suivait avant.
 */
export class FollowPeriod {
  private constructor(
    readonly aspect: CompanyFollowAspect,
    readonly parentId: string,
    readonly validFrom: Date,
    readonly validTo: Date | null,
  ) {}

  /** Ouvre une période à `from`, sans fin. */
  static open(aspect: CompanyFollowAspect, parentId: string, from: Date): FollowPeriod {
    return new FollowPeriod(aspect, parentId, from, null);
  }

  static reconstitute(input: {
    readonly aspect: CompanyFollowAspect;
    readonly parentId: string;
    readonly validFrom: Date;
    readonly validTo: Date | null;
  }): FollowPeriod {
    return new FollowPeriod(input.aspect, input.parentId, input.validFrom, input.validTo);
  }

  get isOpen(): boolean {
    return this.validTo === null;
  }

  /** La période couvre-t-elle cet instant ? Début inclus, fin exclue. */
  covers(at: Date): boolean {
    const time = at.getTime();
    return (
      this.validFrom.getTime() <= time && (this.validTo === null || time < this.validTo.getTime())
    );
  }

  /**
   * Ferme la période à `at`.
   *
   * @throws {FollowPeriodWindowError} `at` n'est pas après le début : une
   *   période vide ou à l'envers dirait un suivi qui n'a jamais eu lieu.
   */
  closeAt(at: Date): FollowPeriod {
    if (at.getTime() <= this.validFrom.getTime()) {
      throw new FollowPeriodWindowError(this.aspect);
    }
    return new FollowPeriod(this.aspect, this.parentId, this.validFrom, at);
  }
}
