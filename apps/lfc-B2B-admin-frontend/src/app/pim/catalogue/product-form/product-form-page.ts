import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import {
  FoldBadgeComponent,
  FoldBreadcrumbComponent,
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldEmptyStateComponent,
  FoldAsideLayoutComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldPopoverTriggerDirective,
  type FoldBadgeVariant,
  type FoldBreadcrumbItem,
} from 'fold-ng';

import type { ProductStatus } from '../../data/models';

import { ChannelsPanel } from './panels/channels-panel';
import { CommunicationPanel } from './panels/communication-panel';
import { IdentityPanel } from './panels/identity-panel';
import { IntegrationsPanel } from './panels/integrations-panel';
import { PricingPanel } from './panels/pricing-panel';
import { RegulatoryPanel } from './panels/regulatory-panel';
import { VisualsPanel } from './panels/visuals-panel';
import type { HasPendingChanges } from './pending-changes.guard';
import { ProductFormStore, type FormSection } from './product-form-store';
import { PublishRail } from './publish-rail/publish-rail';
import { SectionState } from './section-state/section-state';

/**
 * Les libellés d'état — exhaustifs par construction : un `Record<ProductStatus,
 * …>` casse la compilation le jour où le modèle gagne un état, là où un `switch`
 * avec `default` l'aurait peint « Brouillon » en silence.
 */
const STATUS_LABELS: Readonly<Record<ProductStatus, string>> = {
  draft: 'Brouillon',
  published: 'Publié',
  archived: 'Archivé',
};

const STATUS_VARIANTS: Readonly<Record<ProductStatus, FoldBadgeVariant>> = {
  draft: 'warning',
  published: 'success',
  archived: 'neutral',
};

interface PageSection {
  readonly key: FormSection;
  readonly label: string;
  readonly description: string;
}

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
    FoldBadgeComponent,
    FoldBreadcrumbComponent,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldPopoverTriggerDirective,
    FoldCalloutComponent,
    FoldLoadingStateComponent,
    FoldEmptyStateComponent,
    FoldAsideLayoutComponent,
    FoldPageSectionComponent,
    SectionState,
    PublishRail,
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

  /**
   * Le fil d'Ariane — les ancêtres, pas la page.
   *
   * La famille ne porte PAS de lien : il n'existe pas d'écran par famille, et
   * la liste des produits ne se filtre pas encore par famille. Un maillon
   * cliquable qui n'irait nulle part promettrait une navigation que
   * l'application n'a pas ; il reste donc une étape, lisible et inerte, jusqu'au
   * jour où cet écran existe.
   */
  protected readonly trail = computed<FoldBreadcrumbItem[]>(() => {
    const items: FoldBreadcrumbItem[] = [{ label: 'Produits', routerLink: '/pim/produits' }];
    const family = this.store.categoryName();
    if (family !== '') {
      items.push({ label: family });
    }
    return items;
  });

  protected readonly statusLabel = computed(() => STATUS_LABELS[this.store.status()]);
  protected readonly statusVariant = computed(() => STATUS_VARIANTS[this.store.status()]);

  /**
   * Les faits de l'en-tête, après la référence : où le produit est rangé, et
   * combien de déclinaisons il porte.
   *
   * Une liste FILTRÉE, et c'est tout l'intérêt : un fait que le référentiel n'a
   * pas encore rendu (la famille, tant que les catégories chargent) disparaît
   * avec son séparateur, au lieu de laisser « P-000123 ·  · 3 déclinaisons » —
   * deux points de suspension pour une valeur absente.
   */
  protected readonly facts = computed(() => {
    const count = this.store.variantCount();
    return [
      this.store.kindLabel(),
      this.store.categoryName(),
      count === 0 ? '' : `${String(count)} déclinaison${count > 1 ? 's' : ''}`,
    ].filter((fact) => fact !== '');
  });

  /**
   * Les sections ENREGISTRABLES, dans l'ordre de lecture. La description
   * remplace le `<p class="panel-desc">` que chaque panneau ouvrait : c'est
   * `fold-page-section` qui la porte maintenant, au même endroit pour toutes.
   */
  protected readonly sections: PageSection[] = [
    {
      key: 'identite',
      label: 'Identité',
      description: 'Le strict nécessaire pour exister au catalogue.',
    },
    {
      key: 'tarif',
      label: 'Tarif & logistique',
      description: "Prix canonique HT et poids de l'unité vendue.",
    },
    {
      key: 'fiche',
      label: 'Fiche réglementaire',
      description: 'Allergènes obligatoires avant publication, et déclaration nutritionnelle.',
    },
    {
      key: 'communication',
      label: 'Contenu',
      description: 'Textes du site et référencement — ce que voit le client.',
    },
    {
      key: 'visuels',
      label: 'Visuels',
      description: 'Le master ; chaque canal en dérivera ses tailles.',
    },
  ];

  constructor() {
    void this.store.init(this.route.snapshot.paramMap.get('id'));
  }

  /**
   * Garde CanDeactivate — elle ne retient plus.
   *
   * Le contrat de la garde est : `false` retient ET le composant affiche sa
   * propre bannière. La bannière disparaît avec le nouveau modèle d'édition,
   * puisque le rail nomme en permanence les sections en attente et porte « Tout
   * enregistrer ». Garder `false` sans bannière piégerait l'utilisateur sans un
   * mot d'explication — un mur silencieux, pire que l'avertissement qu'on
   * retire.
   *
   * La garde reste branchée sur la route : le jour où un blocage réel est
   * nécessaire, c'est ici qu'il s'écrit. Elle est INERTE aujourd'hui, et c'est
   * dit plutôt que sous-entendu.
   */
  canLeave(): boolean {
    return true;
  }

  /** Enregistre UNE section — le bouton posé à droite de son titre. */
  protected saveSection(section: FormSection): void {
    void this.store.saveOne(section);
  }

  protected publish(): void {
    void this.store.changeStatus('published');
  }

  protected unpublish(): void {
    void this.store.changeStatus('draft');
  }

  protected archive(): void {
    void this.store.changeStatus('archived');
  }

  /** Enregistre toutes les sections modifiées, depuis le rail. */
  protected saveAll(): void {
    void this.store.saveDirty();
  }

  protected async submit(): Promise<void> {
    const id = await this.store.submit();
    if (id !== null) {
      await this.router.navigate(['/pim/produits', id]);
    }
  }
}
