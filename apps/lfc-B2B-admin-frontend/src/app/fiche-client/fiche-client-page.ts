import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FoldButtonComponent, FoldPageLayoutComponent } from 'fold-ng';
import {
  CompanyContactsCard,
  CompanyIdentityCard,
  CompanyReferenceCard,
  type CompanyContactCardView,
  type CompanyIdentityView,
} from '@lfd/b2b-ui/company';

import type { AdminCompany } from '../comptes-clients/admin-company';
import { AdminCompaniesService } from '../comptes-clients/admin-companies.service';
import { toContactCards, toIdentityView } from './admin-company-view';

type LoadState = 'loading' | 'ready' | 'error' | 'notfound';

/**
 * Fiche **détail** d'un compte client (staff) — 1er consommateur admin de
 * `@lfd/b2b-ui/company`. Container en **lecture seule** : il charge une
 * `AdminCompany` (via la liste, faute d'endpoint détail), la projette vers les
 * view-models neutres et rend les cartes partagées. Pas de carte adresses (aucun
 * endpoint admin), pas d'action (identité/contacts read-only, KBIS sans blob).
 */
@Component({
  selector: 'app-fiche-client',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldButtonComponent,
    CompanyReferenceCard,
    CompanyIdentityCard,
    CompanyContactsCard,
  ],
  templateUrl: './fiche-client-page.html',
  styleUrl: './fiche-client-page.scss',
})
export class FicheClientPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(AdminCompaniesService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly company = signal<AdminCompany | null>(null);

  protected readonly identity = computed<CompanyIdentityView | null>(() => {
    const company = this.company();
    return company === null ? null : toIdentityView(company);
  });
  protected readonly contacts = computed<CompanyContactCardView[]>(() => {
    const company = this.company();
    return company === null ? [] : toContactCards(company);
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (id === null) {
      this.state.set('notfound');
      return;
    }
    this.state.set('loading');
    try {
      const company = await this.service.getById(id);
      if (company === undefined) {
        this.state.set('notfound');
        return;
      }
      this.company.set(company);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Retour à la liste des comptes clients. */
  protected back(): void {
    void this.router.navigate(['/comptes-clients']);
  }
}
