import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';
import { NEW_VERSION } from '@lfd/front-ops';

/**
 * **« Une nouvelle version est disponible »**, sur TOUT le back-office, en
 * bande fine sous l'en-tête (Hugo, 2026-10-14).
 *
 * Jusqu'au 2026-10-14, le bandeau ne s'affichait que sur les écrans qui ne
 * rechargent pas d'eux-mêmes (`data.newVersion === "banner"`, sous
 * `/coursier`). Il prévient désormais partout : la personne finit son
 * opération et choisit l'instant. La veille de `@lfd/front-ops` reste seule
 * juge du rechargement à la navigation
 * (`documentation/ci-cd/plan-nouvelle-version-des-fronts.md`, N3).
 */
@Component({
  selector: 'app-new-version-banner',
  imports: [FoldCalloutComponent, FoldButtonComponent],
  templateUrl: './new-version-banner.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewVersionBanner {
  protected readonly visible = inject(NEW_VERSION);

  protected reload(): void {
    window.location.reload();
  }
}
