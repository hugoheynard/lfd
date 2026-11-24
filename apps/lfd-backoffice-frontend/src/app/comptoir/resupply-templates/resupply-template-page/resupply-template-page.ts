import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { requiredError } from '@angular/forms/signals';
import { Router } from '@angular/router';
import type {
  ResupplyArticleView,
  ResupplyTarget,
  ResupplyTemplateContentPayload,
  ResupplyTemplateLineView,
  ResupplyTemplateView,
} from '@lfd/contracts';
import { httpErrorCode, httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDangerZoneComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldSearchComponent,
  FoldTimeComponent,
  FoldViewToggleComponent,
  type FoldTableColumn,
} from 'fold-ng';

import { PickupAddressesService } from '../../../b2b/reglages/pickup-addresses.service';
import {
  ALL_FAMILIES,
  articlesMatching,
  familyOptionsOf,
} from '../../../production/reassorts-a-produire/bakehouse-resupply-card/article-filters';
import { withQuantity } from '../../../production/reassorts-a-produire/bakehouse-resupply-card/bakehouse-resupply-lines';
import { BakehouseQuantityStepper } from '../../../production/reassorts-a-produire/bakehouse-quantity-stepper/bakehouse-quantity-stepper';
import { SaleQuantityPipe } from '../../../shared/sale-quantity/sale-quantity.pipe';
import { narrowViewport } from '../../../shared/viewport/narrow-viewport';
import { ResupplyReceiptsService } from '../../reassort-boutique-page/resupply-receipts.service';
import { compositionOf, LINE_ISSUE_LABELS, templateLines } from '../resupply-template-composition';
import { ResupplyTemplatesStore } from '../resupply-templates.store';

/** Le téléphone — le même seuil que la table du fournil. */
const PHONE_QUERY = '(max-width: 768px)';

const COLUMNS: readonly FoldTableColumn<ResupplyArticleView>[] = [
  { key: 'family', label: 'Famille' },
  { key: 'product', label: 'Produit' },
  { key: 'quantity', label: 'Quantité', align: 'right' },
];

/** Les deux visées proposées à l'application, dans l'ordre de la table du fournil. */
const TARGET_OPTIONS = [
  { value: 'tomorrow', label: 'Pour demain' },
  { value: 'asap', label: 'Au plus tôt' },
] as const;

/** Les codes de refus que la page sait placer. */
const NAME_TAKEN = 'resupply.template.name_taken';
const NAME_REQUIRED = 'resupply.template.name_required';
const CHANGED_MEANWHILE = 'resupply.template.changed_meanwhile';
/** Les refus de l'heure (forme, ou heure sur un « au plus tôt ») : dits sur le champ. */
const ARRIVAL_REFUSALS: ReadonlySet<string> = new Set([
  'resupply.arrival.invalid',
  'resupply.arrival.asap',
]);
/** L'écran des modèles, hors de `/comptoir/reassort` : son onglet ne s'y allume pas. */
const TEMPLATES_URL = '/comptoir/modeles-reassort';

/**
 * **Composer un modèle de réassort** — le créer
 * (`/comptoir/modeles-reassort/:siteId/nouveau`) ou l'ajuster
 * (`…/:siteId/:templateId`) : son nom, sa visée proposée, et une quantité par
 * article dans la table du catalogue du réassort, filtrée par famille — les
 * briques de « Envoyer un réassort » du fournil.
 *
 * Les lignes inapplicables (article retiré, unité changée) restent visibles à
 * part et s'enregistrent telles quelles tant qu'on ne les retire pas : le
 * modèle n'est jamais corrigé en douce.
 *
 * Un ajustement porte la version lue. Si un autre poste a écrit entre-temps
 * (409), la page relit le modèle, l'affiche, et le dit ; un nom déjà pris
 * (409) se dit sur le champ.
 */
@Component({
  selector: 'app-resupply-template-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BakehouseQuantityStepper,
    FoldBackLinkComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDangerZoneComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldSearchComponent,
    FoldTimeComponent,
    FoldViewToggleComponent,
    SaleQuantityPipe,
  ],
  providers: [ResupplyTemplatesStore],
  templateUrl: './resupply-template-page.html',
  styleUrl: './resupply-template-page.scss',
})
export class ResupplyTemplatePage {
  private readonly store = inject(ResupplyTemplatesStore);
  private readonly receipts = inject(ResupplyReceiptsService);
  private readonly pickups = inject(PickupAddressesService);
  private readonly router = inject(Router);

  /** Le point de la bibliothèque (segment de route). */
  readonly siteId = input.required<string>();
  /** Le modèle à ajuster ; absent : un modèle neuf. */
  readonly templateId = input<string | undefined>(undefined);

