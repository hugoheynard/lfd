import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { CatalogAdminItemView } from '@lfd/contracts';
import { CatalogRow, PriceEditor } from '@lfd/catalog-ui';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { CatalogueService } from './catalogue.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Un rayon : la famille et ses articles, dans l'ordre reçu du PIM. */
interface Shelf {
  readonly id: string;
  readonly name: string;
  readonly items: readonly CatalogAdminItemView[];
  /** La famille n'a pas de taux de TVA : ses articles ne sont pas vendables. */
  readonly untaxed: boolean;
}

/**
 * Sous-page **Catalogue** des Réglages (staff).
 *
 * Elle montre ce que le PIM a poussé — **le prix canonique** — et ce que la
 * plateforme en a fait. Rien n'est saisi ici pour l'instant hormis la visibilité :
 * la couche d'altération (mercuriale, dégressifs, promotions) viendra
 * par-dessus, et le canonique est ce sur quoi elle s'appuiera.
 *
 * Deux choses que l'écran doit dire, parce qu'elles décident de la suite :
 *
 * - **d'où vient chaque prix** — un tarif sans provenance ne se défend pas ;
 * - **quels articles ne sont pas vendables** — une famille sans taux de TVA
 *   entre au catalogue mais reste hors boutique. Le taire donnerait une liste
 *   rassurante dont la moitié n'est achetable par personne.
 */
@Component({
  selector: 'app-catalogue-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CatalogRow,
    PriceEditor,
    FoldCardComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './catalogue-page.html',
  styleUrl: './catalogue-page.scss',
})
export class CataloguePage {
  private readonly catalogue = inject(CatalogueService);
  private readonly notify = inject(NotifyService);

  protected readonly state = signal<LoadState>('loading');
  private readonly items = signal<readonly CatalogAdminItemView[]>([]);

  /**
   * Le filtre de recherche. Quatre-vingt-douze lignes ne se parcourent pas à
   * l'œil : sans lui, corriger un prix demande de faire défiler cinq rayons.
   */
  protected readonly query = signal('');

  /** Nom ou référence, sans accent ni casse — on tape « pate » et « Pâté » sort. */
  private readonly matching = computed(() => {
    const needle = normalize(this.query());
    if (needle === '') {
      return this.items();
    }
    return this.items().filter(
      (item) => normalize(item.name).includes(needle) || normalize(item.sku).includes(needle),
    );
  });

  /** Combien d'articles ne sont pas vendables faute de TVA — le chiffre à voir. */
  protected readonly untaxedCount = computed(
    () => this.items().filter((item) => item.vatRatePercent === null).length,
  );

  /** Combien portent un prix décidé ici — la mesure du travail commercial déjà fait. */
  protected readonly alteredCount = computed(
    () => this.items().filter((item) => item.b2bPriceMillicents !== null).length,
  );

  protected readonly total = computed(() => this.items().length);
  protected readonly shown = computed(() => this.matching().length);

  /**
   * Rangé par famille, dans l'ordre du serveur.
   *
   * Le tri appartient au backend (position de la famille, puis de l'article) :
   * le refaire ici donnerait deux ordres possibles pour un même catalogue, et
   * c'est celui qu'on ne regarde pas qui finirait par diverger.
   */
  protected readonly shelves = computed<readonly Shelf[]>(() => {
    const byId = new Map<string, CatalogAdminItemView[]>();
    for (const item of this.matching()) {
      const shelf = byId.get(item.categoryId);
      if (shelf === undefined) {
        byId.set(item.categoryId, [item]);
      } else {
        shelf.push(item);
      }
    }
    return [...byId.entries()].map(([id, items]) => ({
      id,
      name: items[0]?.categoryName ?? id,
      items,
      untaxed: items[0]?.vatRatePercent === null,
    }));
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.items.set(await this.catalogue.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  /** Pose le prix B2B. Le serveur refuse un montant égal à celui du PIM. */
  protected async setPrice(item: CatalogAdminItemView, priceMillicents: number): Promise<void> {
    try {
      await this.catalogue.setPrice(item.sku, priceMillicents);
      this.notify.success(`Prix B2B posé sur ${item.name}.`);
      await this.load();
    } catch (error) {
      this.notify.error(error, "Le prix n'a pas pu être enregistré.");
    }
  }

  /** Retire la décision : l'article repasse au tarif du PIM et suivra ses hausses. */
  protected async alignOnPim(item: CatalogAdminItemView): Promise<void> {
    try {
      await this.catalogue.alignOnPim(item.sku);
      this.notify.success(`${item.name} suit de nouveau le tarif du PIM.`);
      await this.load();
    } catch (error) {
      this.notify.error(error, "La décision n'a pas pu être retirée.");
    }
  }

  /** Masque ou réaffiche un article, puis recharge : le serveur reste l'autorité. */
  protected async toggleVisibility(item: CatalogAdminItemView): Promise<void> {
    try {
      await this.catalogue.setVisibility(item.sku, !item.isHidden);
      this.notify.success(item.isHidden ? 'Article réaffiché.' : 'Article masqué de la boutique.');
      await this.load();
    } catch (error) {
      this.notify.error(error, "L'article n'a pas pu être modifié.");
    }
  }

  /**
   * Les allergènes d'un article, en une ligne : « Gluten · Lait ».
   *
   * Ce sont les catégories INCO — les mots d'une étiquette —, pas les codes GS1
   * du stockage. Le serveur a fait la projection ; l'écran ne fait que les
   * joindre.
   */
  protected allergenLabels(item: CatalogAdminItemView): string {
    return (item.allergens ?? []).map((allergen) => allergen.label).join(' · ');
  }
}

/** Sans accent ni casse : on tape « pate » et « Pâté » sort. */
function normalize(value: string): string {
  return value
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '');
}
