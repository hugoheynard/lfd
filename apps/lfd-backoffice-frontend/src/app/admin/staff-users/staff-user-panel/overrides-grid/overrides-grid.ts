import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import {
  hasStaffPermission,
  isRetiredStaffResource,
  resolvePermissionsFromGrants,
  staffPermission,
  staffResourceSchema,
  STAFF_RESOURCE_LABELS,
  STAFF_RESOURCE_SCOPES,
  type StaffAction,
  type StaffOverride,
  type StaffOverrideEffect,
  type RoleGrants,
  type StaffResource,
  type StaffResourceScope,
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
  /** Les choix proposés — tous, ou, sur un droit retiré, le sien et « Hérite ». */
  readonly options: typeof CHOICES;
  readonly granted: boolean;
}

interface Row {
  readonly resource: StaffResource;
  readonly label: string;
  readonly scope: StaffResourceScope;
  /** Retiré : la dérogation qui le porte ne peut qu'être gardée ou enlevée. */
  readonly retired: boolean;
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
  /**
   * Les droits du rôle dont on dérive l'héritage — ceux de sa DÉFINITION, lue
   * en base, plus ceux du contrat (plan `plan-roles-lus-en-base.md` §3.5).
   * Changent ⇒ l'effectif change avec eux.
   */
  readonly grants = input.required<RoleGrants>();
  readonly overrides = model.required<readonly StaffOverride[]>();

  protected readonly rows = computed<readonly Row[]>(() => {
    const effective = resolvePermissionsFromGrants(this.grants(), this.overrides());
    // Une ressource retirée ne se montre que si une dérogation la porte encore,
    // pour être enlevée (`plan-droit-lfc-catalog.md`, L2, 2026-10-16).
    const shown = staffResourceSchema.options.filter(
      (resource) =>
        !isRetiredStaffResource(resource) ||
        this.overrides().some((entry) => entry.resource === resource),
    );
    return shown.map((resource) => ({
      resource,
      label: STAFF_RESOURCE_LABELS[resource],
      scope: STAFF_RESOURCE_SCOPES[resource],
      retired: isRetiredStaffResource(resource),
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
    const choice = override?.effect ?? 'inherit';
    return {
      action,
      choice,
      options: isRetiredStaffResource(resource)
        ? CHOICES.filter((entry) => entry.value === 'inherit' || entry.value === choice)
        : CHOICES,
      granted: hasStaffPermission(effective, staffPermission(resource, action)),
    };
  }
}
