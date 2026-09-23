import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { MediaCarrierView } from '@lfd/pim-contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { MediaLibraryHttpApi } from '../media-library-http-api';

import { CarriersPanel } from './carriers-panel';

const IMAGE = 'https://media.test/products/abc.png';

class FakeApi {
  asked: string | null = null;
  answer: readonly MediaCarrierView[] = [];
  fails = false;

  carriersOf(url: string): Promise<readonly MediaCarrierView[]> {
    this.asked = url;
    return this.fails ? Promise.reject(new Error('réseau')) : Promise.resolve(this.answer);
  }
}

/** Le panneau monté comme en production : une entrée, et un `FoldPanelRef`. */
function mount(api: FakeApi): {
  fixture: ReturnType<typeof TestBed.createComponent<CarriersPanel>>;
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: MediaLibraryHttpApi, useValue: api },
      { provide: FoldPanelRef, useValue: { close: (): void => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(CarriersPanel);
  fixture.componentRef.setInput('data', { url: IMAGE, label: 'croissant' });
  return { fixture };
}

describe('CarriersPanel', () => {
  /**
   * 🔴 Régression du 2026-09-23, et elle a été vue EN PRODUCTION avant d'être
   * testée. Le panneau appelait `this.data().url` depuis son CONSTRUCTEUR ; un
   * `input.required()` n'y est pas encore posé, Angular lève (NG0950), et le
   * `catch` de la lecture transformait ça en « la liste des porteurs n'a pas
   * pu être lue » — un message qui accuse le réseau pour un défaut de cycle de
   * vie.
   *
   * Ce qui rend le cas nécessaire : rien d'autre ne pouvait l'attraper. Le
   * typecheck est vert, l'API répond juste, les e2e passent — le défaut vit
   * entre l'entrée et sa lecture.
   */
  it('attend que son entrée soit POSÉE avant de lire les porteurs', async () => {
    const api = new FakeApi();
    api.answer = [{ kind: 'product', id: 'prd_1', label: 'Croissant' }];

    const { fixture } = mount(api);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.asked).toBe(IMAGE);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Croissant');
    expect(host.textContent).not.toContain("n'a pas pu être lue");
  });

  it("dit qu'AUCUN porteur ne l'affiche, distinct d'un échec de lecture", async () => {
    // Les confondre ferait croire l'image libre au premier réseau qui tousse,
    // et proposer de la supprimer.
    const api = new FakeApi();

    const { fixture } = mount(api);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Aucune fiche ni famille');
    expect(host.textContent).not.toContain("n'a pas pu être lue");
  });

  it("garde le message d'échec pour un VRAI échec", async () => {
    const api = new FakeApi();
    api.fails = true;

    const { fixture } = mount(api);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain("n'a pas pu être lue");
  });
});
