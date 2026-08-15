import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';
import type { CatalogItemView, ProductionBatchView } from '@lfd/contracts';

import { AdminCatalogService } from '../commandes/catalog.service';
import { FicheProduction } from './fiche-production/fiche-production';
import { productionRecap, totalPieces } from './production-recap';
import { ProductionService } from './production.service';

type LoadState = 'loading' | 'ready' | 'error';

/** Les deux lectures d'un même lot. On ouvre sur la fabrication. */
const VIEWS: readonly FoldViewToggleOption[] = [
  { value: 'recap', label: 'Récapitulatif', icon: 'list' },
  { value: 'bons', label: 'Bons de commande', icon: 'receipt' },
];

const DAY_LABEL = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** `AAAA-MM-JJ` d'un instant, en heure locale — le jour tel que l'équipe le dit. */
function isoDay(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Demain, par défaut : à la clôture, on imprime le service suivant. */
function defaultDate(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return isoDay(tomorrow);
}

/**
 * La **production d'une journée** : ce qu'il y a à fabriquer, et pour qui.
 *
 * L'écran ouvre sur le **récapitulatif** — rayon, produit, quantité — parce que
 * c'est l'ordre du travail : on pétrit par produit, on répartit ensuite. Les
 * **bons de commande** sont l'autre onglet, une feuille par commande.
 *
 * **L'impression sort le dossier entier**, quel que soit l'onglet regardé : le
 * récapitulatif d'abord, puis tous les bons. Les onglets servent à lire à
 * l'écran ; le papier, lui, part au fournil en un seul paquet. C'est aussi
 * pourquoi les deux vues restent dans le DOM et sont seulement masquées : une
 * vue détruite ne s'imprimerait pas.
 *
 * La production n'a pas d'écran de suivi, et le papier ne répond pas : si
 * l'imprimante manque de feuilles, une commande cesse d'exister pour le fournil
 * sans que personne l'apprenne. D'où le lot **compté**, chaque bon **numéroté**,
 * un tirage **reproductible à l'identique** (ordre par référence, commandes
 * déjà remises conservées), et les commandes **sans date de service annoncées**
 * — elles n'entrent dans aucun lot.
 */
@Component({
  selector: 'app-production-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FicheProduction,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './production-page.html',
  styleUrl: './production-page.scss',
})
export class ProductionPage {
  private readonly production = inject(ProductionService);
  private readonly catalog = inject(AdminCatalogService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly date = signal<string>(defaultDate());
  protected readonly view = signal<string>('recap');
  protected readonly views = VIEWS;

  private readonly batch = signal<ProductionBatchView | null>(null);
  private readonly catalogue = signal<readonly CatalogItemView[]>([]);

  protected readonly sheets = computed(() => this.batch()?.sheets ?? []);
  protected readonly undatedCount = computed(() => this.batch()?.undatedCount ?? 0);
  protected readonly recap = computed(() => productionRecap(this.sheets(), this.catalogue()));
  protected readonly pieces = computed(() => totalPieces(this.recap()));

  /** « samedi 16 août » — l'en-tête de chaque feuille. */
  protected readonly dayLabel = computed(() =>
    DAY_LABEL.format(new Date(`${this.date()}T00:00:00`)),
  );

  constructor() {
    effect(() => {
      void this.load(this.date());
    });
  }

  protected onDate(value: string): void {
    if (value !== '') {
      this.date.set(value);
    }
  }

  protected async load(date: string = this.date()): Promise<void> {
    this.state.set('loading');
    try {
      // Le catalogue part avec le lot : sans lui, le récapitulatif n'a pas de
      // rayons. Une lecture ratée du catalogue ne doit pas faire disparaître la
      // production — les produits tombent alors « hors catalogue ».
      const [batch, catalogue] = await Promise.all([
        this.production.batch(date),
        this.catalog.list().catch(() => []),
      ]);
      this.batch.set(batch);
      this.catalogue.set(catalogue);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /**
   * Ouvre le dialogue d'impression du navigateur. Rien de plus : la mise en page
   * est faite par la feuille `@media print`, donc ce qu'on voit à l'écran est ce
   * qui sort — il n'y a pas de second rendu qui pourrait mentir.
   */
  protected print(): void {
    window.print();
  }
}
