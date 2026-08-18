import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { PriceTemplateKind, PricingBoardView, PricingCategoryView } from '@lfd/contracts';
import { formatEuros } from '@lfd/catalog-ui';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldInputComponent,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { nativeValue } from '../../../shared/native-input';
import { TarificationService } from '../../../reglages/tarification/tarification.service';
import { PriceTemplatesService } from '../templates.service';
import { PoseBar, type PoseRequest } from '../pose-bar/pose-bar';
import { eurosField } from './price-field';
import {
  entryOf,
  tiersOf,
  toLines,
  withTiers,
  without,
  type DraftGrid,
  type DraftTier,
} from './draft-grid';
import { mercurialeRow, tally, type MercurialeRow } from './mercuriale-row';

/**
 * Le segment d'URL de chaque nature.
 *
 * Une table plutôt qu'une interpolation : « devis » ne prend pas de `s`, et un
 * gabarit enregistré aurait atterri sur une route qui n'existe pas — après un
 * `replaceUrl`, donc sans retour possible.
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
    PoseBar,
  ],
  templateUrl: './gabarit-grille-page.html',
  styleUrl: './gabarit-grille-page.scss',
})
export class GabaritGrillePage {
  /** `nouveau` = on compose ; sinon on révise ce gabarit. */
  readonly id = input.required<string>();
  readonly kind = input.required<PriceTemplateKind>();

  private readonly templates = inject(PriceTemplatesService);
  private readonly tarification = inject(TarificationService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  protected readonly euros = formatEuros;
  // `nativeValue` et non `$any($event.target)` : le second compile et ment au
  // compilateur, et c'est exactement ce que la convention interdit.
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
      this.board.set(await this.tarification.read());
      if (!this.isNew()) {
        const template = await this.templates.byId(this.id());
        this.label.set(template.label);
        this.saved.set(template.id);
        this.draft.set(
          new Map(
            template.lines.map((line): [string, readonly DraftTier[]] => [
              line.sku,
              line.tiers.map((tier) => ({
                minQuantity: String(tier.minQuantity),
                unitPrice: eurosField(tier.unitPriceCents),
              })),
            ]),
          ),
        );
      }
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Les lignes d'un rayon, dérivées — le prix d'entrée pilote les colonnes de droite. */
  protected rowsOf(category: PricingCategoryView): readonly MercurialeRow[] {
    return category.items.map((item) => mercurialeRow(item, entryOf(this.draft(), item.sku)));
  }

  protected tiersOf(sku: string): readonly DraftTier[] {
    return tiersOf(this.draft(), sku);
  }

  /**
   * Tarifer un article : un palier **à partir de 1**, préparé au tarif catalogue.
   *
   * C'est déjà un prix fixe — le prix fixe n'est pas un mode, c'est la grille à
   * un palier. Partir du catalogue plutôt que du vide : une mercuriale se
   * négocie en descendant depuis un prix connu.
   */
  protected priceIt(sku: string, catalogCents: number): void {
    this.draft.update((grid) =>
      withTiers(grid, sku, [{ minQuantity: '1', unitPrice: eurosField(catalogCents) }]),
    );
  }

  protected clear(sku: string): void {
    this.draft.update((grid) => without(grid, sku));
  }

  /** Un palier de plus : le seul geste qui fait passer d'un prix fixe à une grille. */
  protected addTier(sku: string): void {
    this.draft.update((grid) =>
      withTiers(grid, sku, [...tiersOf(grid, sku), { minQuantity: '', unitPrice: '' }]),
    );
  }

  protected removeTier(sku: string, index: number): void {
    this.draft.update((grid) =>
      withTiers(
        grid,
        sku,
        tiersOf(grid, sku).filter((_, position) => position !== index),
      ),
    );
  }

  protected setTier(
    sku: string,
    index: number,
    field: 'minQuantity' | 'unitPrice',
    value: string,
  ): void {
    this.draft.update((grid) =>
      withTiers(
        grid,
        sku,
        tiersOf(grid, sku).map((tier, position) =>
          position === index ? { ...tier, [field]: value } : tier,
        ),
      ),
    );
  }

  /** Les lignes prêtes à partir — cf. `toLines` pour ce qui s'oublie et ce qui tombe. */
  protected readonly lines = computed(() => toLines(this.draft()));

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
   * **Poser la grille chez un client**, depuis l'en-tête.
   *
   * Ce qui est posé est ce qu'on a sous les yeux : le contenu ne se re-choisit
   * pas, et il n'y a rien à confirmer dans un tiroir. Un **recouvrement arrête
   * la pose** — si le client a déjà une mercuriale sur un de ces articles à ce
   * seuil pour cette période, le serveur refuse plutôt que d'écraser une
   * décision déjà prise.
   */
  /**
   * **Poser la grille chez un client**, sur demande de la barre d'en-tête.
   *
   * Un **recouvrement arrête la pose** : si le client a déjà une mercuriale sur
   * un de ces articles à ce seuil pour cette période, le serveur refuse plutôt
   * que d'écraser une décision déjà prise. C'est la barre qui l'annonce, et le
   * serveur qui le garantit.
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

  protected percent(bp: number): string {
    return `${bp > 0 ? '−' : '+'}${(Math.abs(bp) / 100).toFixed(1).replace('.', ',')} %`;
  }

  protected direction(bp: number): 'down' | 'up' | 'flat' {
    if (bp === 0) {
      return 'flat';
    }
    return bp > 0 ? 'down' : 'up';
  }
}
