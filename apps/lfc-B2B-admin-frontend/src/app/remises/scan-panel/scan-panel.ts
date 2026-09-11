import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import type { OrderHandoverView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { HandoverService } from '../../retrait/handover.service';
import { HandoverQueueService } from '../handover-queue.service';
import { readQrCode, scannerAvailable, tokenOf } from './qr-reader';

/**
 * Ce que la file demande au scanner.
 *
 * 🔴 `expected` est le cœur de cette surface. Ouvert depuis UNE ligne, le
 * scanner sait quelle commande on croit avoir en face ; un code qui en désigne
 * une autre est alors **refusé au lieu d'être honoré**. Ouvert depuis la bande
 * de tête, il vaut `null` : on prend ce qui se présente, comme un comptoir.
 */
export interface ScanPanelData {
  readonly expected: { readonly reference: string; readonly customerLabel: string } | null;
}

/** Ce que le panneau rend à la file : une remise a été gravée. */
export const SCANNED = 'scanned';

type Stage = 'starting' | 'scanning' | 'unsupported' | 'denied' | 'found' | 'done';

/**
 * **Lire le code d'un client, et attester.**
 *
 * ## Pourquoi un scan, et pas un bouton
 *
 * Le scan prouve la **présence** : le code voyage dans le courriel du
 * destinataire, et le lire demande que les deux parties soient là. C'est la
 * seule attestation forte du système. La saisie à la main existe à côté, et
 * elle grave `manual` — faible, et honnête à ce sujet.
 *
 * ## 🔴 Ouvert depuis une ligne, il VÉRIFIE la ligne
 *
 * Un scan lit ce qu'on lui présente, pas ce qu'on a cliqué. Un bouton par ligne
 * pourrait donc remettre la commande du voisin sans que personne ne le voie —
 * et c'est précisément ce qui arrive un matin de coup de feu. Le panneau relit
 * donc le sujet du code AVANT d'attester, et refuse en nommant les deux
 * commandes quand elles diffèrent.
 *
 * C'est ce contrôle qui rend le bouton par ligne meilleur qu'un scanner global,
 * et non l'inverse.
 *
 * ## Quand le navigateur ne sait pas lire
 *
 * `BarcodeDetector` n'existe pas partout. Le panneau le dit et bascule sur la
 * saisie du numéro — le même chemin de secours que la file, gravé `manual`.
 * Une surface qui échouerait en silence enverrait quelqu'un chercher une
 * caméra cassée.
 */
@Component({
  selector: 'app-scan-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './scan-panel.html',
  styleUrl: './scan-panel.scss',
})
export class ScanPanel implements FoldPanelContent<ScanPanelData> {
  static readonly foldPanel: FoldPanelDefaults = { width: 'md' };

  readonly data = input<ScanPanelData | undefined>();

  private readonly handovers = inject(HandoverService);
  private readonly queue = inject(HandoverQueueService);
  private readonly notify = inject(NotifyService);
  private readonly panel = inject(FoldPanelRef);

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('preview');

  protected readonly stage = signal<Stage>('starting');
  protected readonly busy = signal(false);
  protected readonly typed = signal('');
  protected readonly mismatch = signal<string | null>(null);
  protected readonly subject = signal<OrderHandoverView | null>(null);

  /** La commande qu'on croit avoir en face, quand le scan part d'une ligne. */
  protected readonly expected = computed(() => this.data()?.expected ?? null);

  private stream: MediaStream | null = null;
  private stopped = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.release());
    effect(() => {
      const element = this.video()?.nativeElement;
      if (element !== undefined && this.stage() === 'starting') {
        void this.start(element);
      }
    });
  }

  /**
   * Ouvre la caméra et lit en boucle jusqu'au premier code.
   *
   * L'ordre compte : on refuse AVANT d'allumer la caméra quand le navigateur ne
   * sait pas lire, plutôt que d'allumer une lumière qui ne servira à rien.
   */
  private async start(element: HTMLVideoElement): Promise<void> {
    if (!scannerAvailable()) {
      this.stage.set('unsupported');
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
    } catch {
      // Permission refusée, ou aucune caméra. Les deux se disent pareil à
      // l'équipe : on ne peut pas lire, voici l'autre chemin.
      this.stage.set('denied');
      return;
    }
    element.srcObject = this.stream;
    await element.play().catch(() => undefined);
    this.stage.set('scanning');
    void this.readLoop(element);
  }

  private async readLoop(element: HTMLVideoElement): Promise<void> {
    while (!this.stopped && this.stage() === 'scanning') {
      const value = await readQrCode(element);
      if (value !== null) {
        this.release();
        await this.inspect(value);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, SCAN_INTERVAL_MS));
    }
  }

  /**
   * Relit le sujet du code, **avant** d'attester quoi que ce soit.
   *
   * 🔴 Deux lectures et non une : le comptoir doit voir ce qu'il s'apprête à
   * remettre. Attester d'un trait sur un code à peine lu, c'est tendre un sac
   * sur la foi d'un pixel.
   */
  private async inspect(scanned: string): Promise<void> {
    const token = tokenOf(scanned);
    if (token === null) {
      this.stage.set('unsupported');
      return;
    }
    this.busy.set(true);
    try {
      const view = await this.handovers.byToken(token);
      const expected = this.expected();
      if (expected !== null && view.orderNumber !== expected.reference) {
        this.mismatch.set(view.orderNumber);
        this.stage.set('found');
        return;
      }
      this.subject.set(view);
      this.stage.set('found');
      this.token = token;
    } catch (caught) {
      this.notify.error(caught, "Ce code n'a désigné aucune commande.");
      this.panel.close();
    } finally {
      this.busy.set(false);
    }
  }

  private token: string | null = null;

  /** Atteste la remise par le SCAN — l'attestation forte. */
  protected async confirm(): Promise<void> {
    const token = this.token;
    if (token === null) {
      return;
    }
    this.busy.set(true);
    try {
      await this.handovers.confirm(token);
      this.stage.set('done');
      this.panel.close(SCANNED);
    } catch (caught) {
      this.notify.error(caught, "Cette remise n'a pas pu être enregistrée.");
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Le chemin de secours : le NUMÉRO, saisi. Il grave `manual`, et l'écran le
   * dit — une remise saisie n'a eu qu'une partie.
   */
  protected async remitTyped(): Promise<void> {
    const reference = this.typed().trim();
    if (reference === '') {
      return;
    }
    this.busy.set(true);
    try {
      await this.queue.confirmManually(reference);
      this.panel.close(SCANNED);
    } catch (caught) {
      this.notify.error(caught, "Cette remise n'a pas pu être enregistrée.");
    } finally {
      this.busy.set(false);
    }
  }

  protected close(): void {
    this.panel.close();
  }

  /** Coupe la caméra. Appelé au premier code lu ET à la fermeture. */
  private release(): void {
    this.stopped = true;
    for (const track of this.stream?.getTracks() ?? []) {
      track.stop();
    }
    this.stream = null;
  }
}

/** Entre deux lectures. Assez court pour être instantané, assez long pour ne pas chauffer. */
const SCAN_INTERVAL_MS = 250;
