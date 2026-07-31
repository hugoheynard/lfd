import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FoldCalloutComponent } from 'fold-ng';
import type { FoldCalloutVariant } from 'fold-ng';

/**
 * Rendu de repli quand une app n'est pas montable : soit une **tuile stub**
 * (app pas encore construite, `remoteName` absent), soit un **remote injoignable**
 * (deploy KO / réseau) — l'error boundary du montage retombe ici. Le reste de la
 * suite reste utilisable : c'est l'isolation des pannes rendue visible.
 */
@Component({
  selector: 'app-app-unavailable',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent],
  template: `
    <div class="wrap">
      <fold-callout [variant]="variant()">
        <strong>{{ title() }}</strong>
        <br />
        {{ message() }}
      </fold-callout>
    </div>
  `,
  styles: `
    .wrap {
      padding: var(--fold-space-lg);
      max-width: 40rem;
    }
  `,
})
export class AppUnavailable {
  /** `'stub'` = pas encore construite ; `'error'` = remote injoignable. */
  readonly reason = input<'stub' | 'error'>('stub');
  readonly appTitle = input<string>('');

  protected readonly variant = computed<FoldCalloutVariant>(() =>
    this.reason() === 'stub' ? 'info' : 'warning',
  );

  protected readonly title = computed<string>(() =>
    this.reason() === 'stub'
      ? `${this.appTitle()} — bientôt disponible`
      : `${this.appTitle()} est indisponible`,
  );

  protected readonly message = computed<string>(() =>
    this.reason() === 'stub'
      ? "Cette app n'est pas encore construite. Elle apparaîtra ici dès qu'elle sera publiée."
      : "Impossible de charger l'app pour le moment. Les autres apps de la suite restent accessibles.",
  );
}
