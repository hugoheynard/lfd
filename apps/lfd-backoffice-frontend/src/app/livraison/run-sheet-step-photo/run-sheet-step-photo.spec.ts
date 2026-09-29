import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { type Observable, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RunSheetStepPhoto } from './run-sheet-step-photo';

/** La photo d'une étape se lit par la route staff de la procédure, en blob. */
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
  const fixture = TestBed.createComponent(RunSheetStepPhoto);
  fixture.componentRef.setInput('companyId', 'c-1');
  fixture.componentRef.setInput('addressId', 'a-1');
  fixture.componentRef.setInput('stepId', 's-1');
  fixture.componentRef.setInput('stepTitle', 'Par la cour');
  fixture.componentRef.setInput('revision', 'r-1');
  fixture.detectChanges();
  // La passerelle enchaîne plusieurs promesses : on laisse la file se vider.
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

describe('RunSheetStepPhoto', () => {
  it('lit la photo de SON étape, révision dans l’URL', async () => {
    const { element, asked } = await mount(() => of(new Blob(['x'])));

    const [url, options] = asked[0] as [string, { params: { rev: string } }];
    expect(url).toMatch(
      /\/admin\/companies\/c-1\/delivery-addresses\/a-1\/procedure\/steps\/s-1\/photo$/u,
    );
    expect(options.params.rev).toBe('r-1');
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
