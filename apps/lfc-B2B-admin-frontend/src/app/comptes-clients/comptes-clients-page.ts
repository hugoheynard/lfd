import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FoldButtonComponent, FoldSpinnerComponent } from 'fold-ng';

import { AdminCompaniesService } from './admin-companies.service';
import { STATUS_LABELS, type AdminCompany } from './admin-company';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Onglet **Comptes clients** (commercial) : la liste cross-tenant des sociétés,
 * lue depuis `GET /admin/companies`. Première brique de l'app admin — filtres,
 * tri et fiche détail viennent ensuite (cf. admin-commercial-comptes-clients.md).
 */
@Component({
  selector: 'app-comptes-clients-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldSpinnerComponent],
  templateUrl: './comptes-clients-page.html',
  styleUrl: './comptes-clients-page.scss',
})
export class ComptesClientsPage {
  private readonly service = inject(AdminCompaniesService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly companies = signal<readonly AdminCompany[]>([]);
  protected readonly statusLabels = STATUS_LABELS;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.companies.set(await this.service.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Nom lisible du contact principal, ou `—` si vide. */
  protected contactName(company: AdminCompany): string {
    const full = `${company.primaryContact.firstName} ${company.primaryContact.lastName}`.trim();
    return full === '' ? '—' : full;
  }

  /** Date de création formatée (jj/mm/aaaa). */
  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR');
  }
}
