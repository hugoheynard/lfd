import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { OrderOpeningExemptionPayload } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInputComponent,
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
import { NotifyService } from '../../../notify.service';
import { OrderOpeningExemptionsService } from '../order-opening-exemptions.service';

/** Au-delà, on affine la recherche plutôt que de défiler. */
const MAX_RESULTS = 8;

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Ajouter une exemption** à la fermeture de la boutique (décision de Hugo
 * du 2026-10-26) : une société, cherchée comme dans la liste des comptes, ou
 * une adresse e-mail — une personne, ou une commande sans compte.
 *
 * Une société archivée (résiliée) n'est pas proposée ; le serveur la refuse
 * de toute façon, comme une adresse mal formée ou déjà exemptée, et son
 * message s'affiche tel quel. Se ferme sur `true` quand une exemption est née.
 */
@Component({
  selector: 'app-grant-exemption-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    FoldSearchComponent,
    FoldStatusBadgeComponent,
  ],
  templateUrl: './grant-exemption-panel.html',
  styleUrl: './grant-exemption-panel.scss',
})
export class GrantExemptionPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto', width: 'md' };

  private readonly companies = inject(AdminCompaniesService);
  private readonly exemptions = inject(OrderOpeningExemptionsService);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  protected readonly state = signal<LoadState>('loading');
  private readonly all = signal<readonly AdminCompany[]>([]);
  protected readonly query = signal('');
  protected readonly email = signal('');
  /** La cible en vol (`email`, ou l'id de la société) ; `null` au repos. */
  protected readonly pending = signal<string | null>(null);
  protected readonly refusal = signal<string | null>(null);
  protected readonly statusLabels = STATUS_LABELS;

  /** Les sociétés qui répondent à la recherche, archivées exclues — rien tant qu'on n'a rien tapé. */
  protected readonly results = computed<readonly AdminCompany[]>(() => {
    const query = this.query().trim();
    if (query === '') {
      return [];
    }
    return this.all()
      .filter((company) => company.status !== 'terminated')
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

  protected exemptCompany(company: AdminCompany): Promise<void> {
    return this.grant(company.id, { kind: 'company', companyId: company.id }, this.nameOf(company));
  }

  protected exemptEmail(): Promise<void> {
    const email = this.email().trim();
    if (email === '') {
      return Promise.resolve();
    }
    return this.grant('email', { kind: 'email', email }, email);
  }

  protected cancel(): void {
    this.ref.close();
  }

  private async grant(
    key: string,
    payload: OrderOpeningExemptionPayload,
    label: string,
  ): Promise<void> {
    if (this.pending() !== null) {
      return;
    }
    this.pending.set(key);
    this.refusal.set(null);
    try {
      await this.exemptions.grant(payload);
      this.notify.success(`${label} peut commander malgré la fermeture.`);
      this.ref.close(true);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'L’exemption n’a pas été ajoutée.'));
    } finally {
      this.pending.set(null);
    }
  }
}
