import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { PosedMercurialeView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDateComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldTextareaComponent,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { businessDayStart } from '../../../shared/business-day';
import { parisToday } from '../../../shared/paris-today';
import { AMENDMENT_REASON_MAX_LENGTH } from '../amendment-body';
import { CompanyPricingService } from '../company-pricing.service';
import { SendingIntent } from '../sending-intent';
import { nativeValue } from '../../../shared/native-input';

/** La mercuriale à venir dont on corrige les dates, et son client. */
export interface CorrectWindowPanelData {
  readonly companyId: string;
  readonly mercuriale: PosedMercurialeView;
}

/**
 * **« Corriger les dates »** d'une mercuriale qui n'a pas commencé
 * (`documentation/pricing/mercuriales/comprendre-une-mercuriale.md`, § 9).
 *
 * Les dates s'appliquent à la saisie et ne ferment rien : le navigateur émet
 * un `valueChange` à chaque morceau tapé. Seul « Corriger » envoie ; un refus
 * du serveur reste dans le panneau, en clair. Fermé sur `true` après succès,
 * pour que la fiche se relise.
 */
@Component({
  selector: 'app-correct-window-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldDateComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './correct-window-panel.html',
  styleUrl: './correct-window-panel.scss',
})
export class CorrectWindowPanel implements FoldPanelContent<CorrectWindowPanelData> {
  /**
   * `fold-textarea` ne rend sa valeur qu'en quittant le champ : le motif se lit
   * aussi à chaque frappe, pour que le bouton s'active sans cliquer ailleurs.
   */
  protected readonly nativeValue = nativeValue;

  static readonly foldPanel: FoldPanelDefaults = { side: 'auto', width: 'md' };

  readonly data = input.required<CorrectWindowPanelData>();

  private readonly pricing = inject(CompanyPricingService);
  private readonly panel = inject(FoldPanelRef<boolean>);

  /** Aujourd'hui à Paris : la borne basse du nouveau début. */
  protected readonly today = parisToday();
  protected readonly maxLength = AMENDMENT_REASON_MAX_LENGTH;

  /** Le jour saisi ; `null` = pas encore touché, on montre celui de la mercuriale. */
  private readonly typedFrom = signal<string | null>(null);
  private readonly typedTo = signal<string | null>(null);
  protected readonly reason = signal('');
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);
  /** La clé de la correction, fabriquée à l'ouverture du panneau (`SendingIntent`). */
  private readonly intent = new SendingIntent();

  protected readonly fromDay = computed(
    () => this.typedFrom() ?? parisToday(new Date(this.data().mercuriale.validFrom)),
  );
  protected readonly toDay = computed(() => {
    const typed = this.typedTo();
    if (typed !== null) {
      return typed;
    }
    const validTo = this.data().mercuriale.validTo;
    return validTo === null ? '' : parisToday(new Date(validTo));
  });
  /** La fin vient après le début. */
  protected readonly endMin = computed(() => this.fromDay() || this.today);
  protected readonly tooLong = computed(() => this.reason().trim().length > this.maxLength);
  protected readonly ready = computed(
    () => this.fromDay() !== '' && this.reason().trim() !== '' && !this.tooLong(),
  );

  protected setFrom(day: string): void {
    this.typedFrom.set(day);
  }

  protected setTo(day: string): void {
    this.typedTo.set(day);
  }

  protected async submit(): Promise<void> {
    const validFrom = businessDayStart(this.fromDay());
    if (this.saving() || !this.ready() || validFrom === null) {
      return;
    }
    const toDay = this.toDay();
    const { companyId, mercuriale } = this.data();
    this.saving.set(true);
    this.refusal.set(null);
    try {
      const payload = {
        validFrom,
        validTo: toDay === '' ? null : businessDayStart(toDay),
        reason: this.reason().trim(),
        basedOnAmendmentId: mercuriale.latestAmendmentId ?? null,
      };
      await this.pricing.correctWindow(
        companyId,
        mercuriale.id,
        payload,
        this.intent.keyFor(payload),
      );
      this.intent.done();
      this.panel.close(true);
    } catch (caught) {
      this.refusal.set(httpErrorMessage(caught, "Les dates n'ont pas pu être corrigées."));
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.panel.close();
  }
}
