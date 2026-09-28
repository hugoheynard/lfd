import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QualityService } from '../quality.service';
import { QualityPhoto } from './quality-photo';

/** La photo d'un contrôle se lit en blob par sa route `write`, jamais par une URL publique (D3). */
async function mount(photo: () => Promise<Blob>) {
  const asked: unknown[] = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: QualityService,
        useValue: {
          photo: (checkId: string, position: number) => {
            asked.push([checkId, position]);
            return photo();
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(QualityPhoto);
  fixture.componentRef.setInput('checkId', 'c-1');
  fixture.componentRef.setInput('position', 2);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, asked };
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:photo');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('QualityPhoto', () => {
  it('lit les octets de SA photo et les montre, ouvrables en grand', async () => {
    const { element, asked } = await mount(() => Promise.resolve(new Blob(['x'])));

    expect(asked).toEqual([['c-1', 2]]);
    expect(element.querySelector('img')?.getAttribute('src')).toBe('blob:photo');
    expect(element.querySelector('img')?.getAttribute('alt')).toBe('Photo 3 du contrôle');
    expect(element.querySelector('a')?.getAttribute('target')).toBe('_blank');
  });

  it('dit une photo illisible sans casser l’historique', async () => {
    const { element } = await mount(() => Promise.reject(new Error('404')));

    expect(element.querySelector('[data-photo-error]')?.getAttribute('variant')).toBe('alert');
  });

  it('rend l’URL locale à la destruction', async () => {
    const { fixture } = await mount(() => Promise.resolve(new Blob(['x'])));

    fixture.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo');
  });
});
