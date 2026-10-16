import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { ShopOperationView } from '@lfd/contracts';
import { FoldCalloutComponent, FoldCardComponent, FoldElementTitleComponent } from 'fold-ng';

import { ClientLocale } from '../../client-locale.service';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { mediaSrcset, SHEET_WIDTHS, sizedMedia } from '../media-source';
import { operationText, pickupSpan, shortDate } from '../operations';
import { objectPositionOf } from '../shelf-display';

/**
 * **L'encart qui ouvre le rayon d'une opération** — image, nom, chapeau, et
 * ses dates dites en clair (`plan-l-operation-passe-au-commerce.md`, « Une
 * opération sans article »). Pendant l'annonce, il EST le rayon, même sans
 * article ; commandes ouvertes et rayon vide, il dit « Les produits arrivent
 * bientôt ».
 *
 * Il ne paraît qu'une fois les opérations tenues au commerce : c'est ce que
 * dit la présence de `announceFrom` — absent avant la bascule, comme la
 * vitrine l'a toujours reçu. Le parent en décide ; ce composant ne fait que lire.
 */
@Component({
  selector: 'app-operation-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldCardComponent, FoldElementTitleComponent],
  templateUrl: './operation-notice.html',
  styleUrl: './operation-notice.scss',
})
export class OperationNotice {
  private readonly t = inject(ClientCopyService).t;
  private readonly locale = inject(ClientLocale);

  readonly operation = input.required<ShopOperationView>();

  protected readonly title = computed(() =>
    operationText(this.operation().name, this.locale.current()),
  );

  protected readonly lede = computed(() => {
    const lede = this.operation().lede;
    return lede === null ? '' : operationText(lede, this.locale.current());
  });

  /** Les dates, dans l'ordre où le client les vit : ouverture, clôture, retrait. */
  protected readonly dates = computed(() => {
    const operation = this.operation();
    const locale = this.locale.current();
    const copy = this.t();
    const lines = [
      fill(copy.shop.operationOrderUntil, { date: shortDate(operation.orderUntil, locale) }),
      fill(copy.shop.operationPickupWindow, { span: pickupSpan(operation, locale, copy) }),
    ];
    // « Commandes à partir du… » n'a de sens qu'avant l'ouverture.
    return operation.state === 'announced'
      ? [
          fill(copy.shop.operationOrderFrom, { date: shortDate(operation.orderFrom, locale) }),
          ...lines,
        ]
      : lines;
  });

  protected readonly awaiting = computed(() => this.operation().awaitingProducts === true);
  protected readonly awaitingText = computed(() => this.t().shop.operationAwaitingProducts);

  protected readonly image = computed(() => {
    const image = this.operation().image;
    if (image === null) {
      return null;
    }
    return {
      src: sizedMedia(image.url, SHEET_WIDTHS[0]),
      srcset: mediaSrcset(image.url, SHEET_WIDTHS),
      alt: image.alt,
      position: objectPositionOf(image),
    };
  });
}
