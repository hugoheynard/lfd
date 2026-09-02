import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { CatalogHealthView, CatalogParityView, PendingDeliveryView } from '@lfd/contracts';
import type { CatalogOverviewView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldHeroCardComponent,
  FoldIconComponent,
  FoldSpinnerComponent,
  FoldStatusBadgeComponent,
} from 'fold-ng';

import { B2B_API_BASE } from '../../../api/api-config';
import { API_BASE_URL } from '../../data/api';

/** Un écart, mis à plat pour l'affichage — le champ, et les deux versions. */
interface GapRow {
  readonly sku: string;
  readonly field: string;
  readonly reference: string;
  readonly mirror: string;
}

/**
 * L'intégration **Boutique B2B** — le canal qui facture.
 *
 * Elle passe devant Shopify, et c'est un ordre de vérité, pas de courtoisie :
 * la boutique B2B encaisse. Elle a longtemps manqué à cet écran, dont l'état
 * vide affirmait que « Shopify est le seul canal branché » — faux depuis que le
 * catalogue et les taux descendent vers la plateforme.
 *
 * Rien à configurer ici, et c'est la différence de fond avec Shopify : le canal
 * est **interne**, en processus, sans domaine ni jeton. Ce qu'il y a à
 * surveiller n'est donc pas une connexion mais la **fidélité du miroir** — un
 * miroir qui décroche facture un prix ou un taux que personne n'a décidé.
 */
@Component({
  selector: 'app-b2b-integration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldHeroCardComponent,
    FoldIconComponent,
    FoldSpinnerComponent,
    FoldStatusBadgeComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './b2b-integration.html',
  styleUrl: './b2b-integration.scss',
})
export class B2bIntegration {
  private readonly http = inject(HttpClient);
  private readonly pimBase = inject(API_BASE_URL);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly parity = signal<CatalogParityView | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Les trois lignes de santé, chargées à l'ouverture — l'aperçu, lui, se demande. */
  protected readonly overview = signal<CatalogOverviewView | null>(null);
  protected readonly pending = signal<PendingDeliveryView | null>(null);
  protected readonly health = signal<CatalogHealthView | null>(null);
  protected readonly reading = signal(false);

  /** Ligne 1 — le travail du référentiel qui n'est pas encore parti. */
  protected readonly unpushed = computed(() => {
    const since = this.overview()?.sinceLastRevision;
    return since === null || since === undefined ? 0 : since.added + since.removed + since.changed;
  });

  /** Ligne 2 — ce que le référentiel a livré et que personne n'a relu. */
  protected readonly awaiting = computed(() => this.pending()?.changes.length ?? 0);

  /**
   * Ligne 3 — **la seule qui doive réveiller quelqu'un**.
   *
   * `null` tant qu'aucune version n'a été validée : il n'y a alors rien à quoi
   * comparer, et l'annoncer sain serait affirmer un contrôle qui n'a pas eu lieu.
   */
  protected readonly drift = computed(() => this.health()?.drift ?? null);

  /** Un miroir fidèle n'a rien à raconter ; c'est l'écart qui se lit. */
  protected readonly gaps = computed<readonly GapRow[]>(() => {
    const report = this.parity();
    return report === null ? [] : rowsOf(report);
  });

  constructor() {
    if (this.isBrowser) {
      void this.read();
    }
  }

  /**
   * Les trois lignes, en un seul geste.
   *
   * `Promise.all` et non trois chargements séparés : elles se lisent ENSEMBLE,
   * et c'est leur juxtaposition qui rend la troisième interprétable. Une seule
   * affichée sans les deux autres redeviendrait « un écart », c'est-à-dire ce
   * qu'on vient de démonter.
   */
  protected async read(): Promise<void> {
    this.reading.set(true);
    this.error.set(null);
    try {
      const [overview, pending, health] = await Promise.all([
        firstValueFrom(
          this.http.get<CatalogOverviewView>(`${this.pimBase}/catalogue/revisions/overview`),
        ),
        firstValueFrom(
          this.http.get<PendingDeliveryView | null>(`${B2B_API_BASE}/admin/catalog/delivery`),
        ),
        firstValueFrom(this.http.get<CatalogHealthView>(`${B2B_API_BASE}/admin/catalog/health`)),
      ]);
      this.overview.set(overview);
      // Le serveur rend `null` quand rien n'attend — l'état NORMAL. Le corps
      // vide arrive en `{}` sur le fil, d'où la garde sur l'identifiant.
      this.pending.set(pending !== null && 'id' in pending ? pending : null);
      this.health.set(health);
    } catch {
      this.error.set('État du catalogue illisible — API injoignable.');
    } finally {
      this.reading.set(false);
    }
  }

  /**
   * L'aperçu avant push — **à la demande**, jamais au chargement.
   *
   * Son référent est « ce que le référentiel publierait MAINTENANT », donc son
   * écart est légitime en permanence : le fil fait exprès que le miroir retarde.
   * L'afficher d'office rejouerait ce que les trois lignes viennent de démonter
   * — un écran qui signale tous les jours quelque chose de normal est un écran
   * qu'on n'ouvre plus.
   */
  protected async check(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.parity.set(
        await firstValueFrom(
          this.http.get<CatalogParityView>(`${B2B_API_BASE}/admin/catalog/parity`),
        ),
      );
    } catch {
      this.error.set('Comparaison impossible — API injoignable.');
    } finally {
      this.loading.set(false);
    }
  }
}

/** Les trois familles d'écarts, dans l'ordre où elles coûtent cher. */
function rowsOf(report: CatalogParityView): readonly GapRow[] {
  return [
    ...report.priceGaps.map((gap) => ({
      sku: gap.sku,
      field: 'Prix',
      reference: euros(gap.reference),
      mirror: euros(gap.mirror),
    })),
    ...report.vatGaps.map((gap) => ({
      sku: gap.sku,
      field: 'TVA',
      reference: percent(gap.reference),
      mirror: percent(gap.mirror),
    })),
    ...report.nameGaps.map((gap) => ({
      sku: gap.sku,
      field: 'Nom',
      reference: gap.reference,
      mirror: gap.mirror,
    })),
  ];
}

function euros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

/** Un taux absent n'est pas zéro : la boutique ne sait pas quoi facturer. */
function percent(value: number | null): string {
  return value === null ? 'aucun' : `${String(value).replace('.', ',')} %`;
}
