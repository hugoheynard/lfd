import type { CollectionForm } from "@lfd/contracts";

import {
  CollectionFormNeedsBillingFollowError,
  CollectionFormSameInstantError,
} from "../errors/collection-form-errors.js";

/** Une période de forme : de `validFrom` inclus à `validTo` exclu. */
export interface CollectionFormPeriod {
  readonly form: CollectionForm;
  readonly validFrom: Date;
  /** `null` = en cours. */
  readonly validTo: Date | null;
}

/** Sans décision, un site est prélevé sur le mandat de son payeur. */
const DEFAULT_FORM: CollectionForm = "principal_mandate";

/**
 * **Les formes de prélèvement d'un site, période par période**
 * (`plan-sous-comptes.md` §2.1 ter) — l'agrégat de `company_collection_form`
 * pour UNE société.
 *
 * Une décision DATÉE, comme les suivis : le lot lit la forme en vigueur à la
 * clôture du cycle, et changer de forme ne réécrit pas un cycle passé. Rien
 * ne s'efface : choisir ferme la période en cours et en ouvre une.
 */
export class CollectionFormHistory {
  private constructor(
    readonly companyId: string,
    private periodsValue: readonly CollectionFormPeriod[],
  ) {}

  static reconstitute(
    companyId: string,
    periods: readonly CollectionFormPeriod[],
  ): CollectionFormHistory {
    return new CollectionFormHistory(companyId, periods);
  }

  /** Toutes les périodes, closes comprises — ce que l'adaptateur écrit. */
  get periods(): readonly CollectionFormPeriod[] {
    return this.periodsValue;
  }

  /** La forme en vigueur à `at` — début inclus, fin exclue. */
  formAt(at: Date): CollectionForm {
    const time = at.getTime();
    const period = this.periodsValue.find(
      (p) => p.validFrom.getTime() <= time && (p.validTo === null || time < p.validTo.getTime()),
    );
    return period?.form ?? DEFAULT_FORM;
  }

  /**
   * Choisit `form` à partir de `at`.
   *
   * @param followsBilling le site suit-il `billing` à `at` ? Lu par
   *   l'appelant sous le verrou de la hiérarchie.
   * @returns `false` si la forme en vigueur est déjà celle-ci : rien n'a changé.
   * @throws {CollectionFormNeedsBillingFollowError} le site paie seul.
   * @throws {CollectionFormSameInstantError} une période s'ouvre déjà à `at`.
   */
  choose(form: CollectionForm, at: Date, followsBilling: boolean): boolean {
    if (!followsBilling) {
      throw new CollectionFormNeedsBillingFollowError(this.companyId);
    }
    if (this.formAt(at) === form) {
      return false;
    }
    const open = this.periodsValue.find((period) => period.validTo === null);
    if (open !== undefined && open.validFrom.getTime() >= at.getTime()) {
      throw new CollectionFormSameInstantError(this.companyId);
    }
    const closed = this.periodsValue.map((period) =>
      period === open ? { ...period, validTo: at } : period,
    );
    this.periodsValue = [...closed, { form, validFrom: at, validTo: null }];
    return true;
  }
}
