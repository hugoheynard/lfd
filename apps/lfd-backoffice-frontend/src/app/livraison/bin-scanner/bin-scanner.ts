import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent, FoldLoadingStateComponent } from 'fold-ng';

import { readQrCode, scannerAvailable } from '../../handover-shop/scan-dialog/qr-reader';

type Stage = 'off' | 'starting' | 'scanning' | 'denied';

/** Un décodeur d'image : le contenu du premier QR visible, ou `null`. */
type FrameDecoder = (video: HTMLVideoElement) => Promise<string | null>;

/** Entre deux lectures : assez court pour être instantané, assez long pour ne pas chauffer. */
const SCAN_INTERVAL_MS = 250;
/** Un même code relu dans ce délai est le même bac tenu devant la caméra, pas un second scan. */
const SAME_CODE_MS = 3000;
/** Le décodeur JS lit une image réduite : un QR d'étiquette tient large dans 640 px. */
const DECODE_WIDTH = 640;

/**
 * **Lire le QR d'un bac, sur n'importe quel appareil** (L4-C10).
 *
 * Deux chemins : `BarcodeDetector` quand le navigateur l'a (Chrome, Edge), et
 * sinon **jsQR** (Apache-2.0), un décodeur en JavaScript pur — Safari et
 * Firefox n'ont pas l'API native, et au dépôt on ne choisit pas le téléphone.
 *
 * 🔴 jsQR est importé **dynamiquement, ici et seulement ici**, au premier
 * allumage de la caméra sur un navigateur sans API native : jamais dans un
 * service racine, donc jamais dans le paquet de démarrage. Un poste Chrome ne
 * le télécharge jamais.
 *
 * Le composant LIT et émet ce qu'il a lu, tel quel : c'est l'écran qui décide
 * si c'est un bac (`scannedBin`) et qui charge. La caméra ne s'allume que sur
 * un geste — une page qui s'ouvre ne demande pas l'appareil photo.
 */
@Component({
  selector: 'app-bin-scanner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FoldLoadingStateComponent],
  templateUrl: './bin-scanner.html',
  styleUrl: './bin-scanner.scss',
})
export class BinScanner {
  /** Un chargement en vol : on continue de filmer, on n'émet plus. */
  readonly paused = input(false);

  /** Le contenu brut d'un QR lu. */
  readonly scanned = output<string>();

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('preview');

  protected readonly stage = signal<Stage>('off');

  private stream: MediaStream | null = null;
  private last: { readonly value: string; readonly at: number } | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  /** Cet appareil a-t-il une caméra que la page peut demander ? */
  protected readonly cameraAvailable =
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';

  protected async start(): Promise<void> {
    this.stage.set('starting');
    try {
      // La caméra d'abord : refusée, le décodeur n'est jamais téléchargé.
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      const decode = await this.decoder();
      const element = this.video()?.nativeElement;
      if (element === undefined) {
        this.stop();
        return;
      }
      element.srcObject = this.stream;
      await element.play().catch(() => undefined);
      this.stage.set('scanning');
      void this.loop(element, decode);
    } catch {
      // Permission refusée, aucune caméra, ou décodeur introuvable : les trois
      // se disent pareil — on ne peut pas lire, le code se tape.
      this.stop();
      this.stage.set('denied');
    }
  }

  protected stop(): void {
    for (const track of this.stream?.getTracks() ?? []) {
      track.stop();
    }
    this.stream = null;
    if (this.stage() !== 'denied') {
      this.stage.set('off');
    }
  }

  private async loop(element: HTMLVideoElement, decode: FrameDecoder): Promise<void> {
    while (this.stage() === 'scanning') {
      const value = await decode(element);
      if (value !== null && !this.paused() && this.isNew(value)) {
        this.scanned.emit(value);
      }
      await new Promise((resolve) => setTimeout(resolve, SCAN_INTERVAL_MS));
    }
  }

  /** Un bac tenu devant la caméra se lit dix fois par seconde : on n'en émet qu'une. */
  private isNew(value: string): boolean {
    const now = performance.now();
    const fresh =
      this.last === null || this.last.value !== value || now - this.last.at > SAME_CODE_MS;
    this.last = { value, at: now };
    return fresh;
  }

  /** L'API native si elle existe ; sinon jsQR, chargé à cet instant. */
  private async decoder(): Promise<FrameDecoder> {
    if (scannerAvailable()) {
      return readQrCode;
    }
    const { default: jsQR } = await import('jsqr');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    return (video) => {
      const { videoWidth, videoHeight } = video;
      if (context === null || videoWidth === 0 || videoHeight === 0) {
        return Promise.resolve(null);
      }
      const scale = Math.min(1, DECODE_WIDTH / videoWidth);
      canvas.width = Math.round(videoWidth * scale);
      canvas.height = Math.round(videoHeight * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(image.data, image.width, image.height, {
        inversionAttempts: 'dontInvert',
      });
      return Promise.resolve(code?.data ?? null);
    };
  }
}
