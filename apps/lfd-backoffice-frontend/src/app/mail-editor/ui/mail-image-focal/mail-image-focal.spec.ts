import { TestBed } from '@angular/core/testing';
import type { ImageFocal } from '@lfd/mail-blocks';
import { describe, expect, it } from 'vitest';

import { MailImageFocal } from './mail-image-focal';

function render(focal: ImageFocal | undefined) {
  const fixture = TestBed.createComponent(MailImageFocal);
  fixture.componentRef.setInput('src', 'https://m.fr/a.webp');
  fixture.componentRef.setInput('focal', focal);
  fixture.detectChanges();
  const emitted: ImageFocal[] = [];
  fixture.componentInstance.focalChange.subscribe((next) => emitted.push(next));
  const element: HTMLElement = fixture.nativeElement;
  const target = element.querySelector<HTMLButtonElement>('[data-focal-target]')!;
  return { fixture, element, emitted, target };
}

describe('MailImageFocal', () => {
  it('sans point posé, le repère est au centre et la position le dit', () => {
    const { element } = render(undefined);
    const reticle = element.querySelector<HTMLElement>('[data-focal-reticle]')!;
    expect(reticle.style.left).toBe('50%');
    expect(element.querySelector('[data-focal-position]')?.textContent).toContain(
      '50 % depuis la gauche',
    );
  });

  it('un clic pose le point en fractions de l’image', () => {
    const { target, emitted } = render(undefined);
    target.getBoundingClientRect = () => new DOMRect(100, 50, 200, 100);
    target.dispatchEvent(new MouseEvent('click', { clientX: 150, clientY: 125, detail: 1 }));
    expect(emitted).toEqual([{ x: 0.25, y: 0.75 }]);
  });

  it('le clic simulé par Entrée ne pose rien ; les flèches déplacent le repère', () => {
    const { target, emitted } = render({ x: 0.2, y: 0.2 });
    target.dispatchEvent(new MouseEvent('click', { detail: 0 }));
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
    expect(emitted).toEqual([{ x: 0.25, y: 0.2 }]);
  });
});
