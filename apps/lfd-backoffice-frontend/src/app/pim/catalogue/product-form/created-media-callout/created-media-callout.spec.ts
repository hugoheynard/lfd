import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { API_BASE_URL } from '../../../data/api';
import { ProductFormStore } from '../product-form-store';
import { CreatedMediaCallout } from './created-media-callout';

/**
 * Régression : une photo refusée juste après « Créer » ne laissait aucune
 * trace — la page naviguait vers la fiche créée, qui la relisait vide, et le
 * message du serveur se perdait avec le store de création (Hugo, 2026-10-16).
 */

const BASE = '/api/pim';
const SLOT = { role: 'gallery', url: 'https://img/a.jpg', name: 'a.jpg' };

async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) {
    await Promise.resolve();
  }
}

function setup() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: BASE },
      ProductFormStore,
    ],
  });
  const store = TestBed.inject(ProductFormStore);
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(CreatedMediaCallout);
  const root = fixture.nativeElement as HTMLElement;
  return { store, http, fixture, root };
}

/** Crée la fiche `p-3`, refuse ses photos, puis ouvre la fiche créée. */
async function createWithRefusedMedia(ctx: ReturnType<typeof setup>): Promise<void> {
  const { store, http, fixture } = ctx;
  store.nameText.set({ fr: 'Croissant' });
  store.categoryId.set('cat-viennoiserie');
  store.media.set([SLOT]);
  const submitted = store.submit();
  http.expectOne(`${BASE}/catalogue/products`).flush({ id: 'p-3' });
  await settle();
  http
    .expectOne(`${BASE}/catalogue/products/p-3/media`)
    .flush(
      { message: 'Image introuvable dans la médiathèque' },
      { status: 400, statusText: 'Bad Request' },
    );
  await submitted;
  // La page de la fiche créée : `init` pose l'identité avant tout appel.
  void store.init('p-3');
  store.media.set([]);
  fixture.detectChanges();
}

describe('CreatedMediaCallout', () => {
  it('n’affiche rien tant qu’aucune photo n’a été refusée', () => {
    const { fixture, root } = setup();
    fixture.detectChanges();
    expect(root.querySelector('fold-callout')).toBeNull();
  });

  it('un envoi refusé après création fait apparaître l’encart, avec le message et la photo', async () => {
    const ctx = setup();
    await createWithRefusedMedia(ctx);

    const text = ctx.root.querySelector('fold-callout')?.textContent ?? '';
    expect(text).toContain('1 photo n’a pas pu être enregistrée');
    expect(text).toContain('Image introuvable dans la médiathèque');
    expect(text).toContain('a.jpg');
  });

  it('« Réessayer » réussi renvoie la photo et fait disparaître l’encart', async () => {
    const ctx = setup();
    await createWithRefusedMedia(ctx);

    ctx.root.querySelector<HTMLButtonElement>('fold-callout button')?.click();
    const retry = ctx.http.expectOne(`${BASE}/catalogue/products/p-3/media`);
    expect(retry.request.method).toBe('PUT');
    expect(retry.request.body).toEqual({ media: [SLOT] });
    retry.flush(null);
    await settle();
    ctx.fixture.detectChanges();

    expect(ctx.root.querySelector('fold-callout')).toBeNull();
    expect(ctx.store.media()).toEqual([SLOT]);
  });

  it('un nouvel échec garde l’encart et met le message à jour', async () => {
    const ctx = setup();
    await createWithRefusedMedia(ctx);

    ctx.root.querySelector<HTMLButtonElement>('fold-callout button')?.click();
    ctx.http
      .expectOne(`${BASE}/catalogue/products/p-3/media`)
      .flush({ message: 'Toujours refusé' }, { status: 409, statusText: 'Conflict' });
    await settle();
    ctx.fixture.detectChanges();

    expect(ctx.root.querySelector('fold-callout')?.textContent).toContain('Toujours refusé');
  });
});
