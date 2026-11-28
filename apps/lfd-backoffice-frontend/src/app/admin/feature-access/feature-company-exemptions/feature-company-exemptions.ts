import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldComboboxComponent,
  FoldElementTitleComponent,
  FoldInlineConfirmComponent,
  type FoldSelectOption,
} from 'fold-ng';

/** Une société exemptée, telle que la ligne la peint. */
export interface CompanyExemptionRow {
  readonly companyId: string;
  /** Le nom figé à l'ajout. */
  readonly companyName: string;
  readonly added: string;
}

/** Une société qu'on peut ajouter : non archivée, pas encore dans la liste. */
export interface ExemptibleCompanyOption {
  readonly id: string;
  readonly name: string;
}

/**
 * **Les sociétés exemptées d'une clé** qui s'ouvre société par société
 * (`orderPlanner`). Exempter une société l'ouvre à qui agit dans SON espace,
 * et à personne d'autre : ni ses sites, ni son principal (doc
 * `documentation/b2b/plan-exemption-par-societe.md`, § 2).
 *
 * Le sélecteur ne propose que les sociétés dont le compte n'est pas supprimé
 * (le serveur le refuse aussi) et qui ne sont pas déjà dans la liste. Ce
 * composant n'écrit rien : il dit le geste, la page l'envoie et relit.
 */
@Component({
  selector: 'app-feature-company-exemptions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldComboboxComponent,
    FoldElementTitleComponent,
    FoldInlineConfirmComponent,
  ],
  templateUrl: './feature-company-exemptions.html',
  styleUrl: './feature-company-exemptions.scss',
})
export class FeatureCompanyExemptions {
  readonly rows = input.required<readonly CompanyExemptionRow[]>();
  readonly companies = input.required<readonly ExemptibleCompanyOption[]>();
  readonly canWrite = input.required<boolean>();
  /** Une écriture est en vol : les contrôles attendent. */
  readonly busy = input.required<boolean>();

  readonly added = output<string>();
  readonly removed = output<CompanyExemptionRow>();

  protected readonly options = computed<readonly FoldSelectOption<string>[]>(() => {
    const taken = new Set(this.rows().map((row) => row.companyId));
    return this.companies()
      .filter((company) => !taken.has(company.id))
      .map((company) => ({ value: company.id, label: company.name }));
  });

  protected choose(companyId: string | null): void {
    if (companyId !== null) {
      this.added.emit(companyId);
    }
  }

  protected removeMessage(row: CompanyExemptionRow): string {
    return `Retirer ${row.companyName} de la liste ? Cette société suivra de nouveau le niveau.`;
  }
}
