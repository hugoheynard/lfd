import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs/operators';

import { ClientChrome } from '../../client-chrome.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { RetraitQr } from '../retrait-qr/retrait-qr';

/**
 * **La page du QR de retrait** — l'adresse partageable (`/mes-commandes/retrait/:id`),
 * et la forme du bureau. En pile, « Mon QR » ouvre `RetraitPanel` à la
 * place (Hugo, 2026-10-27). Le contenu est le même composant, {@link RetraitQr}.
 */
@Component({
  selector: 'app-retrait-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RetraitQr],
  templateUrl: './retrait-page.html',
  styleUrl: './retrait-page.scss',
})
export class RetraitPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly chrome = inject(ClientChrome);
  private readonly location = inject(Location);
  private readonly t = inject(ClientCopyService).t;

  protected readonly id = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('id') ?? '')),
    { initialValue: '' },
  );

  constructor() {
    this.chrome.kicker.set(this.t().chrome.kickerQr);
    // Retour là d'où l'on vient — l'accueil, la confirmation, la liste
    // (Hugo, 2026-10-27) ; arrivé par l'adresse seule, la liste.
    this.chrome.back.set((): void => {
      if (this.router.lastSuccessfulNavigation()?.previousNavigation) {
        this.location.back();
        return;
      }
      void this.router.navigate(['/mes-commandes']);
    });
  }
}
