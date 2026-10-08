import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';
import { NEW_VERSION, NEW_VERSION_BANNER, newVersionModeOf } from '@lfd/front-ops';

/**
 * **« Une nouvelle version est en ligne »**, sur les écrans qui ne rechargent
 * pas d'eux-mêmes (`data.newVersion === "banner"` — « Ma tournée » et le
 * chargement, sous `/coursier`).
 *
 * Partout ailleurs, la veille de `@lfd/front-ops` recharge à la navigation
 * suivante et ce bandeau ne s'affiche pas. Sur le terrain, un livreur ne doit
 * pas voir son écran repartir de zéro : c'est lui qui choisit l'instant
 * (`documentation/ci-cd/plan-nouvelle-version-des-fronts.md`, N3).
 */
@Component({
  selector: 'app-new-version-banner',
  imports: [FoldCalloutComponent, FoldButtonComponent],
  templateUrl: './new-version-banner.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewVersionBanner {
  private readonly router = inject(Router);
  private readonly newVersion = inject(NEW_VERSION);

  private readonly onBannerRoute = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.currentModeIsBanner()),
    ),
    { initialValue: this.currentModeIsBanner() },
  );

  protected readonly visible = computed(() => this.newVersion() && this.onBannerRoute());

  protected reload(): void {
    window.location.reload();
  }

  private currentModeIsBanner(): boolean {
    return newVersionModeOf(this.router.routerState.snapshot.root) === NEW_VERSION_BANNER;
  }
}
