import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  output,
  signal,
} from '@angular/core';
import type {
  BakehouseResupplyDraftView,
  ResupplyArticleView,
  ResupplyTarget,
  SaveBakehouseResupplyDraftPayload,
} from '@lfd/contracts';
import { NgTemplateOutlet } from '@angular/common';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldListboxComponent,
  FoldNumberInputComponent,
  FoldPanelHostService,
  FoldSearchComponent,
  FoldViewToggleComponent,
  type FoldSelectOption,
  type FoldTableColumn,
} from 'fold-ng';

import { PickupAddressesService } from '../../../b2b/reglages/pickup-addresses.service';
import {
  QuantityDialog,
  type QuantityDialogData,
} from '../../../shared/quantity-dialog/quantity-dialog';
import { ResupplyNameField } from '../../../shared/resupply-name-field/resupply-name-field';
import { ALL_FAMILIES, articlesMatching, familyOptionsOf } from './article-filters';
import { BakehouseDraftList } from '../bakehouse-draft-list/bakehouse-draft-list';
import { BakehouseDraftsStore } from '../bakehouse-drafts.store';
import { BakehouseResuppliesService } from '../bakehouse-resupplies.service';

/**
 * Les pas rapides, de part et d'autre de la case (Hugo, 2026-10-28) : on
 * retire à gauche, on ajoute à droite, du plus fin au plus large en
 * s'éloignant de la case.
 */
const STEPS = [1, 10, 50, 100] as const;

/** Le téléphone — le même seuil que la feuille de style. */
const PHONE_QUERY = '(max-width: 768px)';

/** Les colonnes ; leurs cellules sont des gabarits (`foldCell`). */
const COLUMNS: readonly FoldTableColumn<ResupplyArticleView>[] = [
  { key: 'family', label: 'Famille' },
  { key: 'product', label: 'Produit' },
  { key: 'quantity', label: 'Quantité', align: 'right' },
];

/** Un point proposé. */
interface SiteChoice {
  readonly id: string;
  readonly label: string;
}

/**
 * **« Envoyer un réassort »** — le fournil dit « je t'envoie ça » à un point
 * (lot R1d, `reassort-boutiques/plan-reapprovisionnement.md`, Hugo
 * 2026-10-21 : « si le comptoir demande au téléphone, le fournil peut entrer
 * la demande »). Choisir le point, la visée (aujourd'hui au plus tôt, ou
 * pour demain — sous l'heure limite du comptoir si le réassort y est
 * soumis), saisir les quantités dans la table du catalogue, puis « Envoyer ».
 *
 * La table range les articles PAR FAMILLE, une case par article et des pas
 * rapides de part et d'autre (Hugo, 2026-10-28) : elle a remplacé un champ
 * « Article » qui faisait chercher les produits un par un.
 *
 * La liste se compose À L'ÉCRAN, sans brouillon partagé : le réassort ne
 * naît qu'à l'envoi, à part de la demande en cours du comptoir, qu'il ne
 * touche jamais. Montée par la page sous `production_resupply:write`.
 *
 * Un nom facultatif (R1g) part avec l'envoi ; les noms déjà employés au point
 * choisi sont proposés.
 */
@Component({
  selector: 'app-bakehouse-resupply-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldListboxComponent,
    FoldNumberInputComponent,
    FoldSearchComponent,
    FoldViewToggleComponent,
    BakehouseDraftList,
    NgTemplateOutlet,
    ResupplyNameField,
  ],
  providers: [BakehouseDraftsStore],
  templateUrl: './bakehouse-resupply-card.html',
  styleUrl: './bakehouse-resupply-card.scss',
})
export class BakehouseResupplyCard {
  private readonly service = inject(BakehouseResuppliesService);
  private readonly pickups = inject(PickupAddressesService);
  private readonly panels = inject(FoldPanelHostService);
  protected readonly draftsStore = inject(BakehouseDraftsStore);
  /** Le libellé de chaque point, pour la liste des brouillons. */
  protected readonly siteLabels = computed(
    () => new Map(this.sites().map((site) => [site.id, site.label] as const)),
  );

