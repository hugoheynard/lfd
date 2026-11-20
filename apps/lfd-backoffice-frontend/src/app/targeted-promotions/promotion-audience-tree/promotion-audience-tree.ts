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
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldComboboxComponent,
  FoldInputComponent,
} from 'fold-ng';

import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import {
  boxStateOf,
  companiesOf,
  toggledAudiences,
  touchesBranch,
  withCompanyAdded,
  withCompanyRemoved,
  withCompanySites,
  withoutCompanies,
  type AudienceBox,
  type BoxState,
} from './audience-selection';
import { companyChoicesOf, type CompanyChoices } from './company-choices';

/** Une société du public, telle que l'arbre la montre. */
interface CompanyRow {
  readonly companyId: string;
  readonly label: string;
  readonly withSites: boolean;
  /** Ses sites aujourd'hui ; `null` quand la liste des sociétés n'est pas lue. */
  readonly sites: readonly string[] | null;
}

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
 * « Une société » ouvre une liste de sociétés : chacune avec ou sans ses
 * sites, ajoutées depuis la liste des comptes clients, lue au premier cochage. Cette liste demande le droit des comptes clients, que l'écran des
 * promotions ne demande pas : sans elle, on colle l'identifiant de la fiche.
 */
@Component({
  selector: 'app-promotion-audience-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldComboboxComponent,
    FoldInputComponent,
  ],
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
  /** « Une société » cochée avant qu'une société soit choisie. */
  private readonly companyOpen = signal(false);
  /** L'identifiant tapé, quand la liste n'a pas pu être lue. */
  protected readonly pendingId = signal('');

  protected readonly individuals = INDIVIDUALS;
  protected readonly pros = PROS;
  private readonly named = computed(() => companiesOf(this.audiences()));
  protected readonly companyChecked = computed(() => this.companyOpen() || this.named().length > 0);
  protected readonly companyRows = computed<readonly CompanyRow[]>(() =>
    this.named().map((target) => {
      const companyId = target.companyId ?? '';
      return {
        companyId,
        label: this.companyChoices()?.labelOf(companyId) ?? companyId,
        withSites: target.kind === 'company_and_sites',
        sites: this.companyChoices()?.sitesOf(companyId) ?? null,
      };
    }),
  );
  /** Les sociétés qu'on peut encore ajouter : pas celles déjà choisies. */
  protected readonly addableCompanies = computed(() => {
    const taken = new Set(this.named().map((target) => target.companyId));
    return (this.companyChoices()?.options ?? []).filter((option) => !taken.has(option.value));
  });
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
      if (this.companyChecked()) {
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
    this.companyOpen.set(checked);
    if (!checked) {
      this.audiencesChange.emit(withoutCompanies(this.audiences()));
    }
  }

  protected addCompany(companyId: string): void {
    this.audiencesChange.emit(withCompanyAdded(this.audiences(), companyId.trim()));
  }

  protected addPending(): void {
    this.addCompany(this.pendingId());
    this.pendingId.set('');
  }

  protected removeCompany(companyId: string): void {
    this.audiencesChange.emit(withCompanyRemoved(this.audiences(), companyId));
  }

  protected setSites(companyId: string, withSites: boolean): void {
    this.audiencesChange.emit(withCompanySites(this.audiences(), companyId, withSites));
  }
}
