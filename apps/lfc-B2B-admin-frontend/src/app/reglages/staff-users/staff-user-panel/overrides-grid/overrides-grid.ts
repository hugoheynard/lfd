import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import {
  hasStaffPermission,
  resolveStaffPermissions,
  staffPermission,
  staffResourceSchema,
  STAFF_RESOURCE_LABELS,
  type StaffAction,
  type StaffOverride,
  type StaffOverrideEffect,
  type StaffResource,
  type StaffRole,
} from '@lfd/contracts';
import { FoldBadgeComponent, FoldSelectComponent } from 'fold-ng';

/** Ce que l'écran propose pour une permission : hériter, ou trancher. */
type Choice = 'inherit' | StaffOverrideEffect;

const CHOICES: readonly { readonly value: Choice; readonly label: string }[] = [
  { value: 'inherit', label: 'Hérite' },
  { value: 'allow', label: 'Autorisé' },
  { value: 'deny', label: 'Refusé' },
];

/** Une case de la grille : ce qu'on a choisi, et ce que ça donne. */
interface Cell {
  readonly action: StaffAction;
  readonly choice: Choice;
  readonly granted: boolean;
}

interface Row {
  readonly resource: StaffResource;
  readonly label: string;
  readonly read: Cell;
  readonly write: Cell;
}

/**
 * Les **écarts au rôle**, ressource par ressource.
 *
 * La grille montre l'**effectif** — ce que la personne pourra faire une fois
 * tout combiné — et pas seulement le delta : personne ne sait lire un delta, et
 * la question posée est toujours « au final, est-ce qu'elle peut ? ».
 *
 * Trois états par permission, et l'absence de ligne vaut « hérite » : on ne
 * stocke que l'écart, comme pour les feature flags.
 */
@Component({
  selector: 'app-overrides-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldSelectComponent, FoldBadgeComponent],
  templateUrl: './overrides-grid.html',
  styleUrl: './overrides-grid.scss',
})
export class OverridesGrid {
  /** Le rôle dont on dérive l'héritage. Change ⇒ l'effectif change avec lui. */
  readonly role = input.required<StaffRole>();
  readonly overrides = model.required<readonly StaffOverride[]>();

  protected readonly choices = CHOICES;

  protected readonly rows = computed<readonly Row[]>(() => {
    const effective = resolveStaffPermissions(this.role(), this.overrides());
    return staffResourceSchema.options.map((resource) => ({
      resource,
      label: STAFF_RESOURCE_LABELS[resource],
      read: this.cell(resource, 'read', effective),
      write: this.cell(resource, 'write', effective),
    }));
  });

  /** Combien d'écarts au rôle — pour dire « rien de particulier » quand c'est vrai. */
  protected readonly count = computed(() => this.overrides().length);

  protected setChoice(resource: StaffResource, action: StaffAction, raw: string): void {
    const choice = CHOICES.find((entry) => entry.value === raw)?.value;
    if (choice === undefined) {
      return;
    }
    const others = this.overrides().filter(
      (entry) => entry.resource !== resource || entry.action !== action,
    );
    this.overrides.set(
      choice === 'inherit' ? others : [...others, { resource, action, effect: choice }],
    );
  }

  private cell(
    resource: StaffResource,
    action: StaffAction,
    effective: readonly ReturnType<typeof staffPermission>[],
  ): Cell {
    const override = this.overrides().find(
      (entry) => entry.resource === resource && entry.action === action,
    );
    return {
      action,
      choice: override?.effect ?? 'inherit',
      granted: hasStaffPermission(effective, staffPermission(resource, action)),
    };
  }
}
