import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type WritableSignal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import {
  FoldBackLinkComponent,
  FoldBadgeComponent,
  FoldCardComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldAsideLayoutComponent,
  FoldLoadingStateComponent,
  FoldNavLayoutComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  FoldViewNavComponent,
  type FoldTabItem,
  type FoldViewNavItem,
} from 'fold-ng';

import { UiPrefsStore } from '../../../shared/ui-prefs/ui-prefs.store';
import { productStatusLabel, productStatusVariant } from '../product-status';

import { CommunicationForm } from './form-sections/communication/communication-form';
import { IdentityForm } from './form-sections/identity/identity-form';
import { IntegrationsForm } from './form-sections/integrations/integrations-form';
import { PricingForm } from './form-sections/pricing/pricing-form';
import { OperationOnlyForm } from './form-sections/operation-only/operation-only-form';
import { OrderLimitForm } from './form-sections/order-limit/order-limit-form';
import { IngredientsForm } from './form-sections/ingredients/ingredients-form';
import { AllergensForm } from './form-sections/allergens/allergens-form';
import { NutritionForm } from './form-sections/nutrition/nutrition-form';
import { VisualsForm } from './form-sections/visuals/visuals-form';
import type { HasPendingChanges } from './pending-changes.guard';
import { ProductFormStore, type FormSection, type SectionFamily } from './product-form-store';
import { SectionFamilyFilterStore, type SectionFilter } from '../section-family-filter';
import { ProductHistory } from './product-history/product-history';
import { PublishRail } from './publish-rail/publish-rail';
import { SECTION_EDITING } from '../section-state/section-editing';
import { SectionAlignment } from './section-alignment/section-alignment';
import { VariantBar } from './variant-bar/variant-bar';
import { SectionState } from '../section-state/section-state';

/** L'espace de noms des plis de CET écran — une fiche produit se replie comme
 *  une autre, donc la préférence est celle de l'écran, pas celle du produit. */
const FOLD_SCOPE = 'pim.product-form';

/** Les onglets d'une fiche existante. */
type ProductTab = 'sheet' | 'history';

const TAB_ITEMS: readonly FoldTabItem<ProductTab>[] = [
  { key: 'sheet', label: 'Fiche' },
  { key: 'history', label: 'Historique', icon: 'timeline' },
];

/** Les familles telles qu'on les lit à l'écran. La raison du découpage est au
 *  `SectionFamily` du magasin, où les sections le portent. */
const FAMILY_LABELS: Readonly<Record<SectionFamily, string>> = {
  identite: 'Identité',
  commerce: 'Commerce',
  reglementaire: 'Réglementaire',
  communication: 'Communication',
};

/** L'ordre de la barre : « Tout » d'abord, puis les familles dans l'ordre de
 *  lecture de la fiche. */