  /**
   * Le seuil du téléphone : la ligne n'y garde que sa case, en lecture seule,
   * et la toucher ouvre le dialogue (Hugo, 2026-10-28). Le seuil des
   * raccourcis masqués en CSS est le même.
   */
  protected readonly phone = signal(false);

  /** Un réassort vient de partir : la page relit. */
  readonly sent = output();

  protected readonly loadFailed = signal(false);
  protected readonly sites = signal<readonly SiteChoice[]>([]);
  protected readonly articles = signal<readonly ResupplyArticleView[]>([]);
  protected readonly siteId = signal<string | null>(null);
  protected readonly target = signal<ResupplyTarget>('asap');
  /** La quantité saisie par article ; un article absent n'est pas demandé. */
  protected readonly quantities = signal<ReadonlyMap<string, number>>(new Map());
  protected readonly query = signal('');
  /** La famille retenue par le filtre ; `ALL_FAMILIES` par défaut. */
  protected readonly family = signal<string>(ALL_FAMILIES);

  /** « Tout », puis une puce par famille, avec ce qui y est déjà saisi. */
  protected readonly familyOptions = computed(() =>
    familyOptionsOf(this.articles(), this.quantities()),
  );
  protected readonly steps = STEPS;
  /** En mobile, la famille est dans le filtre : la table garde produit et quantité. */
  protected readonly columns = computed(() =>
    this.phone() ? COLUMNS.filter((column) => column.key !== 'family') : COLUMNS,
  );
  protected readonly skuOf = (article: ResupplyArticleView): string => article.sku;
  /** Les mêmes pas, retirés : le plus large le plus loin de la case. */
  protected readonly downSteps = [...STEPS].reverse();
  /** Le nom du réassort (R1g), envoyé avec lui ; vide : sans nom. */
  protected readonly name = signal('');
  /** Les noms déjà employés au point choisi ; vides tant qu'aucun n'est choisi. */
  protected readonly usedNames = signal<readonly string[]>([]);
  protected readonly pending = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly done = signal<string | null>(null);

  protected readonly siteOptions = computed<FoldSelectOption<string>[]>(() =>
    this.sites().map((site) => ({ value: site.id, label: site.label })),
  );
  /** Les lignes envoyées : les articles à quantité positive, dans l'ordre du catalogue. */
  protected readonly lines = computed(() => {
    const quantities = this.quantities();
    return this.articles()
      .filter((article) => (quantities.get(article.sku) ?? 0) > 0)
      .map((article) => ({ sku: article.sku, quantity: quantities.get(article.sku) ?? 0 }));
  });
  protected readonly pieces = computed(() =>
    this.lines().reduce((total, line) => total + line.quantity, 0),
  );

  /** Les articles de la famille retenue et de la recherche, dans l'ordre du catalogue. */
  protected readonly visibleArticles = computed(() =>
    articlesMatching(this.articles(), this.family(), this.query()),
  );
  protected readonly nothingFound = { title: 'Aucun produit ne correspond.' };

  protected readonly canSend = computed(
    () => this.siteId() !== null && this.lines().length > 0 && !this.pending(),
  );
  /** Enregistrer demande ce qu'envoyer demande : un point et une ligne. */
  protected readonly canSaveDraft = this.canSend;

  constructor() {
    const query = window.matchMedia(PHONE_QUERY);
    this.phone.set(query.matches);
    const follow = (event: MediaQueryListEvent): void => this.phone.set(event.matches);
    query.addEventListener('change', follow);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', follow));
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loadFailed.set(false);
    try {
      const [sites, articles] = await Promise.all([this.pickups.list(), this.service.articles()]);
      this.sites.set(sites.map((site) => ({ id: site.id, label: site.label })));
      this.articles.set(articles);
    } catch {
      this.loadFailed.set(true);
    }
    await this.draftsStore.reload();
  }

  /** Choisit le point, puis lit ses noms déjà employés ; une lecture échouée ne propose rien. */
  protected async pickSite(siteId: string): Promise<void> {
    this.siteId.set(siteId);
    this.usedNames.set([]);
    try {
      const names = await this.service.usedNames(siteId);
      if (this.siteId() === siteId) {
        this.usedNames.set(names);
      }
    } catch {
      // Les propositions sont un confort : sans elles, le nom se tape.
    }
  }

