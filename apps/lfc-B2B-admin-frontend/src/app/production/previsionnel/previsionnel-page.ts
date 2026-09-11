import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { CatalogItemView, ProductionForecastView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldSurfaceDirective,
} from 'fold-ng';

import { AdminCatalogService } from '../../commandes/catalog.service';
import { ProductionService } from '../production.service';
import { forecastRayons, totalOfRayons } from './previsionnel-matrix';
import { FORECAST_DAYS, forecastHeaders, isoDay, shiftDay, windowEnd } from './previsionnel-range';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Au-delà de ce nombre de références, la grille passe en **densité réduite**.
 *
 * La maquette tient à 22 lignes ; vers la quarantaine, la matrice déborde en
 * hauteur et l'écran perd sa raison d'être — on ne voit plus la période d'un
 * coup. Replier les rayons reste le geste principal ; ce seuil-ci est ce qui
 * agit **sans qu'on demande rien**, pour que le premier affichage tienne.
 */
const DENSE_ABOVE = 24;

/**
 * **Le prévisionnel** — la matrice `produits × jours` du fournil.
 *
 * ## La question de l'écran
 *
 * Celui qui l'ouvre ne cherche pas ce qu'il doit faire maintenant — c'est sur la
 * fiche d'atelier, et c'est déjà au four. Il cherche **le mur qui arrive** : le
 * samedi à 3 800 pièces, le week-end à couvrir, la commande qui double une
 * ligne. D'où sept colonnes ÉGALES — le jour courant est marqué, pas privilégié
 * —, des quantités qui dominent le nom du produit, et **une seule colonne
 * teintée** : le pic. Teinter le pic, le jour courant et les week-ends rendrait
 * la grille illisible ; le pic gagne parce que c'est ce qu'on vient chercher.
 *
 * ## Ce que l'écran ne fait pas
 *
 * **Aucune saisie.** Le prévisionnel lit, il ne corrige pas : une quantité
 * fausse se corrige sur la commande. Un champ éditable ici créerait une seconde
 * source de vérité, et c'est celle-ci qu'on croirait.
 *
 * **Aucun montant**, comme la fiche d'atelier et le bon de livraison. Le contrat
 * n'en porte pas : il n'y a rien à laisser tomber par distraction.
 *
 * ## La plage vit dans l'URL
 *
 * `?from=` pour qu'un lien soit partageable — « regarde la semaine du 3 »
 * s'envoie, au lieu de se décrire. Elle est **glissante** : elle commence
 * aujourd'hui, pas lundi. Un fournil ne raisonne pas en semaine calendaire, il
 * raisonne en jours à couvrir.
 */
@Component({
  selector: 'app-previsionnel-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldSurfaceDirective,
  ],
  templateUrl: './previsionnel-page.html',
  styleUrl: './previsionnel-page.scss',
})
export class PrevisionnelPage {
  private readonly production = inject(ProductionService);
  private readonly catalog = inject(AdminCatalogService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly state = signal<LoadState>('loading');

  /** Le jour du poste, lu une fois : un écran de planning ne vit pas la nuit. */
  private readonly today = isoDay(new Date());

  /** La borne basse de la fenêtre — de l'URL si elle en porte une, sinon aujourd'hui. */
  protected readonly from = signal(this.route.snapshot.queryParamMap.get('from') ?? this.today);

  private readonly view = signal<ProductionForecastView | null>(null);
  private readonly catalogue = signal<readonly CatalogItemView[]>([]);

  /**
   * 🔴 La lecture du catalogue a-t-elle échoué ?
   *
   * Elle ne fait pas tomber l'écran — le prévisionnel reste juste sans elle —
   * mais elle ne peut pas passer en silence : sans catalogue, chaque SKU tombe
   * dans le groupe des produits absents, et la grille affirmerait que le
   * fournil fabrique des articles retirés de la vente.
   */
  protected readonly shelvesLost = signal(false);

  protected readonly rayons = computed(() => {
    const view = this.view();
    return view === null ? [] : forecastRayons(view, this.catalogue(), !this.shelvesLost());
  });

  /** Les rayons repliés — l'issue du débordement, et un geste de l'équipe. */
  private readonly folded = signal<ReadonlySet<string>>(new Set());

  protected readonly headers = computed(() => {
    const view = this.view();
    return view === null ? [] : forecastHeaders(view.days, view.peakDate, this.today);
  });

  protected readonly pieces = computed(() => totalOfRayons(this.rayons()));
  protected readonly references = computed(() =>
    this.rayons().reduce((sum, rayon) => sum + rayon.lines.length, 0),
  );

  /** La grille se resserre d'elle-même quand elle devient trop haute. */
  protected readonly dense = computed(() => this.references() > DENSE_ABOVE);

  /** `230px` pour le produit, puis des colonnes strictement égales. */
  protected readonly columns = computed(
    () => `230px repeat(${String(this.headers().length)}, minmax(0, 1fr))`,
  );

  /** « du 3 au 9 septembre » — la plage, dite comme on la dit. */
  protected readonly windowLabel = computed(() => {
    const headers = this.headers();
    const first = headers[0];
    const last = headers[headers.length - 1];
    return first === undefined || last === undefined
      ? ''
      : `du ${first.dayMonth} au ${last.dayMonth}`;
  });

  constructor() {
    effect(() => {
      void this.load(this.from());
    });
  }

  protected isFolded(label: string): boolean {
    return this.folded().has(label);
  }

  /** Replie ou déplie un rayon. Le geste est par rayon, pas global : on garde
   *  celui qu'on travaille et on range les autres. */
  protected toggleRayon(label: string): void {
    const folded = new Set(this.folded());
    if (!folded.delete(label)) {
      folded.add(label);
    }
    this.folded.set(folded);
  }

  /** Une fenêtre en avant ou en arrière — sept jours, pas une semaine calendaire. */
  protected shift(weeks: number): void {
    this.go(shiftDay(this.from(), weeks * FORECAST_DAYS));
  }

  /** Retour à la fenêtre glissante qui commence aujourd'hui. */
  protected backToToday(): void {
    this.go(this.today);
  }

  protected get atToday(): boolean {
    return this.from() === this.today;
  }

  /**
   * Déplace la fenêtre ET l'URL ensemble.
   *
   * `replaceUrl` : naviguer de fenêtre en fenêtre n'est pas une suite d'écrans,
   * et empiler dix entrées d'historique ferait du bouton « précédent » un
   * défilement à rebours dont on ne sortirait plus.
   */
  private go(from: string): void {
    this.from.set(from);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { from },
      replaceUrl: true,
    });
  }

  protected async load(from: string = this.from()): Promise<void> {
    this.state.set('loading');
    try {
      // Le catalogue part avec la matrice : sans lui, la grille n'a pas de
      // rayons. Une lecture ratée ne doit pas faire disparaître le prévisionnel
      // — mais elle ne doit pas se taire non plus, d'où le `null` plutôt qu'un
      // tableau vide : les deux se lisent pareil à l'affichage, et un seul des
      // deux est une panne.
      const [view, catalogue] = await Promise.all([
        this.production.forecast(from, windowEnd(from)),
        this.catalog.list().catch(() => null),
      ]);
      this.view.set(view);
      this.shelvesLost.set(catalogue === null);
      this.catalogue.set(catalogue ?? []);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
