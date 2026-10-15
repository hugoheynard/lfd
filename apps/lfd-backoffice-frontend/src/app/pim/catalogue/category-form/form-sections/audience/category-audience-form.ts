import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { OperationAudience } from '@lfd/pim-contracts';
import { FoldListboxComponent } from 'fold-ng';

import { NotifyService } from '../../../../../notify.service';
import { FAMILY_AUDIENCE_OPTIONS } from '../../../audience/audience-options';
import { CategoryHttpApi } from '../../../category-http-api';
import { CategoryFormStore } from '../../category-form-store';

/**
 * **À qui la famille vend** — l'audience dont ses fiches héritent, sauf
 * dérogation (lot 3 de `plan-catalogue-synchronise-par-audience.md`, H1).
 *
 * Elle écrit **immédiatement**, sur sa route (`PUT …/audience`), hors des
 * sections : un changement d'audience part à la plateforme pour toutes les
 * fiches qui en héritent, et le journal le raconte à part. Un refus remet le
 * choix où il était.
 */
@Component({
  selector: 'app-category-audience-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldListboxComponent],
  templateUrl: './category-audience-form.html',
})
export class CategoryAudienceForm {
  private readonly categories = inject(CategoryHttpApi);
  private readonly notify = inject(NotifyService);
  protected readonly store = inject(CategoryFormStore);

  protected readonly busy = signal(false);
  protected readonly options = FAMILY_AUDIENCE_OPTIONS;

  protected async onChange(audience: OperationAudience): Promise<void> {
    const id = this.store.id();
    const previous = this.store.audience();
    if (id === null || audience === previous) {
      return;
    }
    this.store.audience.set(audience);
    this.busy.set(true);
    try {
      await this.categories.setAudience(id, audience);
      this.notify.success('Audience de la famille enregistrée.');
    } catch (caught) {
      this.store.audience.set(previous);
      this.notify.error(caught, "L'audience n'a pas pu être enregistrée.");
    } finally {
      this.busy.set(false);
    }
  }
}
