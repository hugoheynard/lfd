import { ChangeDetectionStrategy, Component, computed, model, signal } from '@angular/core';
import { type RoleGrant, type StaffResource, type StaffResourceScope } from '@lfd/contracts';
import { NgTemplateOutlet } from '@angular/common';
import {
  FoldBadgeComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldSearchComponent,
  FoldSelectComponent,
} from 'fold-ng';

import { applyLevel, levelOf, type GrantLevel } from './apply-level';
import { highlightSegments, matchesTerm, normalizeTerm, type TextSegment } from './grant-search';
import { toolGroups, type StaffTool } from '../resource-tools';

const LEVELS: readonly { readonly value: GrantLevel; readonly label: string }[] = [
  { value: 'none', label: 'Aucun accès' },
  { value: 'read', label: 'Lecture' },
  { value: 'write', label: 'Écriture' },
];

/** La pause de frappe avant de filtrer et de surligner (Hugo, 2026-10-15). */
export const SEARCH_DELAY_MS = 200;

interface Row {
  readonly resource: StaffResource;
  readonly label: string;
  readonly scope: StaffResourceScope;
  readonly level: GrantLevel;
  readonly labelParts: readonly TextSegment[];
  readonly readParts: readonly TextSegment[];
  readonly writeParts: readonly TextSegment[];
}

/** Un outil et ses domaines, chacun avec son niveau courant. */
interface Group {
  readonly tool: StaffTool;
  readonly label: string;
  readonly hint: string;
  readonly labelParts: readonly TextSegment[];
  /**
   * Gardé pour un droit trouvé, pas pour son nom : on le dit sans surligner
   * dans le titre un mot qui n'y est pas.
   */
  readonly associated: boolean;
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
  imports: [
    FoldSelectComponent,
    FoldBadgeComponent,
    FoldSearchComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    NgTemplateOutlet,
  ],
  templateUrl: './grants-grid.html',
  styleUrl: './grants-grid.scss',
})
export class GrantsGrid {
  readonly grants = model.required<readonly RoleGrant[]>();

  protected readonly levels = LEVELS;

  /**
   * Le terme de recherche. Il ne filtre que l'AFFICHAGE : `grants` n'est jamais
   * lu ni écrit par lui, si bien qu'un droit masqué garde son niveau et
   * s'enregistre comme les autres.
   */
  protected readonly term = signal('');

  /** Ce qui est dans le champ, à la frappe — le filtre, lui, attend la pause. */
  protected readonly draft = signal('');

  protected readonly searchDelayMs = SEARCH_DELAY_MS;

  /**
   * Effacer réaffiche tout TOUT DE SUITE : fold émet le terme vide après le même
   * délai que les autres, et attendre pour revoir la grille entière ne sert à rien.
   */
  protected onDraft(value: string): void {
    this.draft.set(value);
    if (value.trim() === '') {
      this.term.set('');
    }
  }

  /**
   * Les domaines **groupés par outil**.
   *
   * À plat, douze lignes se lisaient d'un coup d'œil — et `catalog` ne disait
   * pas s'il parlait du référentiel produit ou du catalogue vendu. Le groupe
   * porte cette information que la clé n'a pas encore, et il tiendra les
   * dix-neuf domaines du découpage à venir sans changer de forme.
   *
   * Filtrés par le terme (Hugo, 2026-10-15) : un outil dont le NOM correspond
   * reste entier ; sinon ne restent que ses domaines dont le libellé ou la
   * portée correspond, et l'outil est dit « associé ».
   */
  protected readonly groups = computed<readonly Group[]>(() => {
    const term = this.term();
    return toolGroups().flatMap((group): Group[] => {
      const categoryHit = normalizeTerm(term) !== '' && matchesTerm(group.label, term);
      const entries = categoryHit
        ? group.resources
        : group.resources.filter(
            (entry) =>
              matchesTerm(entry.label, term) ||
              matchesTerm(entry.scope.read, term) ||
              matchesTerm(entry.scope.write, term),
          );
      if (entries.length === 0) {
        return [];
      }
      return [
        {
          tool: group.tool,
          label: group.label,
          hint: group.hint,
          labelParts: highlightSegments(group.label, term),
          associated: normalizeTerm(term) !== '' && !categoryHit,
          rows: entries.map((entry) => ({
            resource: entry.resource,
            label: entry.label,
            scope: entry.scope,
            level: levelOf(this.grants(), entry.resource),
            labelParts: highlightSegments(entry.label, term),
            readParts: highlightSegments(entry.scope.read, term),
            writeParts: highlightSegments(entry.scope.write, term),
          })),
        },
      ];
    });
  });

  protected readonly visibleCount = computed(() =>
    this.groups().reduce((total, group) => total + group.rows.length, 0),
  );

  protected readonly searching = computed(() => normalizeTerm(this.term()) !== '');

  protected readonly openedCount = computed(() => this.grants().length);

  /** Une valeur que le `<select>` natif ne connaît pas est ignorée, pas forcée. */
  protected setLevel(resource: StaffResource, raw: string): void {
    const level = LEVELS.find((entry) => entry.value === raw)?.value;
    if (level !== undefined) {
      this.grants.set(applyLevel(this.grants(), resource, level));
    }
  }
}
