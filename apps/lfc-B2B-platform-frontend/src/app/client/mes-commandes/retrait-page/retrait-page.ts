import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import type { OrderView } from '@lfd/contracts';
import { QrCode } from '@lfd/b2b-ui/order';
import { map } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../../auth/auth.config';
import { ClientChrome } from '../../client-chrome.service';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { ClientOrderHistory } from '../client-order-history.service';

/** L'écran ne peut être que dans un de ces états, et il n'en montre qu'un. */
type Phase = 'loading' | 'ready' | 'none';

/**
 * **Le QR de retrait**, côté client.
 *
 * 🔴 Le jeton existait, descendait jusqu'au navigateur (`OrderView.handoverToken`)
 * et **aucun écran ne l'affichait** : la confirmation promettait « le QR de
 * retrait est dedans » derrière un bouton qui répondait « cet écran arrive au
 * prochain lot ». Le staff, lui, avait déjà sa route de scan (`/retrait/:token`)
 * et sa règle de remise. Il manquait cette page-ci, et elle seule.
 *
 * ## Le code encode une URL de l'app ADMIN
 *
 * C'est le staff qui scanne, avec l'appareil photo natif de son téléphone : le
 * code doit donc **ouvrir quelque chose chez lui**. Le client ne fait que
 * présenter son écran. Un code qui n'encoderait que le jeton obligerait le staff
 * à ouvrir une application avant de scanner — au comptoir, ce geste de plus est
 * celui qu'on ne fait pas.
 *
 * ## Trois raisons de n'avoir aucun code, et la même conduite
 *
 * Une commande en **coursier** n'a pas de jeton (il n'y a pas de comptoir), une
 * commande **déjà remise** non plus, et une **origine admin non configurée**
 * fabriquerait un code qui ouvre le vide devant quelqu'un qui attend son sac.
 * Dans les trois cas l'écran le dit, plutôt que d'afficher un carré inutile.
 *
 * ## Elle se relit, elle ne se retient pas
 *
 * La commande est **relue au serveur** par son identifiant, pas reprise du
 * décompte local : ce QR se rouvre le lendemain matin, depuis « Mes commandes »
 * ou depuis un signet, et il doit valoir à ce moment-là.
 */
@Component({
  selector: 'app-retrait-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QrCode],
  templateUrl: './retrait-page.html',
  styleUrl: './retrait-page.scss',
})
export class RetraitPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly chrome = inject(ClientChrome);
  private readonly history = inject(ClientOrderHistory);

  protected readonly t = inject(ClientCopyService).t;

  /** L'identifiant lu du segment de route (l'app ne lie pas les inputs de route). */
  private readonly id = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('id') ?? '')),
    { initialValue: '' },
  );

  protected readonly phase = signal<Phase>('loading');
  private readonly order = signal<OrderView | null>(null);

  protected readonly reference = computed(() => this.order()?.orderNumber ?? '');

  /**
   * L'URL que le code encode, ou `null` — et `null` n'est pas un échec, c'est
   * une commande qui ne se remet pas au comptoir.
   */
  protected readonly handoverUrl = computed<string | null>(() => {
    const token = this.order()?.handoverToken ?? null;
    if (token === null || AUTH_CONFIG.adminBaseUrl === '') {
      return null;
    }
    return `${AUTH_CONFIG.adminBaseUrl}/retrait/${encodeURIComponent(token)}`;
  });

  /**
   * Ce qu'on dit quand il n'y a pas de code : la raison, pas un écran vide.
   *
   * 🔴 **Une livraison a un code depuis le 2026-09-07**, et cet écran disait le
   * contraire : « il n'y a pas de code à présenter ». C'était vrai tant que le
   * jeton n'était émis qu'en retrait ; ça ne l'est plus. Le destinataire montre
   * le même code, et c'est le coursier qui scanne.
   *
   * Reste le cas d'une commande **antérieure** à ce changement : elle n'a pas de
   * jeton et n'en aura jamais — en fabriquer un rétroactivement inventerait un
   * secret que personne n'a reçu. `unavailable` le dit sans mentir sur la cause.
   */
  protected readonly noCodeReason = computed(() =>
    this.order() === null ? this.t().qr.unknown : this.t().qr.unavailable,
  );

  protected readonly whenLabel = computed(() => {
    const day = this.order()?.requestedDeliveryDate ?? null;
    return day === null ? '' : fill(this.t().qr.when, { day });
  });

  constructor() {
    this.chrome.kicker.set(this.t().chrome.kickerQr);
    this.chrome.back.set((): void => {
      void this.router.navigate(['/mes-commandes']);
    });
    void this.load();
  }

  private async load(): Promise<void> {
    const order = await this.history.byId(this.id());
    this.order.set(order);
    this.phase.set(order === null ? 'none' : 'ready');
  }
}
