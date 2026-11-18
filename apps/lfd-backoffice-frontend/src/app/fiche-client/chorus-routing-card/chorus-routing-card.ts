import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  publicPaymentDeadlineDays,
  toLegalForm,
  type ChorusRoutingPayload,
  type ChorusRoutingView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldDateComponent,
  FoldElementTitleComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldInputComponent,
} from 'fold-ng';

import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { frenchDay } from '../../comptes-clients/kbis-age-wording';
import { parisToday } from '../../shared/paris-today';

/**
 * La carte **Chorus Pro** d'un organisme public — elle tient la place du KBIS.
 *
 * Elle montre ce que l'acheteur exige sur ses factures, relevé à la main par le
 * staff dans l'annuaire Chorus : engagement exigé, code service exigé, code par
 * défaut, et le jour du relevé avec son auteur. Le délai de paiement ne s'y
 * saisit pas : il se dérive de la catégorie juridique.
 *
 * Plan : `documentation/comptabilite/facturation/plan-clients-publics-chorus.md`, § 6 bis.
 */
@Component({
  selector: 'app-chorus-routing-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldDateComponent,
    FoldElementTitleComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldInputComponent,
  ],
  templateUrl: './chorus-routing-card.html',
  styleUrl: './chorus-routing-card.scss',
})
export class ChorusRoutingCard {
  private readonly service = inject(AdminCompaniesService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly company = input.required<AdminCompanyDetail>();
  /** Le droit d'écrire la fiche (`b2b_companies:write`). */
  readonly canManage = input(false);

  /** La fiche a été posée : la fiche client se relit (l'activation en dépend). */
  readonly changed = output<void>();

  protected readonly routing = computed<ChorusRoutingView | null>(
    () => this.company().chorusRouting,
  );

  /** Le délai légal, dérivé de la catégorie ; `null` hors forme publique. */
  protected readonly deadlineDays = computed(() => {
    const form = toLegalForm(this.company().formeJuridique);
    return form === null ? null : publicPaymentDeadlineDays(form);
  });

  /** « Vérifié le 18/11/2026 par Camille Rousseau (commercial) ». */
  protected readonly checkedLine = computed(() => {
    const routing = this.routing();
    if (routing === null) {
      return '';
    }
    const name = routing.checkedBy.name;
    const role = routing.checkedBy.role;
    const by = name === '' ? '' : role === '' ? ` par ${name}` : ` par ${name} (${role})`;
    return `Vérifié le ${frenchDay(routing.checkedOn)}${by}.`;
  });

  /** Le jour de l'écran : défaut du relevé, et borne haute (on ne relève pas demain). */
  protected readonly today = parisToday();

  protected readonly editing = signal(false);
  protected readonly commitmentRequired = signal(false);
  protected readonly serviceCodeRequired = signal(false);
  protected readonly defaultServiceCode = signal('');
  protected readonly checkedOn = signal('');
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly canSave = computed(() => !this.saving() && this.checkedOn() !== '');

  /** Ouvre la saisie, préremplie de la fiche posée — ou vierge, datée du jour. */
  edit(): void {
    const routing = this.routing();
    this.commitmentRequired.set(routing?.commitmentRequired ?? false);
    this.serviceCodeRequired.set(routing?.serviceCodeRequired ?? false);
    this.defaultServiceCode.set(routing?.defaultServiceCode ?? '');
    // Un nouveau relevé est daté du jour : ré-enregistrer, c’est avoir revérifié.
    this.checkedOn.set(this.today);
    this.refusal.set(null);
    this.editing.set(true);
  }

  /** Amène la carte sous les yeux et ouvre la saisie — le geste de la checklist. */
  reveal(): void {
    this.host.nativeElement.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    if (this.canManage()) {
      this.edit();
    }
  }

  protected cancel(): void {
    this.editing.set(false);
    this.refusal.set(null);
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    const payload: ChorusRoutingPayload = {
      commitmentRequired: this.commitmentRequired(),
      serviceCodeRequired: this.serviceCodeRequired(),
      defaultServiceCode: this.defaultServiceCode().trim(),
      checkedOn: this.checkedOn(),
    };
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.service.setChorusRouting(this.company().id, payload);
      this.editing.set(false);
      this.changed.emit();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'La fiche Chorus Pro n’a pas été enregistrée.'));
    } finally {
      this.saving.set(false);
    }
  }
}
