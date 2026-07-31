import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import type { SafeResourceUrl } from '@angular/platform-browser';

/**
 * Cadre d'une app hostée : une `<iframe>` plein content vers l'URL de l'app.
 * L'app tourne telle quelle (sa chrome, ses panels, son scroll) — standalone
 * === embarqué. Le shell ne fait que la cadrer.
 *
 * `url`/`appTitle` sont liés depuis les `data` de la route (withComponentInputBinding).
 */
@Component({
  selector: 'app-app-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <iframe
      class="frame"
      [src]="safeUrl()"
      [title]="appTitle()"
      referrerpolicy="no-referrer"
    ></iframe>
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
      min-block-size: 0;
    }
    .frame {
      display: block;
      inline-size: 100%;
      block-size: 100%;
      border: 0;
    }
  `,
})
export class AppFrame {
  /** URL de base de l'app hostée. */
  readonly url = input.required<string>();
  /** Libellé (attribut `title` de l'iframe, a11y). */
  readonly appTitle = input<string>('');

  private readonly sanitizer = inject(DomSanitizer);

  protected readonly safeUrl = computed<SafeResourceUrl>(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(this.url()),
  );
}
