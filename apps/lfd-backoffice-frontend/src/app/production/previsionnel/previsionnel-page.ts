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
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldSurfaceDirective,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { AdminCatalogService } from '../../commandes/catalog.service';
import { ProductionService } from '../production.service';
import { DossierDuJour } from './dossier-du-jour/dossier-du-jour';
import { ForecastTable } from './forecast-table/forecast-table';
import { forecastRayons, totalOfRayons } from './previsionnel-matrix';
import { FORECAST_DAYS, forecastHeaders, isoDay, shiftDay, windowEnd } from './previsionnel-range';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Les deux lectures du soir, et l'ordre est celui du geste : on regarde ce qui
 * arrive, on arrête le plan de la journée qu'on vient de finir de prendre, puis
 * on tire son dossier. La matrice ouvre donc l'écran.
 */
const VIEWS: readonly FoldViewToggleOption[] = [
  { value: 'mur', label: 'Le mur qui arrive', icon: 'stats' },
  { value: 'dossier', label: 'Dossier du jour', icon: 'print' },
];

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
 * ⚠️ **Il porte pourtant UN geste depuis le 2026-09-13 — arrêter le plan.** Ce
 * n'est pas une entorse au paragraphe ci-dessus, et la distinction est tout le
 * sujet : arrêter ne CORRIGE aucun chiffre, il décide qu'une colonne cesse
 * d'être une prévision pour devenir un fait. C'est le geste que l'équipe fait
 * déjà — arrêter de prendre pour demain — et cet écran est le seul où l'on
 * regarde une journée en se demandant si elle est complète.
 *
 * 🔴 Il n'existait **nulle part**. La route de clôture était servie et testée,
 * et aucune interface ne l'appelait : le compte à produire restait donc vide en
 * exploitation, et la fiche d'atelier n'aurait jamais porté d'heure de tirage.
 * Une fonctionnalité entière ne manquait pas de code — elle manquait d'un
 * bouton.
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
  // 🔴 La classe suit la vue ouverte, et ELLE SEULE contraint la hauteur — cf.
  // le commentaire de `:host(.is-wall)` dans la feuille. Le dossier du jour,
  // qui part à l'imprimante tous les jours, reste en flux.
  host: { '[class.is-wall]': "view() === 'mur'" },
  imports: [
    DossierDuJour,
    ForecastTable,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldSurfaceDirective,
    FoldViewToggleComponent,
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

  /**
   * La lecture affichée. **Pas dans l'URL**, contrairement à la plage : celle-ci
   * se partage (« regarde la semaine du 3 »), alors qu'un onglet est une posture
   * de lecture, et un lien qui ouvrirait le dossier d'un jour que son propre
   * sélecteur choisit dirait deux journées à la fois.
   */
  protected readonly view = signal<string>('mur');
  protected readonly views = VIEWS;

  /** Le jour du poste, lu une fois : un écran de planning ne vit pas la nuit. */
  private readonly today = isoDay(new Date());

  /** La borne basse de la fenêtre — de l'URL si elle en porte une, sinon aujourd'hui. */
  protected readonly from = signal(this.route.snapshot.queryParamMap.get('from') ?? this.today);

  /** La matrice lue. Nommée `forecast` et non `view` : `view` est l'onglet. */
  private readonly forecast = signal<ProductionForecastView | null>(null);
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
    const forecast = this.forecast();
    return forecast === null ? [] : forecastRayons(forecast, this.catalogue(), !this.shelvesLost());
  });

  protected readonly headers = computed(() => {
    const forecast = this.forecast();
    return forecast === null ? [] : forecastHeaders(forecast.days, forecast.peakDate, this.today);
  });

  protected readonly pieces = computed(() => totalOfRayons(this.rayons()));

  /**
   * **La journée qu'on peut arrêter maintenant** : la plus proche **à venir**,
   * encore ouverte, et qui porte au moins une commande.
   *
   * 🔴 **Aujourd'hui est écarté**, et ce n'est pas un détail de confort
   * (corrigé le 2026-09-13, vu à l'écran) : le geste du soir arrête le service
   * du LENDEMAIN. Arrêter la journée en cours figerait le compte à produire
   * d'une fournée déjà au four, et une commande arrivée dans l'après-midi n'y
   * entrerait plus — alors qu'elle est encore servable. La bande proposait
   * « le plan du dimanche 13 » un dimanche 13.
   *
   * La plus proche, parce que le geste du soir vise le service suivant. Et
   * jamais une journée vide : `close` refuse d'arrêter le néant
   * (`ProductionDayEmptyError`), donc proposer le bouton là serait proposer un
   * refus. Naviguer d'une fenêtre à l'autre change la cible, ce qui rend toutes
   * les journées atteignables sans encombrer chaque colonne d'un bouton.
   *
   * `undefined` = rien à arrêter dans cette fenêtre, et la bande disparaît.
   */
  protected readonly dayToArrest = computed(() =>
    this.headers().find(
      (header) => header.date > this.today && !header.closed && header.orderCount > 0,
    ),
  );

  /**
   * La journée dont on a ouvert la confirmation — sa date, pas un booléen.
   *
   * Une date et non `true` : la fenêtre se déplace pendant qu'on hésite, et un
   * booléen laisserait la confirmation ouverte sur une AUTRE journée que celle
   * qu'on regardait en l'ouvrant.
   */
  protected readonly arrestingDay = signal<string | null>(null);

  /** L'arrêt est en cours — le bouton attend le serveur plutôt que de mentir. */
  protected readonly arresting = signal(false);

  /**
   * Ce que la dernière clôture a inscrit, ou ce qui l'a empêchée.
   *
   * Un CHIFFRE (« 14 commandes inscrites au plan »), jamais un « c'est fait » :
   * c'est la grammaire de tous les bandeaux de ce back-office, et c'est aussi
   * la seule façon de voir qu'on vient d'arrêter une journée à trois commandes
   * alors qu'on en attendait trente.
   */
  protected readonly arrestSaid = signal<string | null>(null);
  protected readonly arrestFailed = signal(false);

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

  /**
   * **Arrête le plan** de la journée visée, puis relit.
   *
   * On relit plutôt que de rapiécer la colonne : la clôture fait basculer les
   * commandes hors de `placed` côté commerce, donc la source de ce chiffre
   * CHANGE au passage — une mise à jour locale afficherait la prévision d'avant
   * sous l'étiquette d'un fait.
   *
   * Le refus « déjà arrêtée » n'est pas une erreur ici : quelqu'un d'autre
   * vient de le faire, et la bonne réponse est de relire l'écran, pas de
   * montrer une panne à celui qui a appuyé une seconde trop tard.
   */
  protected async arrest(date: string): Promise<void> {
    this.arresting.set(true);
    this.arrestFailed.set(false);
    this.arrestSaid.set(null);
    try {
      const closure = await this.production.closeDay(date);
      this.arrestSaid.set(
        closure.alreadyClosed
          ? 'Cette journée était déjà arrêtée — rien n’a été recalculé.'
          : `${closure.absorbed} commande${closure.absorbed > 1 ? 's' : ''} inscrite${
              closure.absorbed > 1 ? 's' : ''
            } au plan.`,
      );
      await this.load();
    } catch {
      // Le détail du refus n'est pas affiché : les deux cas possibles — journée
      // vide, journée déjà arrêtée — sont l'un impossible ici (on ne propose
      // que des journées qui portent des commandes) et l'autre traité plus
      // haut. Ce qui reste est une panne, et elle se dit comme telle.
      this.arrestFailed.set(true);
    } finally {
      this.arresting.set(false);
      this.arrestingDay.set(null);
    }
  }

  protected async load(from: string = this.from()): Promise<void> {
    this.state.set('loading');
    try {
      // Le catalogue part avec la matrice : sans lui, la grille n'a pas de
      // rayons. Une lecture ratée ne doit pas faire disparaître le prévisionnel
      // — mais elle ne doit pas se taire non plus, d'où le `null` plutôt qu'un
      // tableau vide : les deux se lisent pareil à l'affichage, et un seul des
      // deux est une panne.
      const [forecast, catalogue] = await Promise.all([
        this.production.forecast(from, windowEnd(from)),
        this.catalog.list().catch(() => null),
      ]);
      this.forecast.set(forecast);
      this.shelvesLost.set(catalogue === null);
      this.catalogue.set(catalogue ?? []);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
