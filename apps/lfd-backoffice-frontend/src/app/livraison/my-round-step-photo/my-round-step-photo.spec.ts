import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { type Observable, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MyRoundStepPhoto } from './my-round-step-photo';

/** La photo se lit par la route murée du livreur, en blob — jamais par `admin/companies`. */
async function mount(respond: () => Observable<Blob>) {
  const asked: unknown[] = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: HttpClient,
        useValue: {
          get: (url: string, options: unknown) => {
            asked.push([url, options]);
            return respond();
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(MyRoundStepPhoto);
  fixture.componentRef.setInput('roundId', 'r-1');
  fixture.componentRef.setInput('stopId', 's-1');
  fixture.componentRef.setInput('stepId', 'st-1');
  fixture.componentRef.setInput('stepTitle', 'Par la cour');
  fixture.componentRef.setInput('revision', 'rev-1');
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, asked };
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:step');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MyRoundStepPhoto', () => {
  it('lit la photo par la route de « ma tournée », en blob, révision dans l’URL', async () => {
    const { element, asked } = await mount(() => of(new Blob(['x'])));

    const [url, options] = asked[0] as [string, { params: { rev: string }; responseType: string }];
    expect(url).toMatch(
      /\/admin\/livraison\/ma-tournee\/r-1\/arrets\/s-1\/procedure\/st-1\/photo$/u,
    );
    expect(url).not.toContain('companies');
    expect(options).toEqual({ params: { rev: 'rev-1' }, responseType: 'blob' });
    expect(element.querySelector('img')?.getAttribute('src')).toBe('blob:step');
  });

  it('dit une photo illisible', async () => {
    const { element } = await mount(() => throwError(() => new Error('404')));

    expect(element.querySelector('[data-photo-error]')?.getAttribute('variant')).toBe('alert');
  });

  it('rend l’URL locale à la destruction', async () => {
    const { fixture } = await mount(() => of(new Blob(['x'])));

    fixture.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:step');
  });
});
