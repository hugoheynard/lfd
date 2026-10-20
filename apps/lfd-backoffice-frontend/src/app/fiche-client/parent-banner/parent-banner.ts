import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { FollowedAspectView, ParentCompanyView } from '@lfd/contracts';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

/**
 * **« Site de _Principal_ » / « Entité rattachée à _Principal_ »** — le
 * bandeau d'une fiche de sous-compte, avec le lien vers son principal
 * (`sous-comptes.md` §4).
 *
 * Il portait le geste « Détacher » jusqu'au 2026-10-20 ; Hugo l'a déplacé
 * dans la grille de la page Sous-comptes du principal (`FollowGrid`), avec
 * les cases de suivi. Le bandeau y renvoie.
 */
@Component({
  selector: 'app-parent-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FoldButtonComponent, FoldCalloutComponent],
  templateUrl: './parent-banner.html',
})
export class ParentBanner {
  readonly parent = input.required<ParentCompanyView>();
  readonly follows = input.required<readonly FollowedAspectView[]>();

  protected readonly kindLabel = computed(() =>
    this.follows().some((follow) => follow.aspect === 'billing') ? 'Site de' : 'Entité rattachée à',
  );
}
