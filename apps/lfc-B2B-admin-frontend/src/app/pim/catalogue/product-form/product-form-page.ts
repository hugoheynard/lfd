import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type WritableSignal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import {
  FoldBackLinkComponent,
  FoldBadgeComponent,
  FoldCardComponent,
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
} from 'fold-ng';

import type { ProductStatus } from '../../data/models';
import { UiPrefsStore } from '../../../shared/ui-prefs/ui-prefs.store';

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

/** L'espace de noms des plis de CET écran — une fiche produit se replie comme
 *  une autre, donc la préférence est celle de l'écran, pas celle du produit. */
const FOLD_SCOPE = 'pim.product-form';

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
    FoldBackLinkComponent,
    FoldBadgeComponent,
    FoldCardComponent,
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

  private readonly uiPrefs = inject(UiPrefsStore);

  /**
   * L'état replié de chaque section, retenu d'une visite à l'autre.
   *
   * Un signal par clé, initialisé au chargement : on lit le stockage UNE fois,
   * pas à chaque rendu — une lecture dans un `computed` en ferait une source de
   * vérité que rien n'invalide, et le premier `setItem` d'un autre onglet
   * mentirait sans jamais rafraîchir.
   */
  private readonly openState = new Map<string, WritableSignal<boolean>>();

  /** Le signal d'ouverture d'une section, créé à la demande. */
  protected sectionOpen(key: string): WritableSignal<boolean> {
    const existing = this.openState.get(key);
    if (existing !== undefined) {
      return existing;
    }
    // Déployée par défaut : une section qui démarre repliée est une section
    // qu'il faut découvrir.
    const created = signal(this.uiPrefs.isOpen(FOLD_SCOPE, key, true));
    this.openState.set(key, created);
    return created;
  }

  /** Le pli est un choix : on le retient. */
  protected setSectionOpen(key: string, open: boolean): void {
    this.sectionOpen(key).set(open);
    this.uiPrefs.setOpen(FOLD_SCOPE, key, open);
  }

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
