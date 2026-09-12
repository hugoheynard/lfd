import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelDefaults,
} from 'fold-ng';

import { captureFileName, frameSize, JPEG_QUALITY } from './capture-frame';

/** Où en est la prise de vue. */
type Stage = 'starting' | 'framing' | 'denied' | 'unsupported' | 'review';

/**
 * **Photographier l'extrait KBIS**, sans quitter l'écran.
 *
 * ## Pourquoi un dialogue, et pas `<input capture>`
 *
 * `capture` donne la main à l'appareil photo du système : on sort de l'app, et
 * le fichier revient **sans qu'on ait relu sa lisibilité**. Un extrait flou se
 * découvre alors à la certification, c'est-à-dire au bureau, une semaine plus
 * tard — et il faut retourner voir le client. Ici la photo se **revoit avant
 * d'être envoyée**, et se reprend sur place tant qu'elle n'est pas lisible.
 * C'est la seule chose que ce dialogue ajoute, et c'est toute sa raison d'être.
 *
 * ## Un dialogue, pas une feuille latérale
 *
 * Une feuille travaille À CÔTÉ de la page — on lit l'une en gardant l'autre.
 * Photographier ne se fait pas à côté : on tient l'appareil au-dessus d'un
 * document, il n'y a rien d'autre à lire pendant ce temps. Même raisonnement
 * que le scanner de la file de remise, et même `side: 'center'`.
 *
 * ## Ce qu'il ne fait pas
 *
 * **Aucun envoi.** Il rend un `File` à celui qui l'a ouvert, et c'est la carte
 * qui dépose — par le même chemin que le sélecteur de fichiers. Deux
 * téléversements pour une même pièce donneraient deux endroits où traiter
 * l'échec, et un seul serait corrigé.
 *
 * ⚠️ Nommé pour son unique usage. Rien dedans n'est propre au KBIS sauf trois
 * chaînes ; le jour où un mandat SEPA se photographie aussi, il devient
 * `DocumentCapturePanel` et prend son titre en données. Généraliser au SECOND
 * usage, pas au premier.
 */
@Component({
  selector: 'lfd-kbis-capture-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './kbis-capture-panel.html',
  styleUrl: './kbis-capture-panel.scss',
})
export class KbisCapturePanel {
  static readonly foldPanel: FoldPanelDefaults = {
    width: 'sm',
    side: 'center',
    // Opaque : ce que le dialogue montre est la seule chose à lire, et deux
    // transparences l'une sur l'autre donnent un gris de vitre sale.
    surface: 'solid',
  };

  private readonly panel = inject(FoldPanelRef<File>);

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('preview');

  protected readonly stage = signal<Stage>('starting');
  protected readonly busy = signal(false);
  /** L'aperçu de la photo prise, en `blob:` — révoqué à la fermeture. */
  protected readonly shot = signal<string | null>(null);

  private stream: MediaStream | null = null;
  private taken: File | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.release();
      this.forgetShot();
    });
    effect(() => {
      const element = this.video()?.nativeElement;
      if (element !== undefined && this.stage() === 'starting') {
        void this.start(element);
      }
    });
  }

  /** Ouvre la caméra arrière — celle qui regarde le document, pas le visage. */
  private async start(element: HTMLVideoElement): Promise<void> {
    if (typeof navigator?.mediaDevices?.getUserMedia !== 'function') {
      this.stage.set('unsupported');
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
    } catch {
      // Autorisation refusée, ou aucune caméra. Les deux se disent pareil à
      // l'équipe : on ne peut pas photographier, voici l'autre chemin.
      this.stage.set('denied');
      return;
    }
    element.srcObject = this.stream;
    await element.play().catch(() => undefined);
    this.stage.set('framing');
  }

  /**
   * Déclenche : fige l'image du flux, la borne, et passe en relecture.
   *
   * La caméra est **coupée** dès la prise : la relecture n'en a pas besoin, et
   * laisser la diode allumée devant un client pendant qu'on examine une photo
   * est au mieux impoli.
   */
  protected async shoot(): Promise<void> {
    const element = this.video()?.nativeElement;
    if (element === undefined) {
      return;
    }
    this.busy.set(true);
    try {
      const file = await capture(element);
      if (file === null) {
        this.stage.set('unsupported');
        return;
      }
      this.release();
      this.taken = file;
      this.forgetShot();
      this.shot.set(URL.createObjectURL(file));
      this.stage.set('review');
    } finally {
      this.busy.set(false);
    }
  }

  /** Jette la photo et rallume la caméra — le geste qu'un `<input capture>` n'offre pas. */
  protected retake(): void {
    this.taken = null;
    this.forgetShot();
    this.stage.set('starting');
  }

  /** Rend la photo à la carte, qui déposera. */
  protected use(): void {
    if (this.taken !== null) {
      this.panel.close(this.taken);
    }
  }

  /** Coupe la caméra. Appelé à la prise ET à la fermeture. */
  private release(): void {
    for (const track of this.stream?.getTracks() ?? []) {
      track.stop();
    }
    this.stream = null;
  }

  /**
   * Libère l'URL de l'aperçu.
   *
   * Un `blob:` non révoqué garde ses octets en mémoire pour la durée du
   * document : trois photos reprises, et on traîne trois images de plusieurs
   * mégaoctets sur un téléphone.
   */
  private forgetShot(): void {
    const url = this.shot();
    if (url !== null) {
      URL.revokeObjectURL(url);
      this.shot.set(null);
    }
  }
}

/**
 * Fige l'image courante du flux en JPEG borné — ou `null` si le navigateur ne
 * sait pas peindre (`2d` absent) ou n'a rien rendu.
 */
async function capture(element: HTMLVideoElement): Promise<File | null> {
  const size = frameSize(element.videoWidth, element.videoHeight);
  if (size.width === 0) {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (context === null) {
    return null;
  }
  context.drawImage(element, 0, 0, size.width, size.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (blob === null) {
    return null;
  }
  return new File([blob], captureFileName(new Date()), { type: 'image/jpeg' });
}
