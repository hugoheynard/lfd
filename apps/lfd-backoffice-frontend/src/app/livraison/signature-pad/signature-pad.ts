import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FoldButtonComponent } from 'fold-ng';

/** L'épaisseur du trait, en pixels du cadre. */
const STROKE_WIDTH = 2.5;

/**
 * L'encre et le fond de la PREUVE exportée, fixes : relue plus tard sur
 * n'importe quel fond, elle ne doit pas dépendre du thème de l'écran du
 * livreur. Des valeurs de donnée d'image, pas du style.
 */
export const PROOF_INK = '#111111';
export const PROOF_PAPER = '#ffffff';

/** Un point du tracé, en pixels du cadre. */
export interface InkPoint {
  readonly x: number;
  readonly y: number;
}

/** Ce que l'export utilise d'un contexte 2D — doublable en test. */
export type ProofContext = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'lineCap'
  | 'lineJoin'
  | 'fillRect'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'stroke'
>;

/** Peint la preuve : fond blanc opaque, puis chaque trait à l'encre sombre fixe. */
export function paintProof(
  context: ProofContext,
  strokes: readonly (readonly InkPoint[])[],
  width: number,
  height: number,
): void {
  context.fillStyle = PROOF_PAPER;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = PROOF_INK;
  context.lineWidth = STROKE_WIDTH;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const [first, ...rest] of strokes) {
    if (first === undefined) {
      continue;
    }
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (const point of rest) {
      context.lineTo(point.x, point.y);
    }
    context.stroke();
  }
}

/**
 * **La signature au doigt** (`a-la-porte.md`, B1, AP-D4) — un cadre où la
 * personne signe, au doigt ou au stylet, et un bouton pour recommencer.
 *
 * Le tracé est rendu en PNG à chaque trait levé (`signed`) ; « Effacer » rend
 * `null`. À l'écran, l'encre suit le thème (`color` du cadre, un token fold) ;
 * l'image exportée, elle, est repeinte encre sombre sur fond blanc opaque
 * (`paintProof`) : c'est une preuve.
 */
@Component({
  selector: 'app-signature-pad',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent],
  templateUrl: './signature-pad.html',
  styleUrl: './signature-pad.scss',
})
export class SignaturePad {
  /** Le tracé en PNG, ou `null` : effacé. */
  readonly signed = output<Blob | null>();

  protected readonly drawn = signal(false);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private drawing = false;
  private strokes: InkPoint[][] = [];

  protected start(event: PointerEvent): void {
    const context = this.context();
    if (context === null) {
      return;
    }
    this.drawing = true;
    this.canvas().nativeElement.setPointerCapture(event.pointerId);
    const { x, y } = this.pointOf(event);
    this.strokes.push([{ x, y }]);
    context.beginPath();
    context.moveTo(x, y);
  }

  protected move(event: PointerEvent): void {
    const context = this.context();
    if (!this.drawing || context === null) {
      return;
    }
    const { x, y } = this.pointOf(event);
    this.strokes.at(-1)?.push({ x, y });
    context.lineTo(x, y);
    context.stroke();
    this.drawn.set(true);
  }

  protected end(): void {
    if (!this.drawing) {
      return;
    }
    this.drawing = false;
    if (this.drawn()) {
      this.exportProof();
    }
  }

  /** L'image de preuve, sur un cadre à part : l'écran garde l'encre du thème. */
  private exportProof(): void {
    const shown = this.canvas().nativeElement;
    const proof = document.createElement('canvas');
    proof.width = shown.width;
    proof.height = shown.height;
    const context = proof.getContext('2d');
    if (context === null) {
      return;
    }
    paintProof(context, this.strokes, proof.width, proof.height);
    proof.toBlob((blob) => {
      this.signed.emit(blob);
    }, 'image/png');
  }

  protected clear(): void {
    const element = this.canvas().nativeElement;
    this.context()?.clearRect(0, 0, element.width, element.height);
    this.strokes = [];
    this.drawn.set(false);
    this.signed.emit(null);
  }

  /** Le contexte, réglé sur la taille affichée du cadre (sinon le trait est décalé). */
  private context(): CanvasRenderingContext2D | null {
    const element = this.canvas().nativeElement;
    const context = element.getContext('2d');
    if (context === null) {
      return null;
    }
    if (element.width !== element.clientWidth || element.height !== element.clientHeight) {
      element.width = element.clientWidth;
      element.height = element.clientHeight;
    }
    context.lineWidth = STROKE_WIDTH;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = getComputedStyle(element).color;
    return context;
  }

  private pointOf(event: PointerEvent): { readonly x: number; readonly y: number } {
    const box = this.canvas().nativeElement.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }
}
