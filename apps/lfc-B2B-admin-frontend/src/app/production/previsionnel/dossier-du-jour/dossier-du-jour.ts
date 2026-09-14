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

import { AdminCatalogService } from '../../../commandes/catalog.service';
import { FicheProduction } from '../../fiche-production/fiche-production';
import { productionRecap, totalPieces } from '../../production-recap';
import { ProductionService } from '../../production.service';

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
 * **Le dossier du jour** : ce qu'il y a à fabriquer pour une journée, et pour
 * qui — récapitulatif d'abord, puis un bon par commande.
 *
 * ## Pourquoi il vit dans le prévisionnel (déménagé le 2026-09-13)
 *
 * C'est **le même geste du soir** : on arrête le plan d'une journée, et on tire
 * son dossier dans la foulée. Il ouvrait auparavant la « Fournée du jour », aux
 * côtés de la fiche d'atelier — mais celle-ci est un écran de MATIN, allumé
 * toute la fournée, tandis que le dossier est un tirage, fait une fois, la
 * veille au soir. Les deux ne se lisent jamais en même temps.
 *
 * 🔴 **Sa journée est la SIENNE**, et ne se déduit pas de la fenêtre de sept
 * jours du prévisionnel. Deux états distincts, délibérément : la fenêtre est une
 * plage qu'on fait glisser pour voir venir, le dossier est UN service qu'on
 * tire. Les fusionner ferait imprimer le lundi parce qu'on regardait la semaine
 * qui commence lundi. D'où son propre sélecteur, et son propre défaut — demain,
 * le service suivant.
 *
 * ## L'impression sort le dossier ENTIER
 *
 * Quel que soit l'onglet regardé : le récapitulatif d'abord, puis tous les bons.
 * Les onglets servent à lire à l'écran ; le papier, lui, part au fournil en un
 * seul paquet. C'est aussi pourquoi les deux vues restent dans le DOM et sont
 * seulement masquées : **une vue détruite ne s'imprimerait pas**.
 *
 * La production n'a pas d'écran de suivi, et le papier ne répond pas : si
 * l'imprimante manque de feuilles, une commande cesse d'exister pour le fournil
 * sans que personne l'apprenne. D'où le lot **compté**, chaque bon **numéroté**,
 * et un tirage **reproductible à l'identique** (ordre par référence, commandes
 * déjà remises conservées).
 *
 * Le lot est **exhaustif par construction** : aucune commande ne peut être
 * passée sans jour de retrait/livraison. Rien à signaler ici sur les commandes
 * qui manqueraient — il ne peut pas y en avoir.
 */
@Component({
  selector: 'app-dossier-du-jour',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FicheProduction,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './dossier-du-jour.html',
  styleUrl: './dossier-du-jour.scss',
})
export class DossierDuJour {
  private readonly production = inject(ProductionService);
  private readonly catalog = inject(AdminCatalogService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly date = signal<string>(defaultDate());
  protected readonly view = signal<string>('recap');
  protected readonly views = VIEWS;

  private readonly batch = signal<ProductionBatchView | null>(null);
  private readonly catalogue = signal<readonly CatalogItemView[]>([]);

  protected readonly sheets = computed(() => this.batch()?.sheets ?? []);
  /**
   * 🔴 La lecture du catalogue a-t-elle échoué ?
   *
   * Elle ne fait pas tomber l'écran — le lot reste juste sans elle — mais elle
   * ne peut pas passer en silence : sans catalogue, chaque SKU tombe dans le
   * groupe des produits absents, et la feuille affirmerait que le fournil
   * fabrique des articles retirés de la vente.
   */
  protected readonly shelvesLost = signal(false);

  protected readonly recap = computed(() =>
    productionRecap(this.sheets(), this.catalogue(), !this.shelvesLost()),
  );
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
      // rayons. Une lecture ratée ne doit pas faire disparaître la production —
      // mais elle ne doit pas se taire non plus, d'où le `null` plutôt qu'un
      // tableau vide : les deux se lisent pareil à l'affichage, et un seul des
      // deux est une panne.
      const [batch, catalogue] = await Promise.all([
        this.production.batch(date),
        this.catalog.list().catch(() => null),
      ]);
      this.batch.set(batch);
      this.shelvesLost.set(catalogue === null);
      this.catalogue.set(catalogue ?? []);
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