  protected readonly phone = narrowViewport(PHONE_QUERY);
  protected readonly articles = signal<readonly ResupplyArticleView[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly siteLabel = signal<string | null>(null);
  /** Le modèle demandé n'est pas (ou plus) dans la bibliothèque du point. */
  protected readonly missing = signal(false);
  /** La version lue du modèle ajusté ; `null` : un modèle neuf. */
  protected readonly version = signal<number | null>(null);

  protected readonly name = signal('');
  /** Le refus du serveur sur le nom (pris, ou vide) ; vidé à la saisie. */
  protected readonly nameRefusal = signal<string | null>(null);
  protected readonly target = signal<ResupplyTarget>('tomorrow');
  /**
   * L'heure d'arrivée proposée (`HH:MM`), facultative, pour un modèle « pour
   * demain » seulement ; vide : aucune. Recopiée à l'application, jamais liée.
   */
  protected readonly arrivalBy = signal('');
  /** Le refus du serveur sur l'heure ; vidé à la saisie. */
  protected readonly arrivalRefusal = signal<string | null>(null);
  protected readonly targetOptions = TARGET_OPTIONS;
  protected readonly quantities = signal<ReadonlyMap<string, number>>(new Map());
  protected readonly stale = signal<readonly ResupplyTemplateLineView[]>([]);
  protected readonly issueLabels = LINE_ISSUE_LABELS;

  protected readonly query = signal('');
  protected readonly family = signal<string>(ALL_FAMILIES);
  protected readonly pending = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly done = signal<string | null>(null);

  protected readonly isNew = computed(() => this.templateId() === undefined);
  protected readonly back = computed(() => ({ point: this.siteId() }));
  /**
   * Le retour garde le point (`?point=`) : `fold-back-link` ne porte pas de
   * paramètres de requête sur son `routerLink` (vérifié dans `fold-ng.d.ts`
   * le 2026-11-19). Il prend donc l'adresse entière en `href` — un clic du
   * milieu ouvre le bon écran — et un clic simple navigue par le routeur.
   */
  protected readonly backUrl = computed(() =>
    this.router.serializeUrl(
      this.router.createUrlTree([TEMPLATES_URL], { queryParams: this.back() }),
    ),
  );
  protected readonly pageTitle = computed(() => {
    const site = this.siteLabel();
    const base = this.isNew() ? 'Nouveau modèle' : 'Ajuster le modèle';
    return site === null ? base : `${base} — ${site}`;
  });

  protected readonly nameErrors = computed(() => {
    const refusal = this.nameRefusal();
    return refusal === null ? [] : [requiredError({ message: refusal })];
  });
  protected readonly arrivalErrors = computed(() => {
    const refusal = this.arrivalRefusal();
    return refusal === null ? [] : [requiredError({ message: refusal })];
  });
  protected readonly familyOptions = computed(() =>
    familyOptionsOf(this.articles() ?? [], this.quantities()),
  );
  protected readonly visibleArticles = computed(() =>
    articlesMatching(this.articles() ?? [], this.family(), this.query()),
  );
  protected readonly columns = computed(() =>
    this.phone() ? COLUMNS.filter((column) => column.key !== 'family') : COLUMNS,
  );
  protected readonly skuOf = (article: ResupplyArticleView): string => article.sku;
  protected readonly nothingFound = { title: 'Aucun produit ne correspond.' };

  /** Ce qui s'enregistre : la table, puis les lignes inapplicables gardées. */
  protected readonly lines = computed(() =>
    templateLines(this.articles() ?? [], this.quantities(), this.stale()),
  );
  protected readonly canSave = computed(
    () => !this.pending() && !this.missing() && this.lines().length > 0,
  );

  constructor() {
    effect(() => {
      const siteId = this.siteId();
      const templateId = this.templateId();
      untracked(() => void this.load(siteId, templateId));
    });
  }

  protected async load(
    siteId: string = this.siteId(),
    templateId: string | undefined = this.templateId(),
  ): Promise<void> {
    this.loadFailed.set(false);
    this.missing.set(false);
    try {
      const [articles, sites] = await Promise.all([
        this.receipts.articles(),
        this.pickups.list(),
        templateId === undefined ? Promise.resolve() : this.store.open(siteId),
      ]);
      this.siteLabel.set(sites.find((site) => site.id === siteId)?.label ?? null);
      if (templateId !== undefined && this.store.loadError() !== null) {
        this.loadFailed.set(true);
        return;
      }
      this.articles.set(articles);
    } catch {
      this.loadFailed.set(true);
      return;
    }
    if (templateId !== undefined) {
      this.take(templateId);
    }
  }

  /** Recopie le modèle lu dans le formulaire ; absent, la page le dit. */
  private take(templateId: string): void {
    const template = this.store.find(templateId);
    if (template === undefined) {
      this.missing.set(true);
      return;
    }
    this.fill(template);
  }

  private fill(template: ResupplyTemplateView): void {
    const composition = compositionOf(template);
    this.name.set(template.name);
    this.target.set(template.target);
    this.arrivalBy.set(template.arrivalBy ?? '');
    this.arrivalRefusal.set(null);
    this.quantities.set(composition.quantities);
    this.stale.set(composition.stale);
    this.version.set(template.version);
    this.nameRefusal.set(null);
  }

  protected typeName(name: string): void {
    this.name.set(name);
    this.nameRefusal.set(null);
  }

  protected pickTarget(target: string): void {
    if (target === 'asap' || target === 'tomorrow') {
      this.target.set(target);
    }
  }

  protected typeArrival(arrivalBy: string): void {
    this.arrivalBy.set(arrivalBy);
    this.arrivalRefusal.set(null);
    this.done.set(null);
  }

  protected quantityOf(sku: string): number | null {
    return this.quantities().get(sku) ?? null;
  }

  protected setQuantity(sku: string, quantity: number | null): void {
    this.quantities.update((current) => withQuantity(current, sku, quantity));
    this.done.set(null);
  }

  /** Retire une ligne inapplicable : elle ne s'enregistrera plus. */
  protected dropStale(sku: string): void {
    this.stale.update((lines) => lines.filter((line) => line.sku !== sku));
    this.done.set(null);
  }

  protected async save(): Promise<void> {
    const name = this.name().trim();
    if (name === '') {
      this.nameRefusal.set('Un modèle a un nom (« Base matin ») : saisissez-le.');
      return;
    }
    if (!this.canSave()) {
      return;
    }
    const content: ResupplyTemplateContentPayload = {
      name,
      target: this.target(),
      // Un « au plus tôt » ne porte jamais d'heure (400 `resupply.arrival.asap`).
      arrivalBy: this.target() === 'tomorrow' && this.arrivalBy() !== '' ? this.arrivalBy() : null,
      lines: this.lines(),
    };
    const templateId = this.templateId();
    const version = this.version();
    await this.gesture(async () => {
      if (templateId === undefined || version === null) {
        await this.store.open(this.siteId());
        await this.store.create(content);
        await this.leave();
        return;
      }
      const saved = await this.store.adjust(templateId, content, version);
      this.version.set(saved.version);
      this.done.set('Modèle enregistré.');
    }, "Le modèle n'a pas pu être enregistré.");
  }

  protected async archive(): Promise<void> {
    const templateId = this.templateId();
    if (templateId === undefined) {
      return;
    }
    await this.gesture(async () => {
      await this.store.archive(templateId);
      await this.leave();
    }, "Le modèle n'a pas pu être archivé.");
  }

  /** Un clic simple reste dans l'application ; un clic modifié ouvre l'adresse ailleurs. */
  protected goBack(event: MouseEvent): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    void this.leave();
  }

