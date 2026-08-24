import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type {
  MercurialeBenchmarkView,
  PriceTemplateKind,
  PricingBoardView,
  PricingCategoryView,
} from '@lfd/contracts';
import { formatEuros } from '@lfd/catalog-ui';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldInputComponent,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { nativeValue } from '../../../shared/native-input';
import { TarificationService } from '../../../b2b/tarification/tarification.service';
import { PriceTemplatesService } from '../templates.service';
import { PoseBar, type PoseRequest } from '../pose-bar/pose-bar';
import { eurosField } from './price-field';
import {
  addTier,
  draftFromLines,
  entryOf,
  priceAt,
  removeTier,
  setTierField,
  tiersOf,
  toLines,
  volumeOf,
  volumesFromLines,
  withVolume,
  without,
  type DraftGrid,
  type DraftTier,
  type PlannedVolumes,
} from './draft-grid';
import {
  impactDirection,
  impactLabel,
  mercurialeRow,
  tally,
  type MercurialeRow,
} from './mercuriale-row';
import { ArticleSimulation } from '../simulation/article-simulation/article-simulation';
import { MercurialeMix } from '../simulation/mercuriale-mix/mercuriale-mix';
import { piercingRuleLabels } from '../simulation/piercing-rules';
import { mixArticlesOf } from '../simulation/mercuriale-mix';
import { gridRowOf, locateSimulation } from '../simulation/locate-simulation';
import type { ScenarioTier } from '../simulation/revenue-model';

/**
 * Le segment d'URL de chaque nature. Une table et non une interpolation :
 * « devis » ne prend pas de `s`, et le gabarit enregistré aurait atterri sur une
 * route inexistante — après un `replaceUrl`, donc sans retour.
 */
const SEGMENT: Readonly<Record<PriceTemplateKind, string>> = {
  mercuriale: 'mercuriales-templates',
  devis: 'devis-templates',
};

/**
 * **La grille d'un gabarit** — le même layout que la tarification générale.
 *
 * C'est délibérément la MÊME lecture : des rayons, une ligne par article, et des
 * colonnes qui se lisent de gauche à droite comme le prix se construit. Le
 * commercial qui négocie une mercuriale regarde le catalogue de la même façon
 * que celui qui règle les prix publics ; deux mises en page pour la même question
 * auraient obligé à réapprendre où lire le plancher.
 *
 * Les colonnes remplacent seulement le milieu : là où la grille générale montre
 * les altérations de famille et de produit, celle-ci montre **le prix négocié**.
 * Le reste — limite, marge de négoce, impact, prix final — est identique, parce
 * que ce sont les mêmes questions.
 *
 * **Aucun panneau par article.** La grille s'édite dans la grille : un panneau
 * par ligne aurait fait perdre la comparaison au catalogue au moment précis où
 * elle sert, et rendu invisible ce qu'on vient de faire aux quatre-vingt-onze
 * autres articles.
 */
@Component({
  selector: 'app-gabarit-grille-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldInputComponent,
    ArticleSimulation,
    MercurialeMix,
    PoseBar,
  ],
  templateUrl: './gabarit-grille-page.html',
  styleUrl: './gabarit-grille-page.scss',
})
export class TemplateGridPage {
  /** `nouveau` = on compose ; sinon on révise ce gabarit. */
  readonly id = input.required<string>();
  readonly kind = input.required<PriceTemplateKind>();

