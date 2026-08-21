import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldNavLayoutComponent,
  FoldPageLayoutComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
} from 'fold-ng';

import { ChannelsPanel } from './panels/channels-panel';
import { CommunicationPanel } from './panels/communication-panel';
import { IdentityPanel } from './panels/identity-panel';
import { IntegrationsPanel } from './panels/integrations-panel';
import { PricingPanel } from './panels/pricing-panel';
import { RegulatoryPanel } from './panels/regulatory-panel';
import { VisualsPanel } from './panels/visuals-panel';
import type { HasPendingChanges } from './pending-changes.guard';
import { ProductFormStore } from './product-form-store';

/**
 * Formulaire produit — **coquille**. Elle fournit le {@link ProductFormStore}
 * (une instance par page), lance le chargement, et gère ce qui lui revient en
 * propre : la navigation, la garde « changements non enregistrés », le shell
 * (titre, états, onglets). Tout l'état et la logique vivent dans le store ;
 * chaque panneau l'injecte.
 */
@Component({
  selector: 'app-product-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ProductFormStore],
  imports: [
    FoldPageLayoutComponent,
    FoldBackLinkComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldLoadingStateComponent,
    FoldEmptyStateComponent,
    FoldNavLayoutComponent,
    FoldTabsComponent,
    FoldTabPanelComponent,
    IdentityPanel,
    PricingPanel,
    ChannelsPanel,
    RegulatoryPanel,
    CommunicationPanel,
    VisualsPanel,
    IntegrationsPanel,
  ],
  templateUrl: './product-form-page.html',
  styleUrl: './product-form-page.scss',
})
export class ProductFormPage implements HasPendingChanges {
  protected readonly store = inject(ProductFormStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly activeTab = signal<string>('identite');
  protected readonly leaveWarning = signal(false);
  /** Laissez-passer ponctuel une fois l'utilisateur a tranché la bannière. */
  private forceLeave = false;

  protected readonly tabs: FoldTabItem[] = [
    { key: 'identite', label: 'Identité', icon: 'grid' },
    { key: 'tarif', label: 'Tarif & logistique', icon: 'tag' },
    { key: 'canaux', label: 'Canaux & TVA', icon: 'sliders' },
    { key: 'fiche', label: 'Allergènes & nutrition', icon: 'shield' },
    { key: 'communication', label: 'Communication', icon: 'edit' },
    { key: 'visuels', label: 'Visuels', icon: 'eye' },
    { key: 'integrations', label: 'Intégrations', icon: 'shopify' },
  ];

  constructor() {
    void this.store.init(this.route.snapshot.paramMap.get('id'));
  }

  /** Garde CanDeactivate : retient si des sections sont modifiées. */
  canLeave(): boolean {
    if (this.forceLeave || this.store.dirtySections().length === 0) {
      return true;
    }
    this.leaveWarning.set(true);
    return false;
  }

  protected leaveAnyway(): void {
    this.forceLeave = true;
    this.back();
  }

  protected async saveDirtyAndLeave(): Promise<void> {
    await this.store.saveDirty();
    if (this.store.dirtySections().length === 0) {
      this.forceLeave = true;
      this.back();
    }
  }

  protected async submit(): Promise<void> {
    const id = await this.store.submit();
    if (id !== null) {
      await this.router.navigate(['/pim/produits', id]);
    }
  }

  private back(): void {
    void this.router.navigate(['/pim/produits']);
  }
}
