import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { FloorClientele } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { PriceLimitsService } from '../../price-limits.service';
import { runBulk, type BulkOutcome } from '../bulk-pose';
import { FloorValueForm, type FloorValueDraft } from '../floor-value-form/floor-value-form';

/** Un article de la sélection. */
export interface BulkArticle {
  readonly sku: string;
  readonly name: string;
  /** A-t-il déjà sa propre limite ? La pose la REMPLACERA. */
  readonly hasOwn: boolean;
}

export interface BulkFloorPanelData {
  readonly clientele: FloorClientele;
  readonly articles: readonly BulkArticle[];
}

/**
 * **Poser la même limite sur N articles** — le geste qui rend la couverture
 * praticable : sans lui, couvrir soixante-et-onze articles demandait
 * soixante-et-onze panneaux.
 *
 * Il n'y a pas de route groupée, et il n'en faut pas : `PUT
 * /admin/pricing/floors` est idempotent par portée et clientèle, donc la pose
 * est une boucle — quelques appels à la fois — et chaque article réussit ou
 * échoue pour son compte. Le bilan le dit, article par article ; rien n'est
 * défait, et rejouer les refusés est sans danger.
 *
 * Un article, c'est une unité : l'euro y a un sens, et le formulaire le propose.
 */
@Component({
  selector: 'app-bulk-floor-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, FoldButtonComponent, FoldCalloutComponent, FloorValueForm],
  templateUrl: './bulk-floor-panel.html',
  styleUrl: './bulk-floor-panel.scss',
})
export class BulkFloorPanel {
  private readonly limits = inject(PriceLimitsService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<BulkFloorPanelData | undefined>(undefined);

  protected readonly draft = signal<FloorValueDraft | null>(null);
  protected readonly running = signal(false);
  protected readonly outcome = signal<BulkOutcome<BulkArticle> | null>(null);

  protected readonly articles = computed(() => this.data()?.articles ?? []);
  protected readonly replaced = computed(() => this.articles().filter((a) => a.hasOwn).length);

  protected readonly subtitle = computed(() => {
    const who = this.data()?.clientele === 'public' ? 'pour le public' : 'pour les pros';
    return `${String(this.articles().length)} articles, ${who}. La même limite sur chacun.`;
  });

  protected readonly canSubmit = computed(
    () => this.draft() !== null && this.articles().length > 0 && !this.running(),
  );

  protected async submit(): Promise<void> {
    const data = this.data();
    const draft = this.draft();
    if (data === undefined || draft === null || !this.canSubmit()) {
      return;
    }
    this.running.set(true);
    try {
      this.outcome.set(
        await runBulk(
          data.articles,
          (article) =>
            this.limits.setFloor({
              scope: { type: 'product', id: article.sku },
              clientele: data.clientele,
              ...draft,
            }),
          (error) => httpErrorMessage(error, 'Refusée sans raison lisible.'),
        ),
      );
    } finally {
      this.running.set(false);
    }
  }

  /** Fermer après un bilan relit la vue : des limites ont pu être posées. */
  protected close(): void {
    this.ref.close(this.outcome() !== null ? true : undefined);
  }
}
