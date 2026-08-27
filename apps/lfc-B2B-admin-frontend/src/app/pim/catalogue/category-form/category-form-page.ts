import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import {
  FoldAsideLayoutComponent,
  FoldBackLinkComponent,
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { UiPrefsStore } from '../../../shared/ui-prefs/ui-prefs.store';
import { SECTION_EDITING } from '../section-state/section-editing';
import { SectionState } from '../section-state/section-state';
import { CategoryFormStore, type CategorySection } from './category-form-store';
import { CategoryChannelsForm } from './form-sections/channels/channels-form';
import { CategoryIdentityForm } from './form-sections/identity/identity-form';
import { CategorySummaryRail } from './summary-rail/summary-rail';

/** L'espace de noms des plis de CET écran — une famille se replie comme une
 *  autre, donc la préférence appartient à l'écran, pas à la famille. */
const FOLD_SCOPE = 'pim.category-form';

interface PageSection {
  readonly key: CategorySection;
  readonly label: string;
  readonly description: string;
}

/**
 * Page **famille** — la coquille. Elle fournit le {@link CategoryFormStore} (une
 * instance par page), lance le chargement, et garde ce qui lui revient : la
 * navigation, le titre, les états de la page.
 *
 * Elle remplace un side-panel. Le panneau tenait à trois réglages ; il ne tient
 * plus dès qu'une famille porte des descriptions et des visuels — un panneau qui
 * défile sur trois écrans n'est plus un panneau, c'est une page mal posée. Le
 * gabarit est donc celui de la fiche produit, jusqu'à l'enregistrement PAR
 * SECTION : un référentiel se corrige au passage, section par section, sans
 * qu'un bouton unique en bas de page rende tout solidaire.
 */
@Component({
  selector: 'app-category-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // `useExisting` : l'indicateur de section doit lire CE store, pas un second.
  providers: [CategoryFormStore, { provide: SECTION_EDITING, useExisting: CategoryFormStore }],
  imports: [
    FoldPageLayoutComponent,
    FoldBackLinkComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldAsideLayoutComponent,
    FoldPageSectionComponent,
    SectionState,
    CategoryIdentityForm,
    CategoryChannelsForm,
    CategorySummaryRail,
  ],
  templateUrl: './category-form-page.html',
  styleUrl: './category-form-page.scss',
})
export class CategoryFormPage {
  protected readonly store = inject(CategoryFormStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly uiPrefs = inject(UiPrefsStore);

  private readonly openState = new Map<string, ReturnType<typeof signal<boolean>>>();

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    void this.store.load(id);
  }

  /**
   * Les sections enregistrables, dans l'ordre de lecture. Canaux et taux vont
   * ENSEMBLE : un taux ne se pose que sur un canal vendu, et les séparer
   * offrirait d'enregistrer la moitié qui casse l'autre.
   */
  private readonly allSections: PageSection[] = [
    {
      key: 'identite',
      label: 'Identité',
      description: 'Le nom, dans les trois langues, et la place dans l’arbre.',
    },
    {
      key: 'canaux',
      label: 'Canaux & TVA',
      description: 'Ce que la famille vend, d’où, et à quel taux. Ses fiches en héritent.',
    },
  ];

  /**
   * Les sections OFFERTES. Une famille archivée est **gelée** : le référentiel
   * n'accepte que son renommage, et refuse canaux, taux et déplacement. Offrir
   * ces sections quand même, c'est promettre un enregistrement qui échouera —
   * exactement ce que la zone dangereuse refuse de faire trois blocs plus bas.
   */
  protected readonly sections = computed(() =>
    this.store.isArchived()
      ? this.allSections.filter((section) => section.key === 'identite')
      : this.allSections,
  );

  /** Le signal d'ouverture d'une section, créé à la demande et retenu. */
  protected sectionOpen(key: string): ReturnType<typeof signal<boolean>> {
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

  protected setSectionOpen(key: string, open: boolean): void {
    this.sectionOpen(key).set(open);
    this.uiPrefs.setOpen(FOLD_SCOPE, key, open);
  }

  protected readonly archivedLabel = computed(() => (this.store.isArchived() ? 'Archivée' : ''));

  protected saveSection(section: CategorySection): void {
    void this.store.saveOne(section);
  }

  protected async submit(): Promise<void> {
    const id = await this.store.create();
    if (id !== null) {
      // `replaceUrl` : revenir en arrière depuis la famille fraîche doit rendre
      // la LISTE, pas un formulaire de création qui la recréerait.
      await this.router.navigate(['/pim/categories', id], { replaceUrl: true });
    }
  }

  protected async archive(): Promise<void> {
    if (await this.store.archive()) {
      await this.router.navigate(['/pim/categories']);
    }
  }
}
