import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  output,
  signal,
} from '@angular/core';
import type { ResupplyArticleView, ResupplyTarget } from '@lfd/contracts';
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
import { BakehouseResuppliesService } from '../bakehouse-resupplies.service';

/**
 * Les pas rapides, de part et d'autre de la case (Hugo, 2026-10-28) : on
 * retire à gauche, on ajoute à droite, du plus fin au plus large en
 * s'éloignant de la case.
 */
const STEPS = [1, 10, 50, 100] as const;

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Le téléphone — le même seuil que la feuille de style. */
const PHONE_QUERY = '(max-width: 768px)';

/** La puce « Tout » : aucun filtre de famille. Hors de l'espace des identifiants. */
const ALL_FAMILIES = '';

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
    ResupplyNameField,
  ],
  templateUrl: './bakehouse-resupply-card.html',
  styleUrl: './bakehouse-resupply-card.scss',
})
export class BakehouseResupplyCard {
  private readonly service = inject(BakehouseResuppliesService);
  private readonly pickups = inject(PickupAddressesService);
  private readonly panels = inject(FoldPanelHostService);

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

  /**
   * « Tout », puis une puce par famille dans l'ordre du catalogue (Hugo,
   * 2026-10-28). Une famille qui a déjà des quantités le dit : on voit, sans
   * la rouvrir, où l'on a déjà saisi.
   */
  protected readonly familyOptions = computed(() => {
    const quantities = this.quantities();
    const families = new Map<string, { label: string; asked: number }>();
    for (const article of this.articles()) {
      const family = families.get(article.categoryId) ?? { label: article.categoryName, asked: 0 };
      if ((quantities.get(article.sku) ?? 0) > 0) {
        family.asked += 1;
      }
      families.set(article.categoryId, family);
    }
    return [
      { value: ALL_FAMILIES, label: 'Tout' },
      ...[...families].map(([value, family]) => ({
        value,
        label: family.asked > 0 ? `${family.label} (${String(family.asked)})` : family.label,
      })),
    ];
  });
  protected readonly steps = STEPS;
  protected readonly columns = COLUMNS;
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
  protected readonly visibleArticles = computed(() => {
    const query = normalize(this.query().trim());
    const family = this.family();
    return this.articles().filter(
      (article) =>
        (family === ALL_FAMILIES || article.categoryId === family) &&
        (query === '' || normalize(`${article.name} ${article.sku}`).includes(query)),
    );
  });
  protected readonly nothingFound = { title: 'Aucun produit ne correspond.' };

  protected readonly canSend = computed(
    () => this.siteId() !== null && this.lines().length > 0 && !this.pending(),
  );

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

  protected async send(): Promise<void> {
    const siteId = this.siteId();
    if (siteId === null || !this.canSend()) {
      return;
    }
    this.pending.set(true);
    this.failure.set(null);
    try {
      await this.service.send(siteId, {
        target: this.target(),
        name: this.name().trim() === '' ? null : this.name(),
        lines: this.lines(),
      });
      const label = this.sites().find((site) => site.id === siteId)?.label ?? 'le point';
      this.quantities.set(new Map());
      this.name.set('');
      this.done.set(`Réassort envoyé à ${label}.`);
      this.sent.emit();
    } catch (error) {
      this.failure.set(httpErrorMessage(error, "Le réassort n'a pas pu être envoyé."));
    } finally {
      this.pending.set(false);
    }
  }
}