  private readonly templates = inject(PriceTemplatesService);
  private readonly tarification = inject(TarificationService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  protected readonly euros = formatEuros;
  protected readonly percent = impactLabel;
  protected readonly direction = impactDirection;
  // `nativeValue` et non `$any($event.target)` : le second ment au compilateur.
  protected readonly nativeValue = nativeValue;

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly saving = signal(false);
  protected readonly label = signal('');
  /** Le tableau tarifaire : rayons, articles, tarifs et limites. La MÊME source. */
  protected readonly board = signal<PricingBoardView | null>(null);
  /** Les paliers saisis, par SKU. Absent = article non tarifé par ce gabarit. */
  protected readonly draft = signal<DraftGrid>(new Map());
  /** L'identifiant réel, une fois le gabarit composé. */
  protected readonly saved = signal<string | null>(null);

  /** Vrai pendant la pose : la barre l'affiche, la page le sait. */
  protected readonly posing = signal(false);

  /** L'article simulé. **Un seul à la fois** : le chiffre de deux articles ne
   * se lit pas sur la même échelle. */
  protected readonly simulated = signal<string | null>(null);

  /** Les volumes prévus, **tenus par la grille** : ils alimentent le partage en
   * tête de page ET la simulation. Deux champs auraient divergé. */
  protected readonly volumes = signal<PlannedVolumes>(new Map());

  /** Ce que les autres clients paient déjà, par SKU. Vide = rien en place. */
  private readonly benchmark = signal<ReadonlyMap<string, MercurialeBenchmarkView>>(new Map());

  protected readonly categories = computed(() => this.board()?.categories ?? []);
  protected readonly isNew = computed(() => this.id() === 'nouveau');
  protected readonly posable = computed(
    () => this.kind() === 'mercuriale' && this.saved() !== null,
  );
  protected readonly canSave = computed(
    () => this.label().trim() !== '' && this.lines().length > 0 && !this.saving(),
  );

  /** Ce que la grille pèse, en tête de page — comme le bandeau de la générale. */
  protected readonly summary = computed(() =>
    tally(this.categories().flatMap((category) => this.rowsOf(category))),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      const [board, benchmark] = await Promise.all([
        this.tarification.read(),
        this.templates.benchmark(),
      ]);
      this.board.set(board);
      this.benchmark.set(new Map(benchmark.map((entry) => [entry.sku, entry])));
      if (!this.isNew()) {
        const template = await this.templates.byId(this.id());
        this.label.set(template.label);
        this.saved.set(template.id);
        this.draft.set(draftFromLines(template.lines));
        this.volumes.set(volumesFromLines(template.lines));
      }
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Les lignes d'un rayon, dérivées — le prix d'entrée pilote les colonnes de droite. */
  protected rowsOf(category: PricingCategoryView): readonly MercurialeRow[] {
    return category.items.map((item) =>
      mercurialeRow(item, entryOf(this.draft(), item.sku), this.benchmark().get(item.sku) ?? null),
    );
  }

  /** Les promotions qui s'ajoutent PAR-DESSUS une mercuriale : la courbe les ignore. */
  protected readonly piercing = computed(() => piercingRuleLabels(this.board()));

  /** Le plan tel que le partage en tête de page le lit. */
  protected readonly mixArticles = computed(() =>
    mixArticlesOf(this.categories(), this.lines(), this.volumes()),
  );

  protected plannedVolumeOf(sku: string): number {
    return volumeOf(this.volumes(), sku);
  }

  protected setPlannedVolume(sku: string, raw: string): void {
    this.volumes.update((current) => withVolume(current, sku, raw));
  }

  protected readonly slot = computed(() => locateSimulation(this.categories(), this.simulated()));

  /** La rangée d'une ligne, le bloc de simulation compris. */
  protected rowOf(categoryId: string, index: number): number {
    return gridRowOf(this.slot(), categoryId, index);
  }

  /** Les paliers simulés : ceux que le SERVEUR accepterait, pas ceux qui sont à
   * l'écran — un palier à moitié tapé ne doit pas faire bouger la courbe. */
  protected readonly simulatedTiers = computed<readonly ScenarioTier[]>(() => {
    const sku = this.simulated();
    return sku === null ? [] : (this.lines().find((line) => line.sku === sku)?.tiers ?? []);
  });

  protected toggleSimulation(sku: string): void {
    this.simulated.update((current) => (current === sku ? null : sku));
  }

  protected tiersOf(sku: string): readonly DraftTier[] {
    return tiersOf(this.draft(), sku);
  }

  protected priceIt(sku: string, catalogCents: number): void {
    this.draft.update((grid) => priceAt(grid, sku, eurosField(catalogCents)));
  }

  protected clear(sku: string): void {
    this.draft.update((grid) => without(grid, sku));
  }

  protected addTier(sku: string): void {
    this.draft.update((grid) => addTier(grid, sku));
  }

  protected removeTier(sku: string, index: number): void {
    this.draft.update((grid) => removeTier(grid, sku, index));
  }

  protected setTier(
    sku: string,
    index: number,
    field: 'minQuantity' | 'unitPrice',
    value: string,
  ): void {
    this.draft.update((grid) => setTierField(grid, sku, index, field, value));
  }

  /** Les lignes prêtes à partir — cf. `toLines` pour ce qui s'oublie et ce qui tombe. */
  protected readonly lines = computed(() => toLines(this.draft(), this.volumes()));

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    try {
      const payload = { kind: this.kind(), label: this.label().trim(), lines: [...this.lines()] };
      const current = this.saved();
      if (current === null) {
        const { id } = await this.templates.compose(payload);
        this.saved.set(id);
        // L'URL suit l'objet : recharger la page d'un gabarit enregistré ne doit
        // pas rouvrir un brouillon vide.
        await this.router.navigate(['/commercial/tarification', SEGMENT[this.kind()], id], {
          replaceUrl: true,
        });
      } else {
        await this.templates.revise(current, payload);
      }
      this.notify.success('Gabarit enregistré.');
    } catch (error) {
      this.notify.error(error, "Le gabarit n'a pas pu être enregistré.");
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * **Poser la grille chez un client**, sur demande de la barre d'en-tête. Un
   * **recouvrement arrête la pose** : si le client a déjà une mercuriale sur un
   * de ces articles à ce seuil pour cette période, le serveur refuse plutôt que
   * d'écraser une décision prise. La barre l'annonce, le serveur le garantit.
   */
  protected async pose(request: PoseRequest): Promise<void> {
    const id = this.saved();
    if (id === null) {
      return;
    }
    this.posing.set(true);
    try {
      const { posedRules } = await this.templates.apply(id, request);
      this.notify.success(`${String(posedRules)} règle(s) de mercuriale posée(s).`);
    } catch (error) {
      this.notify.error(error, "La grille n'a pas pu être posée.");
    } finally {
      this.posing.set(false);
    }
  }
}
