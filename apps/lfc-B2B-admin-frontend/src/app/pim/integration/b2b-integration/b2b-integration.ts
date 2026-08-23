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
import type { CatalogParityView } from '@lfd/contracts';
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
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly parity = signal<CatalogParityView | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Un miroir fidèle n'a rien à raconter ; c'est l'écart qui se lit. */
  protected readonly gaps = computed<readonly GapRow[]>(() => {
    const report = this.parity();
    return report === null ? [] : rowsOf(report);
  });

  constructor() {
    if (this.isBrowser) {
      void this.check();
    }
  }

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
