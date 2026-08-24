import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { companyDisplayName, type CatalogItemView, type OrderQuoteView } from '@lfd/contracts';
import { formatEuros } from '@lfd/catalog-ui';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldSelectComponent,
  FoldInputComponent,
} from 'fold-ng';

import type { AdminCompany } from '../../../comptes-clients/admin-company';
import { AdminCompaniesService } from '../../../comptes-clients/admin-companies.service';
import { AdminCatalogService } from '../../../commandes/catalog.service';
import { AdminOrdersService } from '../../../commandes/orders.service';
import { NotifyService } from '../../../notify.service';
import { benchRow, probeQuantities, stepDownCents, type BenchRow } from './quote-bench';
import { SCENARIOS, projectionLevels, scenarioOf, type Scenario } from './commitment-bench';
import { TarificationService } from '../tarification.service';

/** Ce qu'on choisit avant de sonder : un client, un article. */
const WALK_IN = '';

/**
 * **Le banc d'essai du prix** — un article, un client, plusieurs quantités.
 *
 * La grille dit ce qui est décidé ; la frise dit ce qui l'était. Il manquait
 * l'écran qui répond à la question qu'on pose vraiment au téléphone : « pour
 * lui, à cette quantité-là, ça fait combien ? » — et sa suite immédiate, « et
 * s'il en prend le double ? ».
 *
 * **Rien n'est calculé ici.** Chaque ligne du tableau est un appel à
 * `POST /admin/orders/quote`, c'est-à-dire à la fonction qui FACTURE. Un
 * simulateur qui referait l'arithmétique à sa façon finirait par annoncer autre
 * chose que la commande — ce qui est exactement le défaut qu'il servirait à
 * détecter. Le prix de chaque cellule est donc celui que le client paiera, à la
 * seule réserve que la TVA, la remise de retrait et les frais de zone dépendent
 * d'un acheminement qu'une estimation ne connaît pas.
 *
 * Le banc sonde 1, chaque seuil du barème **et le cran juste en dessous** : la
 * marche entre 49 et 50 est la seule chose qu'un client remarque, et un tableau
 * qui n'afficherait que les seuils atteints la cacherait.
 */
@Component({
  selector: 'app-simulateur-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldInputComponent,
    FoldSelectComponent,
  ],
  templateUrl: './simulateur-page.html',
  styleUrl: './simulateur-page.scss',
})
export class SimulateurPage {
  private readonly companiesService = inject(AdminCompaniesService);
  private readonly catalogService = inject(AdminCatalogService);
  private readonly orders = inject(AdminOrdersService);
  private readonly notify = inject(NotifyService);
  private readonly tarification = inject(TarificationService);

  protected readonly euros = formatEuros;

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly running = signal(false);

  protected readonly companies = signal<readonly AdminCompany[]>([]);
  protected readonly catalog = signal<readonly CatalogItemView[]>([]);

  /** `''` = client de passage : le parcours sans société, règles ouvertes à tous. */
  protected readonly companyId = signal<string>(WALK_IN);
  protected readonly sku = signal<string>('');
  /** La quantité saisie à la main, en plus des seuils. `''` = aucune. */
  protected readonly freeQuantity = signal<string>('');

  protected readonly rows = signal<readonly BenchRow[]>([]);

  // ─── Mode temporel : l'engagement de volume ────────────────────────────────
  /** Le volume visé sur la période. */
  protected readonly promised = signal<string>('6000');
  /** En combien de livraisons il est pris. */
  protected readonly installments = signal<string>('12');
  protected readonly scenarios = signal<readonly Scenario[]>([]);
  protected readonly projecting = signal(false);
  protected readonly scenarioLabels = SCENARIOS;
  /** Le devis de référence — celui à 1 pièce, d'où viennent barème et limite. */
  protected readonly reference = signal<OrderQuoteView | null>(null);

  constructor() {
    void this.load();
  }

  protected readonly companyName = computed(() => {
    const id = this.companyId();
    const match = this.companies().find((company) => company.id === id);
    return match === undefined ? 'Client de passage' : companyDisplayName(match);
  });

  /** La ligne de référence : barème, limite et scellement s'y lisent. */
  protected readonly referenceLine = computed(() => this.reference()?.lines[0] ?? null);

