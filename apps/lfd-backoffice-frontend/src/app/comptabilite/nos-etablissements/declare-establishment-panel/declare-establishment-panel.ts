import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldSearchComponent,
  FoldStatusBadgeComponent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { AdminCompaniesService } from '../../../comptes-clients/admin-companies.service';
import { STATUS_LABELS, type AdminCompany } from '../../../comptes-clients/admin-company';
import { matchesCompanySearch } from '../../../comptes-clients/company-search';
import { CollectionTestsService } from '../../collection-tests.service';

/** Charge d'ouverture : les sociétés déjà déclarées, qu'on ne repropose pas. */
export interface DeclareEstablishmentPanelData {
  readonly declaredIds: readonly string[];
}

/** Au-delà, on affine la recherche plutôt que de défiler. */
const MAX_RESULTS = 8;

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Déclarer un de nos établissements** — une société cliente qui est à nous
 * (plan `plan-prelevement-d-essai.md`, Q1). La recherche est celle de la liste
 * des comptes. Le serveur refuse une société déjà déclarée ; son message
 * s'affiche tel quel.
 */
@Component({
  selector: 'app-declare-establishment-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldSearchComponent,
    FoldStatusBadgeComponent,
  ],
  templateUrl: './declare-establishment-panel.html',
  styleUrl: './declare-establishment-panel.scss',
})
export class DeclareEstablishmentPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto', width: 'md' };

  private readonly companies = inject(AdminCompaniesService);
  private readonly api = inject(CollectionTestsService);
  private readonly ref = inject(FoldPanelRef<string>);

  readonly data = input.required<DeclareEstablishmentPanelData>();

  protected readonly state = signal<LoadState>('loading');
  private readonly all = signal<readonly AdminCompany[]>([]);
  protected readonly query = signal('');
  protected readonly declaring = signal<string | null>(null);
  protected readonly refusal = signal<string | null>(null);
  protected readonly statusLabels = STATUS_LABELS;

  /** Les sociétés qui répondent à la recherche — rien tant qu'on n'a rien tapé. */
  protected readonly results = computed<readonly AdminCompany[]>(() => {
    const query = this.query().trim();
    if (query === '') {
      return [];
    }
    const declared = new Set(this.data().declaredIds);
    return this.all()
      .filter((company) => !declared.has(company.id))
      .filter((company) => matchesCompanySearch(company, query))
      .slice(0, MAX_RESULTS);
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.all.set(await this.companies.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected nameOf(company: AdminCompany): string {
    return company.enseigne.trim() === '' ? company.raisonSociale : company.enseigne;
  }

  protected async declare(company: AdminCompany): Promise<void> {
    if (this.declaring() !== null) {
      return;
    }
    this.declaring.set(company.id);
    this.refusal.set(null);
    try {
      await this.api.declare(company.id);
      this.ref.close(company.id);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'La société n’a pas été déclarée.'));
    } finally {
      this.declaring.set(null);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
