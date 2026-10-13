import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import type { SiteView } from '@lfd/contracts';
import { HoursForm, hoursIssueOf, type HoursEntry } from '@lfd/b2b-ui/hours';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { openingEntries, toPickupOpening } from '../../../../b2b/reglages/pickup-opening.model';
import { NotifyService } from '../../../../notify.service';
import { SitesService } from '../../sites.service';
import { placePayload } from '../site-place-payload';

/**
 * **Les heures de retrait d'un site** — sous-carte de « Paramétrage du
 * retrait », avec SA sauvegarde (Hugo, 2026-10-13) : enregistrer les heures
 * n'écrit qu'elles, sur le lieu tel qu'il est enregistré.
 */
@Component({
  selector: 'app-site-hours-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldPageSectionComponent,
    HoursForm,
  ],
  templateUrl: './site-hours-card.html',
  styleUrl: './site-hours-card.scss',
})
export class SiteHoursCard {
  private readonly sites = inject(SitesService);
  private readonly notify = inject(NotifyService);

  readonly site = input.required<SiteView>();
  readonly readOnly = input(false);
  readonly saved = output();

  protected readonly opening = linkedSignal<readonly HoursEntry[]>(() =>
    openingEntries(this.site().opening),
  );
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly issue = computed(() => hoursIssueOf(this.opening()));
  /** Aucune plage renseignée : le site accepte alors n'importe quelle heure. */
  protected readonly empty = computed(() =>
    this.opening().every((entry) => entry.range.start === '' && entry.range.end === ''),
  );
  protected readonly dirty = computed(
    () =>
      JSON.stringify(toPickupOpening(this.opening())) !==
      JSON.stringify(toPickupOpening(openingEntries(this.site().opening))),
  );
  protected readonly canSave = computed(
    () => !this.readOnly() && this.dirty() && this.issue() === '' && !this.saving(),
  );

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    try {
      const opening = toPickupOpening(this.opening());
      await this.sites.update(this.site().id, placePayload(this.site(), { opening }));
      this.notify.success('Heures de retrait enregistrées.');
      this.saved.emit();
    } catch (error) {
      this.refusal.set(
        httpErrorMessage(error, "Les heures de retrait n'ont pas pu être enregistrées."),
      );
    } finally {
      this.saving.set(false);
    }
  }
}
