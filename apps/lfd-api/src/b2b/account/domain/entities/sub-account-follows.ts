import type { CompanyFollowAspect } from "@lfd/contracts";

import {
  BillingFollowNeedsActiveParentError,
  NotASubAccountError,
} from "../errors/hierarchy-errors.js";
import { FollowPeriod } from "../value-objects/follow-period.js";
import type { Company } from "./company.js";

/**
 * **Ce qu'un sous-compte suit de son principal, période par période** (plan
 * `plan-sous-comptes.md`, §2.1) — l'agrégat de la table `company_follows`
 * pour UNE société.
 *
 * Il tient trois règles, que la base tient aussi en seconde ligne :
 * - on ne suit que son principal **actuel** (« un compte sans parent ne suit
 *   rien ») ;
 * - deux périodes d'un même aspect ne se chevauchent pas : suivre ce qu'on
 *   suit déjà ne rouvre rien ;
 * - suivre `billing` exige un principal **actif** (§2.4) — sans quoi le
 *   sous-compte serait facturé au nom d'un compte qui n'achète pas.
 *
 * Rien ne s'efface : cesser de suivre FERME la période. Les gestes sont
 * idempotents et le disent (`true` = quelque chose a changé), pour que le
 * handler ne journalise pas un geste qui n'a pas eu lieu.
 */
export class SubAccountFollows {
  private constructor(
    readonly companyId: string,
    private periodsValue: readonly FollowPeriod[],
  ) {}

  /** Une société qui n'a jamais rien suivi. */
  static none(companyId: string): SubAccountFollows {
    return new SubAccountFollows(companyId, []);
  }

  static reconstitute(companyId: string, periods: readonly FollowPeriod[]): SubAccountFollows {
    return new SubAccountFollows(companyId, periods);
  }

  /** Toutes les périodes, closes comprises — ce que l'adaptateur écrit. */
  get periods(): readonly FollowPeriod[] {
    return this.periodsValue;
  }

  /** La période de cet aspect qui couvre `at`, ou `null`. */
  followsAt(aspect: CompanyFollowAspect, at: Date): FollowPeriod | null {
    return this.periodsValue.find((p) => p.aspect === aspect && p.covers(at)) ?? null;
  }

  /** Les périodes en cours, un aspect au plus chacune. */
  get open(): readonly FollowPeriod[] {
    return this.periodsValue.filter((period) => period.isOpen);
  }

  /**
   * Commence à suivre `aspect` de `parent` à l'instant `at`.
   *
   * @param child la société de cet agrégat, lue sous le verrou de la hiérarchie.
   * @param parent son principal, lu sous le même verrou.
   * @returns `false` si l'aspect était déjà suivi : rien n'a changé.
   * @throws {NotASubAccountError} `child` n'est pas le sous-compte de `parent`.
   * @throws {BillingFollowNeedsActiveParentError} `billing` sur un principal inactif.
   */
  follow(aspect: CompanyFollowAspect, child: Company, parent: Company, at: Date): boolean {
    const parentId = parent.id;
    if (parentId === null || child.parentCompanyId !== parentId) {
      throw new NotASubAccountError(this.companyId);
    }
    if (aspect === "billing" && parent.status !== "active") {
      throw new BillingFollowNeedsActiveParentError(parentId);
    }
    if (this.openFor(aspect) !== null) {
      return false;
    }
    this.periodsValue = [...this.periodsValue, FollowPeriod.open(aspect, parentId, at)];
    return true;
  }

  /**
   * Cesse de suivre `aspect` à `at`. Le sous-compte reprend ses valeurs
   * propres, qui dormaient.
   *
   * @returns la période close, ou `null` si l'aspect n'était pas suivi.
   */
  stopFollowing(aspect: CompanyFollowAspect, at: Date): FollowPeriod | null {
    const current = this.openFor(aspect);
    if (current === null) {
      return null;
    }
    const closed = current.closeAt(at);
    this.periodsValue = this.periodsValue.map((period) => (period === current ? closed : period));
    return closed;
  }

  /** Ferme toutes les périodes en cours (détacher, §4). Rend les aspects fermés. */
  closeAll(at: Date): readonly CompanyFollowAspect[] {
    return this.open.flatMap((period) =>
      this.stopFollowing(period.aspect, at) === null ? [] : [period.aspect],
    );
  }

  private openFor(aspect: CompanyFollowAspect): FollowPeriod | null {
    return this.periodsValue.find((p) => p.aspect === aspect && p.isOpen) ?? null;
  }
}
