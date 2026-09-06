import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CompanyAddressesView } from '@lfd/contracts';
import { of } from 'rxjs';

import { AccountService } from '../account/account.service';
import { AuthFacade } from '../auth/auth.facade';
import { addressAt, ClientAddresses } from './client-addresses.service';

const CARNET: CompanyAddressesView = {
  billing: {
    id: 'adr_siege',
    label: 'Siège',
    ligne1: '12 chemin des Barmettes',
    ligne2: '',
    codePostal: '73150',
    ville: "Val d'Isère",
    pays: 'France',
  },
  deliveries: [],
};

/** Le compte tel que le shell l'a déjà lu — une entreprise, la sienne. */
function bootWith(companies: readonly { id: string }[]): HttpTestingController {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthFacade, useValue: { accessToken$: () => of('jeton') } },
      { provide: AccountService, useValue: { companies: () => companies } },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

/**
 * 🔴 **Le carnet était écrit en dur** (« Le Chalet », « Bureau »). C'était la
 * plus dangereuse des maquettes du front : une adresse d'exemple posée à côté
 * d'une commande réelle est une livraison à la mauvaise porte.
 */
describe('le carnet d’adresses du client', () => {
  it('lit les adresses de l’entreprise du demandeur', async () => {
    const http = bootWith([{ id: 'cmp_1' }]);
    const addresses = TestBed.inject(ClientAddresses);
    TestBed.tick();
    await Promise.resolve();

    http.expectOne((r) => r.url.endsWith('/companies/cmp_1/addresses')).flush(CARNET);
    // Le jeton puis la réponse : deux `await`, donc deux microtâches avant que
    // le signal porte la valeur.
    await Promise.resolve();
    await Promise.resolve();

    expect(addresses.billing()?.ligne1).toBe('12 chemin des Barmettes');
  });

  /**
   * Personne de reconnu ⇒ aucune entreprise ⇒ **rien**, et surtout pas des
   * adresses d'exemple : elles seraient celles de quelqu'un d'autre.
   */
  it('n’appelle rien et ne propose rien sans entreprise', () => {
    const http = bootWith([]);
    const addresses = TestBed.inject(ClientAddresses);
    TestBed.tick();

    http.verify();
    expect(addresses.deliveries()).toEqual([]);
    expect(addresses.billing()).toBeNull();
  });

  /** Un échec laisse le carnet VIDE : l'écran retombe sur la saisie libre. */
  it('laisse le carnet vide quand la lecture échoue', async () => {
    const http = bootWith([{ id: 'cmp_1' }]);
    const addresses = TestBed.inject(ClientAddresses);
    TestBed.tick();
    await Promise.resolve();

    http
      .expectOne((r) => r.url.endsWith('/companies/cmp_1/addresses'))
      .flush({}, { status: 500, statusText: 'Server Error' });
    await Promise.resolve();

    expect(addresses.deliveries()).toEqual([]);
  });
});

describe('le complément d’une adresse', () => {
  it('se dérive du libellé, faute de champ au contrat', () => {
    expect(addressAt('Chalet')).toBe('au Chalet');
  });

  it('reste neutre quand il n’y a pas de libellé', () => {
    expect(addressAt('  ')).toBe('à cette adresse');
  });
});
