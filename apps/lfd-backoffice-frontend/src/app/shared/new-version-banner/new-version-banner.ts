import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';
import { NEW_VERSION, NEW_VERSION_BANNER, newVersionModeOf } from '@lfd/front-ops';
import { filter, map } from 'rxjs';

/**
 * **« Une nouvelle version est disponible »**, sur les seuls écrans qui ne
 * rechargent pas d'eux-mêmes (`data.newVersion === "banner"`, sous
 * `/coursier` : un livreur en tournée ne voit pas son écran repartir de zéro).
 *
 * Partout ailleurs, la version neuve se prend à la navigation suivante, sans
 * bandeau (Hugo, 2026-11-06 : « naviguer sans s'en rendre compte ») — ce qui
 * met fin au bandeau sur tout le back-office du 2026-10-14
 * (`documentation/ci-cd/plan-nouvelle-version-des-fronts.md`, N3).
 */
@Component({
  selector: 'app-new-version-banner',
  imports: [FoldCalloutComponent, FoldButtonComponent],
  templateUrl: './new-version-banner.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewVersionBanner {
  private readonly newVersion = inject(NEW_VERSION);
  private readonly router = inject(Router);

  private readonly bannerRoute = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.isBannerRoute()),
    ),
    { initialValue: this.isBannerRoute() },
  );

  protected readonly visible = computed(() => this.newVersion() && this.bannerRoute());

  protected reload(): void {
    window.location.reload();
  }

  private isBannerRoute(): boolean {
    return newVersionModeOf(this.router.routerState.snapshot.root) === NEW_VERSION_BANNER;
  }
}
