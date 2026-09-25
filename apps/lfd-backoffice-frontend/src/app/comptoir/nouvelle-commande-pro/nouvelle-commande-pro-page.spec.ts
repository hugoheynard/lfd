import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CounterCustomerCard } from '@lfd/contracts';

import { CounterCustomersService } from '../counter-customers.service';
import { NouvelleCommandeProPage } from './nouvelle-commande-pro-page';

function card(id: string, name: string, siret: string, tradeName = ''): CounterCustomerCard {
  return { id, name, tradeName, reference: `C-${id}`, siret };
}

/** Ce que rend `GET /admin/counter/customers` — des actives seulement, filtrées par le serveur. */
const CARDS: readonly CounterCustomerCard[] = [
  card('1', 'Café Périn', '81234567800019'),
  card('2', 'SAS Portuaire', '99988877700011', 'Hôtel du Port'),
];

/** Expose l'état protégé sans cast : la page est testée par ce qu'elle dérive. */
class Harness extends NouvelleCommandeProPage {
  get visibleIds(): string[] {
    return this.rows().map((row) => row.id);
  }
  get loadState(): string {
    return this.state();
  }
  search(query: string): void {
    this.onSearchChange(query);
  }
  pick(id: string): void {
    this.choose(id);
  }
}

async function setup(list: () => Promise<readonly CounterCustomerCard[]>): Promise<Harness> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      {
        provide: CounterCustomersService,
        useValue: { list } satisfies Pick<CounterCustomersService, 'list'>,
      },
    ],
  });
  const page = TestBed.runInInjectionContext(() => new Harness());
  await Promise.resolve();
  await Promise.resolve();
  return page;
}

describe('NouvelleCommandeProPage', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('montre les cartes du comptoir, sous leur nom d’usage', async () => {
    const page = await setup(() => Promise.resolve(CARDS));
    expect(page.loadState).toBe('ready');
    expect(page.visibleIds).toEqual(['1', '2']);
  });

  it('filtre par raison sociale, sans accents', async () => {
    const page = await setup(() => Promise.resolve(CARDS));
    page.search('perin');
    expect(page.visibleIds).toEqual(['1']);
  });

  it('filtre par enseigne', async () => {
    const page = await setup(() => Promise.resolve(CARDS));
    page.search('hotel');
    expect(page.visibleIds).toEqual(['2']);
  });

  it('filtre par SIRET dicté avec des espaces', async () => {
    const page = await setup(() => Promise.resolve(CARDS));
    page.search('999 888');
    expect(page.visibleIds).toEqual(['2']);
  });

  it('passe en erreur quand la liste ne se charge pas', async () => {
    const page = await setup(() => Promise.reject(new Error('hors service')));
    expect(page.loadState).toBe('error');
  });

  it('ouvre la saisie SOUS le comptoir, jamais vers /comptes-clients', async () => {
    const page = await setup(() => Promise.resolve(CARDS));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    page.pick('2');
    expect(navigate).toHaveBeenCalledWith(['/comptoir/nouvelle-commande', '2']);
  });
});

/** Arrive sur le sélecteur par une VRAIE navigation, avec l'état qu'y laisse la saisie. */
async function arriveWith(state: Record<string, unknown>): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'comptoir/nouvelle-commande', component: NouvelleCommandeProPage }]),
      {
        provide: CounterCustomersService,
        useValue: {
          list: () => Promise.resolve(CARDS),
        } satisfies Pick<CounterCustomersService, 'list'>,
      },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await TestBed.inject(Router).navigate(['/comptoir/nouvelle-commande'], { state });
  harness.detectChanges();
  return harness.routeNativeElement ?? document.createElement('div');
}

describe('NouvelleCommandeProPage — retour de la saisie', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('AFFICHE le lien de règlement de la commande passée : le client est en face', async () => {
    const host = await arriveWith({
      counterPlacedOrder: { orderNumber: 'CMD-42', paymentUrl: 'https://pay.example/abc' },
    });
    expect(host.textContent).toContain('Commande CMD-42 enregistrée.');
    expect(host.querySelector('.url')?.textContent).toBe('https://pay.example/abc');
  });

  it('ne montre aucun lien quand la commande n’en a pas', async () => {
    const host = await arriveWith({
      counterPlacedOrder: { orderNumber: 'CMD-43', paymentUrl: null },
    });
    expect(host.textContent).toContain('Commande CMD-43 enregistrée.');
    expect(host.querySelector('.url')).toBeNull();
  });

  it('ne montre rien quand on arrive sans commande', async () => {
    const host = await arriveWith({});
    expect(host.textContent).not.toContain('enregistrée');
  });
});
