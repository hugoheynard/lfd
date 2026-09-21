import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ORDER_DOC_INVOICE, ORDER_DOC_ORDER_SHEET } from '@lfd/b2b-ui/order';
import { describe, expect, it } from 'vitest';

import { AdminOrdersService } from '../../orders.service';
import { isOrderSheet } from '../order-sheet-key';

/**
 * 🔴 **Le bouton du bon de commande ne faisait rien.**
 *
 * `onDocument()` répondait « le téléchargement arrive avec la facturation » —
 * vrai de la facture, faux du bon depuis qu'il existe en PDF. La page avait
 * pourtant déjà sa liste de documents et son événement : il manquait
 * l'embranchement sur la clé, et l'appel qui va avec.
 *
 * Ces deux-là sont éprouvés **séparément**, et c'est délibéré : atteindre
 * `onDocument` depuis un test demanderait de caster le composant pour forcer un
 * membre protégé, ce que la porte `no-type-escapes` refuse — un doublé qui
 * caste dérive de la signature qu'il prétend jouer.
 */

describe('la règle qui décide du document', () => {
  it('reconnaît le bon de commande', () => {
    expect(isOrderSheet(ORDER_DOC_ORDER_SHEET)).toBe(true);
  });

  it("ne prend PAS la facture pour un bon — elle n'existe pas encore", () => {
    // Télécharger un bon sous le nom « facture » serait pire qu'un bouton muet :
    // une facture porte un numéro de série et des mentions légales que la
    // plateforme n'a pas, et le premier comptable qui la reçoit la classe.
    expect(isOrderSheet(ORDER_DOC_INVOICE)).toBe(false);
  });
});

describe('la demande du PDF au serveur', () => {
  it('interroge la route ADMIN, en octets bruts', async () => {
    // 🔴 En **blob**, jamais en JSON : `HttpClient` parserait sinon un PDF comme
    // du texte et rendrait des octets abîmés — un fichier qui s'ouvre mal, pas
    // une erreur. Et sur la route admin : celle du client est murée par société,
    // et le staff n'appartient à aucune.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);

    const asking = TestBed.inject(AdminOrdersService).sheetPdf('ord_9');
    const request = http.expectOne((candidate) => candidate.url.endsWith('/bon.pdf'));

    expect(request.request.url).toContain('/admin/orders/ord_9/bon.pdf');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['%PDF-1.3'], { type: 'application/pdf' }));
    await expect(asking).resolves.toBeInstanceOf(Blob);
    http.verify();
  });

  it("échappe l'identifiant plutôt que de le concaténer", () => {
    // Une référence n'en porte pas, mais un identifiant vient de la route : le
    // composer à la main est le genre de raccourci qu'on ne remarque que le jour
    // où il casse une URL.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);

    void TestBed.inject(AdminOrdersService).sheetPdf('ord/9');
    const request = http.expectOne((candidate) => candidate.url.endsWith('/bon.pdf'));

    expect(request.request.url).toContain('ord%2F9');
    request.flush(new Blob(['%PDF-1.3']));
    http.verify();
  });
});