  protected pickTarget(target: ResupplyTarget): void {
    this.target.set(target);
  }

  protected quantityOf(sku: string): number | null {
    return this.quantities().get(sku) ?? null;
  }

  /** La case réécrite : vidée ou à zéro, l'article n'est plus demandé. */
  protected setQuantity(sku: string, quantity: number | null): void {
    this.quantities.update((current) => {
      const next = new Map(current);
      if (quantity === null || quantity <= 0) {
        next.delete(sku);
      } else {
        next.set(sku, quantity);
      }
      return next;
    });
    this.done.set(null);
  }

  /** En mobile, la case ouvre le dialogue du chiffre et des raccourcis. */
  protected async openQuantity(article: ResupplyArticleView): Promise<void> {
    if (!this.phone()) {
      return;
    }
    const quantity = await this.panels.open<QuantityDialogData, number>(QuantityDialog, {
      data: { label: article.name, quantity: this.quantityOf(article.sku) },
    }).closed;
    if (quantity !== undefined) {
      this.setQuantity(article.sku, quantity);
    }
  }

  /** Un pas rapide : positif ajoute, négatif retire, sans descendre sous zéro. */
  protected step(sku: string, delta: number): void {
    this.setQuantity(sku, Math.max(0, (this.quantityOf(sku) ?? 0) + delta));
  }

  /** Le contenu de la carte, tel qu'il s'enregistre ou s'envoie ; `null` sans point. */
  private content(): SaveBakehouseResupplyDraftPayload | null {
    const siteId = this.siteId();
    if (siteId === null) {
      return null;
    }
    const name = this.name().trim();
    return { siteId, target: this.target(), name: name === '' ? null : name, lines: this.lines() };
  }

  /** « Enregistrer comme brouillon » : crée, ou réécrit le brouillon repris. */
  protected async saveDraft(): Promise<void> {
    const content = this.content();
    if (content === null || !this.canSaveDraft()) {
      return;
    }
    await this.gesture(async () => {
      await this.draftsStore.save(content);
      this.done.set('Brouillon enregistré. Il se reprend depuis n’importe quel poste.');
    }, "Le brouillon n'a pas pu être enregistré.");
  }

  /** Reprend un brouillon : la carte en recopie le point, la visée, le nom et les quantités. */
  protected async resume(draft: BakehouseResupplyDraftView): Promise<void> {
    this.draftsStore.take(draft);
    this.target.set(draft.target);
    this.name.set(draft.name ?? '');
    this.quantities.set(new Map(draft.lines.map((line) => [line.sku, line.quantity] as const)));
    this.failure.set(null);
    this.done.set(null);
    await this.pickSite(draft.siteId);
  }

  protected async discard(draft: BakehouseResupplyDraftView): Promise<void> {
    const inHand = this.draftsStore.currentId() === draft.id;
    await this.gesture(async () => {
      await this.draftsStore.discard(draft);
      if (inHand) {
        this.clear();
      }
      this.done.set('Brouillon supprimé.');
    }, "Le brouillon n'a pas pu être supprimé.");
  }

  /** « Nouveau réassort » : la carte se vide, le brouillon repris reste à reprendre. */
  protected startOver(): void {
    this.draftsStore.release();
    this.clear();
    this.done.set(null);
    this.failure.set(null);
  }

  protected async send(): Promise<void> {
    const content = this.content();
    if (content === null || !this.canSend()) {
      return;
    }
    await this.gesture(async () => {
      await this.draftsStore.send(content);
      const label = this.siteLabels().get(content.siteId) ?? 'le point';
      this.clear();
      this.done.set(`Réassort envoyé à ${label}.`);
      this.sent.emit();
    }, "Le réassort n'a pas pu être envoyé.");
  }

  private clear(): void {
    this.quantities.set(new Map());
    this.name.set('');
  }

  /** Un geste vers le serveur : un à la fois, et son refus dit dans la carte. */
  private async gesture(run: () => Promise<void>, fallback: string): Promise<void> {
    this.pending.set(true);
    this.failure.set(null);
    this.done.set(null);
    try {
      await run();
    } catch (error) {
      this.failure.set(httpErrorMessage(error, fallback));
    } finally {
      this.pending.set(false);
    }
  }
}
