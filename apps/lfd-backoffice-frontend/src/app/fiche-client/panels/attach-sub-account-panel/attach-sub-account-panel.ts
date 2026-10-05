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
import { AdminCompanyHierarchyService } from '../../../comptes-clients/admin-company-hierarchy.service';
import { STATUS_LABELS, type AdminCompany } from '../../../comptes-clients/admin-company';
import { matchesCompanySearch } from '../../../comptes-clients/company-search';
import { NotifyService } from '../../../notify.service';

/** Charge d'ouverture : le principal qui accueille le client rattaché. */
export interface AttachSubAccountPanelData {
  readonly parentId: string;
  readonly parentName: string;
}

/** Au-delà, on affine la recherche plutôt que de défiler. */
const MAX_RESULTS = 8;

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Rattacher un client existant** comme sous-compte (`plan-sous-comptes.md`
 * §4) — la recherche est celle de la liste des comptes (société, SIRET,
 * propriétaire de l'espace).
 *
 * Ne sont proposés ni le principal lui-même, ni un client déjà sous-compte de
 * quelqu'un : le détacher d'abord est un geste à part, sur sa fiche. Le
 * reste — un client qui a lui-même des sous-comptes, la profondeur — c'est le
 * serveur qui le refuse, sous son verrou, et son message s'affiche tel quel.
 */
@Component({
  selector: 'app-attach-sub-account-panel',
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
  templateUrl: './attach-sub-account-panel.html',
  styleUrl: './attach-sub-account-panel.scss',
})
export class AttachSubAccountPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto', width: 'md' };

  private readonly companies = inject(AdminCompaniesService);
  private readonly hierarchy = inject(AdminCompanyHierarchyService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<string>);

  readonly data = input.required<AttachSubAccountPanelData>();

  protected readonly state = signal<LoadState>('loading');
  private readonly all = signal<readonly AdminCompany[]>([]);
  protected readonly query = signal('');
  protected readonly attaching = signal<string | null>(null);
  protected readonly refusal = signal<string | null>(null);
  protected readonly statusLabels = STATUS_LABELS;

  /** Les candidats qui répondent à la recherche — rien tant qu'on n'a rien tapé. */
  protected readonly results = computed<readonly AdminCompany[]>(() => {
    const query = this.query().trim();
    if (query === '') {
      return [];
    }
    const parentId = this.data().parentId;
    return this.all()
      .filter((company) => company.id !== parentId && company.parent === null)
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

  protected async attach(company: AdminCompany): Promise<void> {
    if (this.attaching() !== null) {
      return;
    }
    this.attaching.set(company.id);
    this.refusal.set(null);
    try {
      await this.hierarchy.attach(company.id, this.data().parentId);
      this.notify.success(`${this.nameOf(company)} est désormais un sous-compte.`);
      this.ref.close(company.id);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le client n’a pas été rattaché.'));
    } finally {
      this.attaching.set(null);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
