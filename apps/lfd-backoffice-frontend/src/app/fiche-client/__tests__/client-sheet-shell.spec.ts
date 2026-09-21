import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CustomerSheetView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { CustomerSheetService } from '../../commercial/calendrier/customer-sheet/customer-sheet.service';
import { PermissionsStore } from '../../auth/permissions.store';
import { WorkspaceRailStore } from '../../shared/workspace-rail/workspace-rail.store';
import { ClientSheetStore } from '../client-sheet.store';
import { FicheClientShell } from '../fiche-client-shell';

/**
 * La **coquille d'un compte** : ce qu'elle publie, et ce qu'elle lit.
 *
 * 🔴 Les deux cas de ce fichier existent pour des défauts constatés à l'écran le
 * 2026-09-08, qu'aucun test ne pouvait attraper — l'un parce qu'il portait sur
 * une navigation entre deux pages, l'autre parce qu'il comptait des appels
 * réseau. Ce sont les deux choses qu'on ne voit pas en relisant un composant.
 */

const SHEET: CustomerSheetView = {
  companyId: 'co_1',
  reference: 'C-6KTQAT',
  raisonSociale: 'SAS Les Tommeuses',
  enseigne: "La Folie Douce Val d'Isère",
  nafCode: '',
  status: 'active',
  createdAt: '2026-08-01T09:00:00.000Z',
  activatedAt: '2026-08-02T09:00:00.000Z',
  contactName: 'Hugo',
  contactEmail: 'hugo@tommeuses.test',
  contactPhone: '',
  stats: {
    totalSpentCents: 182_500,
    ordersCount: 9,
    recurringBasketsCount: 0,
    averageTicketCents: 20_300,
    trend: { last30Cents: 141_000, previous30Cents: 100_000, percent: 41, direction: 'up' },
  },
  recentOrders: [],
  timeline: [],
};

/** Compte les lectures : c'est la seule façon de voir un appel de trop. */
function sheetServiceSpy(): {
  readonly service: Pick<CustomerSheetService, 'sheet'>;
  calls: number;
} {
  const state = { calls: 0 };
  return {
    get calls(): number {
      return state.calls;
    },
    service: {
      sheet: (): Promise<CustomerSheetView> => {
        state.calls += 1;
        return Promise.resolve(SHEET);
      },
    },
  };
}

describe('la coquille d’un compte client', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('PUBLIE le rail du Commercial — descendre dans un compte n’est pas en sortir', async () => {
    // 🔴 Le rail disparaissait en ouvrant une fiche. La route vit au premier
    // niveau (`comptes-clients/:id`), hors de `/commercial` : quitter la liste
    // détruisait la page qui publiait le rail, et personne ne le republiait.
    // Un test de composant isolé n'aurait rien vu — c'est la navigation entre
    // deux pages qui produit le défaut.
    const spy = sheetServiceSpy();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: CustomerSheetService, useValue: spy.service },
      ],
    });
    const fixture = TestBed.createComponent(FicheClientShell);
    fixture.componentRef.setInput('id', 'co_1');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(TestBed.inject(WorkspaceRailStore).rail()?.title).toBe('Commercial');
  });

  it('ne lit le compte QU’UNE fois pour l’en-tête et ses vues', async () => {
    // La coquille lisait la société pour son nom, et le tableau de bord lisait
    // la fiche pour ses chiffres : deux appels par ouverture d'écran, pour une
    // donnée que le serveur rend en un seul. Le front multiplie là où le serveur
    // additionne, et ça ne se rattrape pas côté serveur.
    const spy = sheetServiceSpy();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: CustomerSheetService, useValue: spy.service },
      ],
    });
    const fixture = TestBed.createComponent(FicheClientShell);
    fixture.componentRef.setInput('id', 'co_1');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(spy.calls).toBe(1);
  });
});

describe('le magasin de la fiche', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  function storeWith(sheet: () => Promise<CustomerSheetView>): ClientSheetStore {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ClientSheetStore,
        { provide: CustomerSheetService, useValue: { sheet } },
        { provide: PermissionsStore, useValue: {} },
      ],
    });
    return TestBed.inject(ClientSheetStore);
  }

  it('préfère l’ENSEIGNE à la raison sociale — c’est le nom qu’on prononce', async () => {
    const store = storeWith(() => Promise.resolve(SHEET));
    await store.load('co_1');

    expect(store.displayName()).toBe("La Folie Douce Val d'Isère");
  });

  it('retombe sur la raison sociale quand l’enseigne est vide', async () => {
    const store = storeWith(() => Promise.resolve({ ...SHEET, enseigne: '   ' }));
    await store.load('co_1');

    expect(store.displayName()).toBe('SAS Les Tommeuses');
  });

  it('GARDE les chiffres lus quand un rechargement échoue', async () => {
    // Un rechargement raté après une modification viderait sinon l'en-tête, et
    // l'écran affirmerait « ce compte n'a rien » — une autre affirmation que
    // « je n'ai pas réussi à relire ».
    let fail = false;
    const store = storeWith(() =>
      fail ? Promise.reject(new Error('réseau')) : Promise.resolve(SHEET),
    );
    await store.load('co_1');
    fail = true;

    await store.reload();

    expect(store.state()).toBe('error');
    expect(store.sheet()?.reference).toBe('C-6KTQAT');
  });

  it('ne relit RIEN tant qu’aucun compte n’a été chargé', async () => {
    // `reload` avant `load` n'a pas de sens. Deviner l'identifiant en lisant
    // l'URL ferait de ce magasin un second lecteur de route.
    let calls = 0;
    const store = storeWith(() => {
      calls += 1;
      return Promise.resolve(SHEET);
    });

    await store.reload();

    expect(calls).toBe(0);
  });
});
