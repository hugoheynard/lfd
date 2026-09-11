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
import { readQrCode, scannerAvailable, tokenOf } from './qr-reader';

/**
 * Ce que la file demande au scanner.
 *
 * 🔴 `expected` est le cœur de cette surface. Ouvert depuis UNE ligne, le
 * scanner sait quelle commande on croit avoir en face ; un code qui en désigne
 * une autre est alors **refusé au lieu d'être honoré**. Ouvert depuis la bande
 * de tête, il vaut `null` : on prend ce qui se présente, comme un comptoir.
 */
export interface ScanDialogData {
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
 * ## 🔴 Ouvert sur une commande, il VÉRIFIE cette commande
 *
 * Un scan lit ce qu'on lui présente, pas ce qu'on a ouvert. Quand le dialogue
 * part du RAIL, une commande est sous les yeux de l'équipe — elle vient de lire
 * le sac, ligne par ligne — et un code qui en désigne une autre serait honoré
 * en silence. Le dialogue relit donc le sujet du code AVANT d'attester, et
 * refuse en nommant les deux commandes quand elles diffèrent.
 *
 * Ouvert depuis la barre de la file, il vaut `null` : on prend ce qui se
 * présente, comme un comptoir.
 *
 * ⚠️ Ce paragraphe a justifié le contrôle par une comparaison entre « un bouton
 * de scan par ligne » et « un scanner global » jusqu'au 2026-09-11. Le bouton
 * par ligne a été supprimé le même jour : la comparaison n'a plus de second
 * terme, et laisser l'ancienne raison ferait juger ce garde-fou périmé alors
 * qu'il sert un cas qui existe toujours — celui du rail.
 *
 * ## Quand le navigateur ne sait pas lire
 *
 * `BarcodeDetector` n'existe pas partout. Le dialogue le DIT, et s'arrête là.
 * Une surface qui échouerait en silence enverrait quelqu'un chercher une caméra
 * cassée.
 *
 * 🔴 Il ne propose PAS la saisie du numéro, et c'est un retrait délibéré du
 * 2026-09-11. Ce dialogue ne sait faire qu'une chose : lire un code. La remise
 * saisie existe toujours — sur le rail, à côté du sac qu'on regarde, où elle a
 * un sujet. Offrir les deux ici, dont l'un sous une caméra allumée, revenait à
 * mettre le chemin faible à portée du geste pressé.
 */
@Component({
  selector: 'app-scan-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './scan-dialog.html',
  styleUrl: './scan-dialog.scss',
})
export class ScanDialog implements FoldPanelContent<ScanDialogData> {
  /**
   * **Un dialogue, pas une feuille latérale** (fold 0.27).
   *
   * 🔴 Le côté n'est pas un goût : une feuille latérale travaille À CÔTÉ de la
   * page — on lit l'une en gardant l'autre — et c'est exactement ce que le scan
   * ne fait pas. Il suspend tout : on lève un code devant une caméra, le client
   * en face, et il n'y a rien d'autre à lire pendant ce temps.
   *
   * Et une raison de mécanique : sur écran étroit, le rail de cette page monte
   * en feuille `fixed`. Un panneau latéral s'ancre DANS la région de contenu,
   * donc il passait dessous — on ouvrait le scanner et on ne le voyait pas.
   * `center` est le seul côté qui quitte cette région.
   */
  static readonly foldPanel: FoldPanelDefaults = {
    width: 'sm',
    side: 'center',
    // 🔴 Opaque, pas du verre dépoli. Le dialogue est déjà posé sur un scrim
    // qui floute la page sur un téléphone : deux transparences l'une sur
    // l'autre donnent un gris de vitre sale, et le contenu y perd le contraste
    // d'une surface qui se tient toute seule. Une feuille latérale peut être en
    // verre — elle borde une page qu'on lit encore ; un dialogue, non : ce
    // qu'il montre est la seule chose à lire.
    surface: 'solid',
  };

  readonly data = input<ScanDialogData | undefined>();

  private readonly handovers = inject(HandoverService);
  private readonly notify = inject(NotifyService);
  private readonly panel = inject(FoldPanelRef);

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('preview');

  protected readonly stage = signal<Stage>('starting');
  protected readonly busy = signal(false);
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
