import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { DeliveryRoundDriverView } from '@lfd/contracts';
import type { FoldSelectOption } from 'fold-ng';
import {
  FoldAvatarComponent,
  FoldBadgeComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldIconComponent,
  FoldPopoverTriggerDirective,
} from 'fold-ng';

/** Ce que dit la ligne « livreur » d'une tournée. */
export function driverLabelOf(driver: DeliveryRoundDriverView | null): string {
  if (driver === null) {
    return 'Aucun livreur';
  }
  return driver.name ?? 'Livreur sans fiche dans l’annuaire';
}

/**
 * **Le livreur d'une tournée** (`plan-ma-tournee.md`, MT-D2 v2) : qui est
 * affecté, et — pour qui compose — l'affecter ou le retirer, depuis un bouton
 * menu (avatar, nom, chevron ; `handoff-tournees/SPEC.md`, § 3.3).
 *
 * Le composant n'écrit rien : il émet, et l'écran Organisation de tournées écrit, relit et
 * affiche le refus du serveur comme toute autre composition. Une tournée
 * partie est en lecture seule (I6).
 */
@Component({
  selector: 'app-round-driver',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldAvatarComponent,
    FoldBadgeComponent,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldIconComponent,
    FoldPopoverTriggerDirective,
  ],
  templateUrl: './round-driver.html',
  styleUrl: './round-driver.scss',
})
export class RoundDriver {
  readonly driver = input.required<DeliveryRoundDriverView | null>();
  /** Les livreurs affectables (le droit effectif, lu par le serveur). */
  readonly drivers = input.required<readonly FoldSelectOption<string>[]>();
  /** Qui compose (`delivery_rounds:write`) ET la tournée est encore au dépôt. */
  readonly editable = input(false);
  readonly disabled = input(false);

  readonly assigned = output<string>();
  readonly unassigned = output<void>();

  protected readonly label = computed(() => driverLabelOf(this.driver()));
  /** Il a perdu le droit de conduire, ou sa fiche est suspendue : sa route le refuse. */
  protected readonly withoutAccess = computed(() => this.driver()?.canDrive === false);

  protected pick(staffUserId: string): void {
    if (staffUserId !== this.driver()?.staffUserId) {
      this.assigned.emit(staffUserId);
    }
  }
}
