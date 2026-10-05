import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CompanyRefView } from '@lfd/contracts';
import { FoldBadgeComponent } from 'fold-ng';

/**
 * **« Sous-compte de _Principal_ »** — le badge cliquable vers la fiche du
 * principal (`plan-sous-comptes.md` §4, R9).
 *
 * Un composant et non trois copies : la liste, la fiche et le cockpit le
 * posent, et une phrase écrite trois fois finit par se dire de trois façons.
 *
 * 🔴 `stopPropagation` : posé dans une ligne cliquable de `fold-data-table`,
 * le clic remonterait et la ligne ouvrirait la fiche du SOUS-compte par-dessus
 * celle du principal (même piège que la pastille d'alertes de la liste).
 */
@Component({
  selector: 'app-sub-account-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FoldBadgeComponent],
  templateUrl: './sub-account-badge.html',
  styleUrl: './sub-account-badge.scss',
})
export class SubAccountBadge {
  /** Le principal dont la société est le sous-compte. */
  readonly parent = input.required<CompanyRefView>();
}
