import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { PromotionAudienceTargetView } from '@lfd/contracts';
import {
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldComboboxComponent,
  FoldInputComponent,
} from 'fold-ng';

import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import {
  boxStateOf,
  namedCompanyOf,
  toggledAudiences,
  touchesBranch,
  withCompany,
  type AudienceBox,
  type BoxState,
} from './audience-selection';
import { companyChoicesOf, type CompanyChoices } from './company-choices';

/** Une case, et son libellé. */
interface Box {
  readonly box: AudienceBox;
  readonly label: string;
}

const INDIVIDUALS: readonly Box[] = [
  { box: 'individuals_guest', label: 'Invités (sans compte)' },
  { box: 'individuals_registered', label: 'Inscrits' },
];
const PROS: readonly Box[] = [
  { box: 'pros_active', label: 'Actifs' },
  { box: 'pros_pending', label: "En cours d'inscription" },
];

/**
 * **Le public d'une promotion, en cases à cocher en étages** (`documentation/promotions/promotions.md`, § 2.1, lot L8b) : Tout le monde · Particuliers (Invités, Inscrits) · Pros
 * (Actifs, En cours d'inscription, une société ± ses sites).
 *
 * Un parent coché coche et grise ses enfants ; certains enfants cochés le
 * rendent partiel. La valeur émise est l'ensemble minimal
 * (`audience-selection.ts`). Sous chaque branche touchée, l'appelant projette
 * ses libellés (`[individualsLabels]`, `[prosLabels]`).
 *
 * « Une société » se choisit dans la liste des comptes clients, lue au premier
 * cochage. Cette liste demande le droit des comptes clients, que l'écran des
 * promotions ne demande pas : sans elle, on colle l'identifiant de la fiche.
 */
@Component({
  selector: 'app-promotion-audience-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldCheckboxComponent, FoldComboboxComponent, FoldInputComponent],
  templateUrl: './promotion-audience-tree.html',
  styleUrl: './promotion-audience-tree.scss',
})
export class PromotionAudienceTree {
  readonly audiences = input.required<readonly PromotionAudienceTargetView[]>();
  /** Lecture seule : sans droit d'écriture, ou une promotion archivée. */
  readonly disabled = input(false);
  readonly audiencesChange = output<PromotionAudienceTargetView[]>();

  private readonly companies = inject(AdminCompaniesService);
  protected readonly companyChoices = signal<CompanyChoices | null>(null);
  protected readonly companiesFailed = signal(false);
  private companiesAsked = false;

  protected readonly individuals = INDIVIDUALS;
  protected readonly pros = PROS;
  protected readonly company = computed(() => namedCompanyOf(this.audiences()));
  protected readonly touchesIndividuals = computed(() =>
    touchesBranch(this.audiences(), 'individuals'),
  );
  protected readonly touchesPros = computed(() => touchesBranch(this.audiences(), 'pros'));
  /** Le public de la reprise, que l'arbre ne propose pas : montré, remplacé au premier clic. */
  protected readonly legacy = computed(() =>
    this.audiences().some((target) => target.kind === 'everyone_but_active_pros'),
  );
  protected readonly everyoneChecked = computed(() => this.state('everyone').checked);

  constructor() {
    effect(() => {
      if (this.company() !== null) {
        void this.loadCompanies();
      }
    });
  }

  /** Une seule lecture : la liste ne change pas le temps d'une saisie. */
  private async loadCompanies(): Promise<void> {
    if (this.companiesAsked) {
      return;
    }
    this.companiesAsked = true;
    try {
      this.companyChoices.set(companyChoicesOf(await this.companies.list()));
    } catch {
      this.companiesFailed.set(true);
    }
  }

  protected state(box: AudienceBox): BoxState {
    return boxStateOf(box, this.audiences());
  }

  protected toggle(box: AudienceBox, checked: boolean): void {
    this.audiencesChange.emit(toggledAudiences(this.audiences(), box, checked));
  }

  protected toggleCompany(checked: boolean): void {
    this.audiencesChange.emit(
      withCompany(this.audiences(), checked ? { companyId: '', withSites: false } : null),
    );
  }

  protected setCompany(companyId: string): void {
    const withSites = this.company()?.kind === 'company_and_sites';
    this.audiencesChange.emit(withCompany(this.audiences(), { companyId, withSites }));
  }

  protected setSites(withSites: boolean): void {
    const companyId = this.company()?.companyId ?? '';
    this.audiencesChange.emit(withCompany(this.audiences(), { companyId, withSites }));
  }
}
