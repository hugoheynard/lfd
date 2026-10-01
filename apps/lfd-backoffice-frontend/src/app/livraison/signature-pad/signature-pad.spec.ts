import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import {
  paintProof,
  PROOF_INK,
  PROOF_PAPER,
  type ProofContext,
  SignaturePad,
} from './signature-pad';

describe('SignaturePad — la signature au doigt (B1)', () => {
  it('ouvre un cadre vide : « Effacer » est inactif tant que rien n’est tracé', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(SignaturePad);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[data-signature-surface]')).not.toBeNull();
    expect(element.querySelector<HTMLButtonElement>('[data-signature-clear]')?.disabled).toBe(true);
  });
});

/** Un contexte 2D qui note ce qu'on lui peint, et avec quelle encre. */
class RecordingContext implements ProofContext {
  fillStyle: ProofContext['fillStyle'] = '';
  strokeStyle: ProofContext['strokeStyle'] = '';
  lineWidth = 1;
  lineCap: CanvasLineCap = 'butt';
  lineJoin: CanvasLineJoin = 'miter';
  readonly calls: string[] = [];

  fillRect(x: number, y: number, w: number, h: number): void {
    this.calls.push(
      `fill ${String(this.fillStyle)} ${String(x)},${String(y)},${String(w)},${String(h)}`,
    );
  }
  beginPath(): void {
    this.calls.push('begin');
  }
  moveTo(x: number, y: number): void {
    this.calls.push(`move ${String(x)},${String(y)}`);
  }
  lineTo(x: number, y: number): void {
    this.calls.push(`line ${String(x)},${String(y)}`);
  }
  stroke(): void {
    this.calls.push(`stroke ${String(this.strokeStyle)}`);
  }
}

describe('paintProof — la signature exportée est une preuve, pas un écran', () => {
  it('fond blanc opaque sur tout le cadre, puis encre sombre FIXE, quel que soit le thème', () => {
    const context = new RecordingContext();
    // Ce que le thème sombre aurait posé à l'écran : l'export doit l'ignorer.
    context.strokeStyle = 'rgb(240, 240, 240)';

    paintProof(
      context,
      [
        [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
        [],
        [{ x: 5, y: 6 }],
      ],
      300,
      160,
    );

    expect(PROOF_PAPER).toBe('#ffffff');
    expect(PROOF_INK).toBe('#111111');
    expect(context.calls).toEqual([
      'fill #ffffff 0,0,300,160',
      'begin',
      'move 1,2',
      'line 3,4',
      'stroke #111111',
      'begin',
      'move 5,6',
      'stroke #111111',
    ]);
  });
});
