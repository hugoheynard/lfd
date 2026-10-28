import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldListboxComponent,
  FoldNumberInputComponent,
  FoldSearchComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { PickupAddressesService } from '../../../b2b/reglages/pickup-addresses.service';
import { ResupplyNameField } from '../../../shared/resupply-name-field/resupply-name-field';
import { BakehouseResuppliesService } from '../bakehouse-resupplies.service';

/**
 * Les pas rapides, de part et d'autre de la case (Hugo, 2026-10-28) : on
 * retire à gauche, on ajoute à droite, du plus fin au plus large en
 * s'éloignant de la case.
 */
const STEPS = [1, 10, 50, 100] as const;

/** Une famille et ses articles, dans l'ordre du catalogue. */
interface ArticleGroup {
  readonly key: string;
  readonly label: string;
  readonly articles: readonly ResupplyArticleView[];
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

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
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldListboxComponent,
    FoldNumberInputComponent,
    FoldSearchComponent,
    ResupplyNameField,
  ],
  templateUrl: './bakehouse-resupply-card.html',
  styleUrl: './bakehouse-resupply-card.scss',
})
export class BakehouseResupplyCard {
  private readonly service = inject(BakehouseResuppliesService);
  private readonly pickups = inject(PickupAddressesService);

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
  protected readonly steps = STEPS;
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

  /** Les familles du catalogue, dans son ordre ; la recherche filtre les articles. */
  protected readonly groups = computed<readonly ArticleGroup[]>(() => {
    const query = normalize(this.query().trim());
    const groups = new Map<string, { label: string; articles: ResupplyArticleView[] }>();
    for (const article of this.articles()) {
      if (query !== '' && !normalize(`${article.name} ${article.sku}`).includes(query)) {
        continue;
      }
      const group = groups.get(article.categoryId) ?? { label: article.categoryName, articles: [] };
      group.articles.push(article);
      groups.set(article.categoryId, group);
    }
    return [...groups].map(([key, group]) => ({ key, ...group }));
  });
  protected readonly visibleCount = computed(() =>
    this.groups().reduce((total, group) => total + group.articles.length, 0),
  );

  protected readonly canSend = computed(
    () => this.siteId() !== null && this.lines().length > 0 && !this.pending(),
  );

  constructor() {
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
