import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { API_BASE_URL } from '../../../data/api';
import { ProductFormStore } from '../product-form-store';

/**
 * Régression : sur une fiche en cours de création, les photos ajoutées depuis
 * la médiathèque ne partaient pas avec « Créer » — la route de création ne les
 * porte pas, et la page de la fiche créée relisait des visuels vides
 * (signalé par Hugo le 2026-10-16).
 */

const BASE = '/api/pim';

function setup(): { readonly form: ProductFormStore; readonly http: HttpTestingController } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: BASE },
      ProductFormStore,
    ],
  });
  const form = TestBed.inject(ProductFormStore);
  form.nameText.set({ fr: 'Croissant' });
  form.categoryId.set('cat-viennoiserie');
  return { form, http: TestBed.inject(HttpTestingController) };
}

/** Laisse les `await` du store avancer jusqu'à la requête suivante. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) {
    await Promise.resolve();
  }
}

describe('la création d’une fiche et ses photos', () => {
  it('une photo ajoutée avant le premier enregistrement est gardée', async () => {
    const { form, http } = setup();
    form.media.set([{ role: 'gallery', url: 'https://img/croissant.jpg', name: 'croissant.jpg' }]);

    const submitted = form.submit();
    http.expectOne(`${BASE}/catalogue/products`).flush({ id: 'p-1' });
    await settle();

    const media = http.expectOne(`${BASE}/catalogue/products/p-1/media`);
    expect(media.request.method).toBe('PUT');
    expect(media.request.body).toEqual({
      media: [{ role: 'gallery', url: 'https://img/croissant.jpg', name: 'croissant.jpg' }],
    });
    media.flush(null);

    await expect(submitted).resolves.toBe('p-1');
    // Le store lit ses référentiels (GET) à sa construction ; seules les
    // ÉCRITURES comptent ici.
    expect(http.match((request) => request.method !== 'GET')).toEqual([]);
  });

  it('n’écrit aucun visuel quand il n’y en a pas', async () => {
    const { form, http } = setup();

    const submitted = form.submit();
    http.expectOne(`${BASE}/catalogue/products`).flush({ id: 'p-2' });

    await expect(submitted).resolves.toBe('p-2');
    // Le store lit ses référentiels (GET) à sa construction ; seules les
    // ÉCRITURES comptent ici.
    expect(http.match((request) => request.method !== 'GET')).toEqual([]);
  });

  /**
   * La fiche existe déjà : rendre `null` garderait l'écran de création ouvert,
   * et un second « Créer » ferait un doublon.
   */
  it('rend la fiche créée même si ses photos sont refusées, et le dit', async () => {
    const { form, http } = setup();
    form.media.set([{ role: 'gallery', url: 'https://img/a.jpg', name: 'a.jpg' }]);

    const submitted = form.submit();
    http.expectOne(`${BASE}/catalogue/products`).flush({ id: 'p-3' });
    await settle();
    http
      .expectOne(`${BASE}/catalogue/products/p-3/media`)
      .flush({ message: 'refusé' }, { status: 400, statusText: 'Bad Request' });

    await expect(submitted).resolves.toBe('p-3');
    expect(form.error()).not.toBeNull();
  });
});
