import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
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
  FoldSearchComponent,
  FoldViewToggleComponent,
  type FoldSelectOption,
  type FoldTableColumn,
} from 'fold-ng';

import { PickupAddressesService } from '../../../b2b/reglages/pickup-addresses.service';
import { ResupplyNameField } from '../../../shared/resupply-name-field/resupply-name-field';
import { narrowViewport } from '../../../shared/viewport/narrow-viewport';
import { ALL_FAMILIES, articlesMatching, familyOptionsOf } from './article-filters';
import { requestedAmountLabel, requestedLines, withQuantity } from './bakehouse-resupply-lines';
import { BakehouseDraftsStore } from '../bakehouse-drafts.store';
import { BakehouseQuantityStepper } from '../bakehouse-quantity-stepper/bakehouse-quantity-stepper';
import { BakehouseResuppliesService } from '../bakehouse-resupplies.service';

/** Le téléphone — le même seuil que la feuille de style, plus large que l'étroit commun. */
const PHONE_QUERY = '(max-width: 768px)';

/** Les colonnes ; leurs cellules sont des gabarits (`foldCell`). */
const COLUMNS: readonly FoldTableColumn<ResupplyArticleView>[] = [
  { key: 'family', label: 'Famille' },
  { key: 'product', label: 'Produit' },
  { key: 'quantity', label: 'Quantité', align: 'right' },
];

/** Les deux visées, dans l'ordre de la carte. */
const TARGET_OPTIONS = [
  { value: 'asap', label: "Aujourd'hui, au plus tôt" },
  { value: 'tomorrow', label: 'Pour demain' },
] as const;

/** Un point proposé. */
interface SiteChoice {
  readonly id: string;
  readonly label: string;
}

/**
 * **« Envoyer un réassort »** — le fournil dit « je t'envoie ça » à un point
 * (lot R1d, `reassort-boutiques/README.md`, Hugo
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
    BakehouseQuantityStepper,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldListboxComponent,
    FoldSearchComponent,
    FoldViewToggleComponent,
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
  protected readonly phone = narrowViewport(PHONE_QUERY);

  /**
   * Le brouillon à reprendre (`/prod-manager/reassorts/brouillon/:draftId`) ;
   * `null` : un réassort neuf (`…/nouveau`).
   */
  readonly draftId = input<string | null>(null);
  /** Un réassort vient de partir : la page revient à la liste. */
  readonly sent = output();
  /** Le brouillon demandé n'est plus ouvert (envoyé, supprimé, ou inconnu). */
  protected readonly draftMissing = signal(false);
  /**
   * La liste des brouillons n'a pas pu se lire : on ne sait pas si le
   * brouillon demandé existe. L'annoncer « envoyé ou supprimé » mentait
   * (audit du 2026-11-03) : c'est un échec de lecture, qui se réessaie.
   */
  protected readonly draftUnreadable = signal(false);

  protected readonly loadFailed = signal(false);
  protected readonly sites = signal<readonly SiteChoice[]>([]);
  protected readonly articles = signal<readonly ResupplyArticleView[]>([]);
  protected readonly siteId = signal<string | null>(null);
  /**
   * Un brouillon en main garde son point (D3, 2026-11-02) : le serveur refuse
   * de le déplacer, la carte ne le propose donc pas.
   */
  protected readonly siteLocked = computed(() => this.draftsStore.currentId() !== null);
  protected readonly target = signal<ResupplyTarget>('asap');
  /** Les deux visées, en UN contrôle — le même que la table du comptoir. */
  protected readonly targetOptions = TARGET_OPTIONS;
  /** La quantité saisie par article ; un article absent n'est pas demandé. */
  protected readonly quantities = signal<ReadonlyMap<string, number>>(new Map());
  protected readonly query = signal('');
  /** La famille retenue par le filtre ; `ALL_FAMILIES` par défaut. */
  protected readonly family = signal<string>(ALL_FAMILIES);

  /** « Tout », puis une puce par famille, avec ce qui y est déjà saisi. */
  protected readonly familyOptions = computed(() =>
    familyOptionsOf(this.articles(), this.quantities()),
  );
  /** En mobile, la famille est dans le filtre : la table garde produit et quantité. */
  protected readonly columns = computed(() =>
    this.phone() ? COLUMNS.filter((column) => column.key !== 'family') : COLUMNS,
  );
  protected readonly skuOf = (article: ResupplyArticleView): string => article.sku;
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
  protected readonly lines = computed(() => requestedLines(this.articles(), this.quantities()));
  /** Ce qui part, pièces et poids à part : « 12 pièces · 1,25 kg ». */
  protected readonly amount = computed(() => requestedAmountLabel(this.articles(), this.lines()));

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
    // L'entrée n'est posée qu'après le constructeur : on suit `draftId` — un
    // autre brouillon ouvert sur la même page relit aussi.
    effect(() => {
      const wanted = this.draftId();
      untracked(() => void this.load(wanted));
    });
  }

  /**
   * `wanted` est figé à l'appel, AVANT toute attente : il était relu après
   * la lecture, et une navigation entre-temps faisait reprendre un autre
   * brouillon que celui demandé (audit du 2026-11-03).
   */
  protected async load(wanted: string | null = this.draftId()): Promise<void> {
    this.loadFailed.set(false);
    this.draftMissing.set(false);
    this.draftUnreadable.set(false);
    try {
      const [sites, articles] = await Promise.all([this.pickups.list(), this.service.articles()]);
      this.sites.set(sites.map((site) => ({ id: site.id, label: site.label })));
      this.articles.set(articles);
    } catch {
      this.loadFailed.set(true);
    }
    await this.draftsStore.reload();
    // Le brouillon déjà en main n'est pas repris une seconde fois : « Réessayer »
    // écrasait la saisie faite depuis (audit du 2026-11-03).
    if (wanted === null || this.draftsStore.currentId() === wanted) {
      return;
    }
    if (this.draftsStore.unreadable()) {
      this.draftUnreadable.set(true);
      return;
    }
    const draft = this.draftsStore.drafts().find((candidate) => candidate.id === wanted);
    if (draft === undefined) {
      this.draftMissing.set(true);
    } else {
      await this.resume(draft);
    }
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

  protected pickTarget(target: string): void {
    if (target === 'asap' || target === 'tomorrow') {
      this.target.set(target);
    }
  }

  protected quantityOf(sku: string): number | null {
    return this.quantities().get(sku) ?? null;
  }

  /** La case réécrite : vidée ou à zéro, l'article n'est plus demandé. */
  protected setQuantity(sku: string, quantity: number | null): void {
    this.quantities.update((current) => withQuantity(current, sku, quantity));
    this.done.set(null);
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
  private async resume(draft: BakehouseResupplyDraftView): Promise<void> {
    this.draftsStore.take(draft);
    this.target.set(draft.target);
    this.name.set(draft.name ?? '');
    this.quantities.set(new Map(draft.lines.map((line) => [line.sku, line.quantity] as const)));
    this.failure.set(null);
    this.done.set(null);
    await this.pickSite(draft.siteId);
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
