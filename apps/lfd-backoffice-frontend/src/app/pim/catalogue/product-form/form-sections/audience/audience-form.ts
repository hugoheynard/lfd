import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { OperationAudience } from '@lfd/pim-contracts';
import { FoldListboxComponent } from 'fold-ng';

import { NotifyService } from '../../../../../notify.service';
import {
  INHERIT,
  productAudienceOptions,
  type ProductAudienceChoice,
} from '../../../audience/audience-options';
import { ProductHttpApi } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';

/**
 * **À qui la fiche vend** — l'audience de la fiche (lot 3 de
 * `plan-catalogue-synchronise-par-audience.md`, H1) : elle hérite de sa
 * famille, ou y déroge en élargissant ou en restreignant.
 *
 * Elle écrit **immédiatement**, comme la vente en opération et le froid : la
 * route est à part (`PUT …/audience`, `null` = hérite) et son fait de journal
 * aussi. Un refus remet le choix où il était — un sélecteur qui affiche ce que
 * le serveur a refusé mentirait sur ce qui se vend.
 */
@Component({
  selector: 'app-audience-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldListboxComponent],
  templateUrl: './audience-form.html',
})
export class AudienceForm {
  private readonly products = inject(ProductHttpApi);
  private readonly notify = inject(NotifyService);
  protected readonly store = inject(ProductFormStore);

  protected readonly busy = signal(false);

  protected readonly options = computed(() => productAudienceOptions(this.store.familyAudience()));

  protected readonly choice = computed<ProductAudienceChoice>(
    () => this.store.audience() ?? INHERIT,
  );

  protected async onChange(choice: ProductAudienceChoice): Promise<void> {
    const next: OperationAudience | null = choice === INHERIT ? null : choice;
    const previous = this.store.audience();
    if (next === previous) {
      return;
    }
    this.store.audience.set(next);
    this.busy.set(true);
    try {
      await this.products.setAudience(this.store.productId(), next);
      this.notify.success(
        next === null
          ? "La fiche suit l'audience de sa famille."
          : 'Audience de la fiche enregistrée.',
      );
    } catch (caught) {
      this.store.audience.set(previous);
      this.notify.error(caught, "L'audience n'a pas pu être enregistrée.");
    } finally {
      this.busy.set(false);
    }
  }
}
