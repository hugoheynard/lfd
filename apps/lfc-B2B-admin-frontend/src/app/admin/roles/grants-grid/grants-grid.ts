import { ChangeDetectionStrategy, Component, computed, model } from '@angular/core';
import { type RoleGrant, type StaffResource } from '@lfd/contracts';
import { FoldBadgeComponent, FoldSelectComponent } from 'fold-ng';

import { applyLevel, levelOf, type GrantLevel } from './apply-level';
import { toolGroups, type StaffTool } from '../resource-tools';

const LEVELS: readonly { readonly value: GrantLevel; readonly label: string }[] = [
  { value: 'none', label: 'Aucun accès' },
  { value: 'read', label: 'Lecture' },
  { value: 'write', label: 'Écriture' },
];

interface Row {
  readonly resource: StaffResource;
  readonly label: string;
  readonly level: GrantLevel;
}

/** Un outil et ses domaines, chacun avec son niveau courant. */
interface Group {
  readonly tool: StaffTool;
  readonly label: string;
  readonly hint: string;
  readonly rows: readonly Row[];
}

/**
 * Les droits d'un rôle, **une ligne par domaine, un seul choix par ligne**.
 *
 * Pas deux colonnes lecture/écriture comme la grille des dérogations : là-bas on
 * pose un écart sur une permission précise, ici on décide d'un **niveau**. Deux
 * cases à cocher rendraient exprimable « écriture sans lecture » — modifier une
 * page qu'on n'a pas le droit d'ouvrir — que le modèle interdit. Un choix
 * unique le rend impossible à composer, plutôt qu'à corriger après coup.
 *
 * Elle ne sert QU'À ÉDITER. La carte d'un rôle, elle, ne montre que les
 * domaines ouverts : y poser cette grille faisait douze lignes dont sept
 * disaient « Aucun », cinq fois de suite — un tableur, pas un écran.
 */
@Component({
  selector: 'app-grants-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldSelectComponent, FoldBadgeComponent],
  templateUrl: './grants-grid.html',
  styleUrl: './grants-grid.scss',
})
export class GrantsGrid {
  readonly grants = model.required<readonly RoleGrant[]>();

  protected readonly levels = LEVELS;

  /**
   * Les domaines **groupés par outil**.
   *
   * À plat, douze lignes se lisaient d'un coup d'œil — et `catalog` ne disait
   * pas s'il parlait du référentiel produit ou du catalogue vendu. Le groupe
   * porte cette information que la clé n'a pas encore, et il tiendra les
   * dix-neuf domaines du découpage à venir sans changer de forme.
   */
  protected readonly groups = computed<readonly Group[]>(() =>
    toolGroups().map((group) => ({
      tool: group.tool,
      label: group.label,
      hint: group.hint,
      rows: group.resources.map((entry) => ({
        resource: entry.resource,
        label: entry.label,
        level: levelOf(this.grants(), entry.resource),
      })),
    })),
  );

  protected readonly openedCount = computed(() => this.grants().length);

  /** Une valeur que le `<select>` natif ne connaît pas est ignorée, pas forcée. */
  protected setLevel(resource: StaffResource, raw: string): void {
    const level = LEVELS.find((entry) => entry.value === raw)?.value;
    if (level !== undefined) {
      this.grants.set(applyLevel(this.grants(), resource, level));
    }
  }
}