const FILTER_ORDER: readonly SectionFilter[] = [
  'all',
  'identite',
  'commerce',
  'reglementaire',
  'communication',
];

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
  // Le store est aussi l'hôte d'édition des sections : `useExisting` et non
  // `useClass`, sinon l'indicateur lirait un SECOND store, vierge et muet.
  providers: [ProductFormStore, { provide: SECTION_EDITING, useExisting: ProductFormStore }],
  imports: [
    FoldPageLayoutComponent,
    FoldBackLinkComponent,
    FoldBadgeComponent,
    FoldCardComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldLoadingStateComponent,
    FoldEmptyStateComponent,
    FoldAsideLayoutComponent,
    FoldPageSectionComponent,
    FoldNavLayoutComponent,
    FoldTabsComponent,
    FoldTabPanelComponent,
    FoldViewNavComponent,
    NgTemplateOutlet,
    ProductHistory,
    SectionState,
    SectionAlignment,
    VariantBar,
    PublishRail,
    IdentityForm,
    PricingForm,
    OperationOnlyForm,
    OrderLimitForm,
    AllergensForm,
    NutritionForm,
    IngredientsForm,
    CommunicationForm,
    VisualsForm,
    IntegrationsForm,
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

  protected readonly tabItems = TAB_ITEMS;
  protected readonly activeTab = signal<ProductTab>('sheet');
  /**
   * Vrai dès le premier passage sur « Historique », et le reste : revenir à
   * l'onglet retrouve la page qu'on lisait, au lieu de relire le journal.
   */
  protected readonly historyOpened = signal(false);

  protected onTab(tab: ProductTab): void {
    this.activeTab.set(tab);
    if (tab === 'history') {
      this.historyOpened.set(true);
    }
  }

  protected readonly statusLabel = computed(() => productStatusLabel(this.store.status()));
  protected readonly statusVariant = computed(() => productStatusVariant(this.store.status()));

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
      label: 'Tarif & TVA',
      description: 'Prix public TTC, canaux de vente et taux — hérités, ou redéfinis ici.',
    },
    {
      key: 'allergenes',
      label: 'Allergènes',
      // Ce que la loi exige, et la seule des deux moitiés qui bloque la
      // publication (D2). Les traces sont ici parce qu'une trace est un
      // allergène, déclarée à un autre titre.
      description:
        'Obligatoires avant publication, traces comprises. « Aucun allergène » est une affirmation, pas un champ vide.',
    },
    {
      key: 'nutrition',
      label: 'Valeurs nutritionnelles',
      // 🔴 D2, confirmée sur le texte consolidé du règlement (UE) 1169/2011 :
      // la déclaration nutritionnelle est exemptée pour ce qu'on vend — art. 44
      // §1 (frais non préemballé en boutique) et annexe V pt 19 (confiseries de
      // notre fabrication vendues en détail local). Les allergènes, eux, ne le
      // sont par aucune des deux. L'écran le DIT : laisser croire la nutrition
      // obligatoire ferait bloquer des fiches sur une exigence qui n'existe pas.
      description:
        'Facultatives pour publier : le règlement en exempte ce que nous vendons. Elles s’enregistrent à part des allergènes.',
    },
    {
      key: 'communication',
      label: 'Contenu',
      description: 'Textes du site et référencement — ce que voit le client.',
    },
    {
      key: 'visuels',
      label: 'Visuels',
      // Ce qui est VRAI aujourd'hui. La maquette annonce « glisser pour
      // réordonner » ; rien ne réordonne encore, et l'annoncer serait promettre
      // un geste qui ne répond pas. C'est le RÔLE qui désigne la principale.
      description:
        'La principale est celle des boutiques. Le texte alternatif est le seul champ d’image qui se traduit.',
    },
  ];

  /**
   * La famille retenue en haut de page — tenue HORS de la page.
   *
   * Le réglage suit la personne d'une fiche à l'autre (décision Hugo,
   * 2026-09-23) : un composant de page, qui meurt à chaque navigation, ne peut
   * pas le porter. Ce que ce siège ne fait pas encore — survivre à un
   * rechargement — est dit dans son propre fichier.
   */
  private readonly filterStore = inject(SectionFamilyFilterStore);
  protected readonly familyFilter = this.filterStore.family;

  /**
   * La famille de chaque section, lue sur le magasin.
   *
   * Aucune table locale : les familles vivent sur `SAVEABLE`, avec les sections
   * qu'elles rangent. Ici on ne fait que l'indexer.
   */
  private readonly familyByKey = new Map<FormSection, SectionFamily>(
    this.store.saveable.map((section) => [section.key, section.family] as const),
  );

  /** La famille d'une section, en toutes lettres. */
  protected familyLabel(key: FormSection): string {
    const family = this.familyByKey.get(key);
    return family === undefined ? '' : FAMILY_LABELS[family];
  }

  /**
   * Les items de la barre de filtre.
   *
   * Le compteur d'une famille est son nombre de sections **non enregistrées**,
   * et c'est la moitié visible de la règle ci-dessous : même filtré sur une
   * autre famille, l'écran continue de nommer celle qui porte des
   * modifications en attente. « Tout » n'en porte pas — le total vit déjà dans
   * le rail de publication, et le redire ici en ferait deux à tenir d'accord.
   */
  protected readonly filterItems = computed<FoldViewNavItem[]>(() => {
    const dirty = this.store.dirtySections();
    return FILTER_ORDER.map((key) => {
      if (key === 'all') {
        return { key, label: 'Tout' };
      }
      const count = dirty.filter((section) => section.family === key).length;
      return { key, label: FAMILY_LABELS[key], badge: count === 0 ? null : count };
    });
  });

  /**
   * Les sections affichées, dans l'ordre de lecture.
   *
   * 🔴 **Une section non enregistrée reste visible, quelle que soit la
   * famille choisie.** Le filtre range, il ne cache jamais du travail en cours :
   * masquer une section sale rejouerait exactement la perte des visuels — des
   * modifications qu'on ne voit plus, et qu'on quitte sans les avoir vues. Elle
   * garde alors sa pastille de famille (en `warning`), qui dit d'où elle vient
   * et pourquoi elle est là.
   */
  protected readonly visibleSections = computed<PageSection[]>(() =>
    this.sections.filter((section) => this.isVisible(section.key)),
  );

  /**
   * Le filtre EFFECTIF.
   *
   * À la création, c'est « Tout », quoi qu'ait choisi la personne ailleurs : la
   * barre n'y est pas, donc un réglage rapporté d'une autre fiche cacherait des
   * champs qu'on demande de saisir, sans rien pour le défaire.
   */
  protected readonly activeFilter = computed<SectionFilter>(() =>
    this.store.isEdit() ? this.familyFilter() : 'all',
  );

  private isVisible(key: FormSection): boolean {
    const filter = this.activeFilter();
    return filter === 'all' || this.familyByKey.get(key) === filter || this.store.isDirty(key);
  }

  /** Hors de la famille filtrée, et affichée quand même parce qu'elle est sale. */
  protected isEscapee(key: FormSection): boolean {
    const filter = this.activeFilter();
    return filter !== 'all' && this.familyByKey.get(key) !== filter;
  }

  /**
   * La pastille de famille se montre sur « Tout » — où la liste est mélangée —
   * et sur une section retenue hors de sa famille. Dans une liste déjà
   * homogène, elle ne ferait que répéter le filtre sur chaque carte.
   */
  protected showsFamily(key: FormSection): boolean {
    return this.activeFilter() === 'all' || this.isEscapee(key);
  }

  /** Le filtre de `fold-view-nav` revient en `string` : on le referme ici. */
  protected setFamily(key: string): void {
    const known = FILTER_ORDER.find((candidate) => candidate === key);
    if (known !== undefined) {
      this.filterStore.choose(known);
    }
  }

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
    void this.store.runLifecycle('publish');
  }

  protected unpublish(): void {
    void this.store.runLifecycle('unpublish');
  }

  protected archive(): void {
    void this.store.runLifecycle('archive');
  }

  /**
   * Une fiche archivée revient en BROUILLON, jamais directement en ligne.
   *
   * Ce geste passait par `changeStatus('draft')`, donc par la route de
   * DÉPUBLICATION — qui ne fait rien sur un archivé. Il a sa route depuis le
   * début côté serveur ; il ne l'appelait pas (audit 2026-09-01, §1).
   */
  protected restore(): void {
    void this.store.runLifecycle('restore');
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