  private async leave(): Promise<void> {
    await this.router.navigate([TEMPLATES_URL], { queryParams: this.back() });
  }

  /** Un geste vers le serveur : un à la fois, son refus placé là où il se corrige. */
  private async gesture(run: () => Promise<void>, fallback: string): Promise<void> {
    this.pending.set(true);
    this.failure.set(null);
    this.done.set(null);
    try {
      await run();
    } catch (error) {
      await this.refused(error, fallback);
    } finally {
      this.pending.set(false);
    }
  }

  private async refused(error: unknown, fallback: string): Promise<void> {
    const code = httpErrorCode(error);
    const message = httpErrorMessage(error, fallback);
    if (code === NAME_TAKEN || code === NAME_REQUIRED) {
      this.nameRefusal.set(message);
      return;
    }
    if (code !== null && ARRIVAL_REFUSALS.has(code)) {
      this.arrivalRefusal.set(message);
      return;
    }
    if (code === CHANGED_MEANWHILE) {
      await this.reread();
      return;
    }
    this.failure.set(message);
  }

  /** Un autre poste a écrit : relire le modèle, l'afficher, et le dire. */
  private async reread(): Promise<void> {
    const templateId = this.templateId();
    try {
      await this.store.reload();
    } catch {
      this.failure.set(
        "Ce modèle a été modifié depuis un autre poste, et sa version à jour n'a pas pu être relue : rechargez la page.",
      );
      return;
    }
    if (templateId !== undefined) {
      this.take(templateId);
    }
    this.failure.set(
      this.missing()
        ? "Ce modèle a été archivé depuis un autre poste : il n'est plus dans la bibliothèque."
        : 'Ce modèle a été modifié depuis un autre poste : voici sa version à jour. Refaites votre ajustement, puis enregistrez.',
    );
  }
}