  protected readonly canRun = computed(() => this.sku() !== '' && !this.running());

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      const [companies, catalog] = await Promise.all([
        this.companiesService.list(),
        this.catalogService.list(),
      ]);
      this.companies.set(companies);
      this.catalog.set(catalog);
      this.sku.set(catalog[0]?.sku ?? '');
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /**
   * Sonde le prix. **Deux temps, et l'ordre compte** : un premier devis à
   * 1 pièce donne le barème qui vise l'article, et c'est lui qui dit quelles
   * quantités valent d'être posées. Les deviner d'avance aurait produit un
   * tableau qui ne montre pas les marches — donc l'inverse de ce qu'on cherche.
   */
  protected async run(): Promise<void> {
    const sku = this.sku();
    if (sku === '' || this.running()) {
      return;
    }
    this.running.set(true);
    try {
      const first = await this.quoteAt(sku, 1);
      this.reference.set(first);
      const quantities = probeQuantities(first.lines[0]?.volumeTiers ?? null, this.freeAsNumber());
      const quotes = await Promise.all(quantities.map((quantity) => this.quoteAt(sku, quantity)));
      this.rows.set(
        quotes.flatMap((quote) => (quote.lines[0] === undefined ? [] : [benchRow(quote.lines[0])])),
      );
    } catch (error) {
      this.rows.set([]);
      this.reference.set(null);
      this.notify.error(error, "Le prix n'a pas pu être sondé.");
    } finally {
      this.running.set(false);
    }
  }

  private quoteAt(sku: string, quantity: number): Promise<OrderQuoteView> {
    const id = this.companyId();
    return this.orders.quote({
      companyId: id === WALK_IN ? null : id,
      lines: [{ sku, quantity }],
    });
  }

  /** La saisie libre, ou `null` — une quantité nulle ou illisible ne sonde rien. */
  private freeAsNumber(): number | null {
    const parsed = Number.parseInt(this.freeQuantity(), 10);
    return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
  }

  /**
   * **Le devis temporel** : la trajectoire d'un engagement, et ce qu'elle
   * devient quand la promesse n'est pas tenue.
   *
   * Un seul appel couvre les trois scénarios — les niveaux de cumul sont mis en
   * commun avant d'être demandés. Ce n'est pas une optimisation de confort :
   * trois appels résolus à trois instants pourraient tomber de part et d'autre
   * du basculement d'une promotion, et le tableau comparerait alors des mondes
   * différents.
   */
  protected async projectCommitment(): Promise<void> {
    const sku = this.sku();
    const promised = Number.parseInt(this.promised(), 10);
    const drops = Number.parseInt(this.installments(), 10);
    if (
      sku === '' ||
      Number.isNaN(promised) ||
      promised <= 0 ||
      Number.isNaN(drops) ||
      drops <= 0
    ) {
      return;
    }
    this.projecting.set(true);
    try {
      const id = this.companyId();
      const projection = await this.tarification.project({
        companyId: id === WALK_IN ? null : id,
        sku,
        cumulativeQuantities: [...projectionLevels(promised, drops)],
      });
      this.scenarios.set(
        SCENARIOS.flatMap((scenario) => {
          const built = scenarioOf(promised, scenario.bp, drops, projection.points);
          return built === null ? [] : [built];
        }),
      );
    } catch (error) {
      this.scenarios.set([]);
      this.notify.error(error, "L'engagement n'a pas pu être projeté.");
    } finally {
      this.projecting.set(false);
    }
  }

  /** Le scénario nominal, s'il a pu être monté — la référence de lecture. */
  protected readonly promiseKept = computed(
    () => this.scenarios().find((scenario) => scenario.bp === 10_000) ?? null,
  );

  /** L'écart de prix moyen d'un scénario au nominal, en centimes. Signé. */
  protected gapToPromise(scenario: Scenario): number | null {
    const reference = this.promiseKept();
    if (reference === null || reference.key === scenario.key) {
      return null;
    }
    return scenario.averageUnitCents - reference.averageUnitCents;
  }

  protected percent(bp: number): string {
    return `${String(Math.round(bp / 100))} %`;
  }

  protected marche(index: number): number | null {
    return stepDownCents(this.rows(), index);
  }

  /** Le signe se dit en toutes lettres : « −12 % » et « +4 % » ne se lisent pas pareil. */
  protected variation(bp: number): string {
    const percent = (Math.abs(bp) / 100).toFixed(1).replace('.', ',');
    return `${bp > 0 ? '−' : '+'}${percent} %`;
  }

  protected direction(bp: number): 'down' | 'up' | 'flat' {
    if (bp === 0) {
      return 'flat';
    }
    return bp > 0 ? 'down' : 'up';
  }
}
