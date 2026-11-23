import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { BudgetCommitmentRequirementsView } from '@lfd/contracts';
import { WORKSPACE_HEADER } from '@lfd/contracts/workspace';
import { of } from 'rxjs';

import { AuthFacade } from '../../auth/auth.facade';
import { provideWorkspace, workspaceDouble } from '../client-workspace.fixture';
import { TOMMEUSES } from '../mon-compte/account.fixture';
import { OrderContextStore } from '../order-context.store';
import { ClientBudgetCommitment } from './budget-commitment.service';

const ARMY: BudgetCommitmentRequirementsView = {
  payerCompanyId: 'cmp_1',
  publicPayer: true,
  commitmentRequired: true,
  serviceCodeRequired: true,
  defaultServiceCode: 'SRV-01',
  currentCommitment: null,
};

const URL_OF = /\/me\/budget-commitment-requirements$/u;

/** Laisse filer le jeton (une promesse) jusqu'à la requête. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

describe('ClientBudgetCommitment', () => {
  let commitment: ClientBudgetCommitment;
  let http: HttpTestingController;
  /** La journée choisie au panier ; seule `date` est lue. */
  const choice = signal<{ readonly date: string } | null>(null);

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthFacade,
          useValue: { isAuthenticated: () => true, accessToken$: () => of('jeton-de-test') },
        },
        provideWorkspace(workspaceDouble('cmp_1', [{ ...TOMMEUSES, id: 'cmp_1' }])),
        { provide: OrderContextStore, useValue: { choice } },
      ],
    });
    choice.set(null);
    commitment = TestBed.inject(ClientBudgetCommitment);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  async function read(answer: BudgetCommitmentRequirementsView): Promise<void> {
    commitment.ensure();
    await tick();
    const request = http.expectOne((r) => URL_OF.test(r.url));
    expect(request.request.headers.get(WORKSPACE_HEADER)).toBe('cmp_1');
    request.flush(answer);
    await tick();
  }

  it('rien n’est envoyé tant que le payeur n’est pas connu pour public', () => {
    expect(commitment.payloadFor('cmp_1')).toEqual({});
  });

  it('un payeur privé : rien ne part, rien ne manque', async () => {
    await read({ ...ARMY, publicPayer: false, defaultServiceCode: '' });

    commitment.setNumber('1300012345');
    expect(commitment.payloadFor('cmp_1')).toEqual({});
    expect(commitment.gap()).toBeNull();
  });

  it('un numéro exigé manque tant qu’il n’est pas saisi ; le code suit le défaut', async () => {
    await read(ARMY);

    expect(commitment.serviceCode()).toBe('SRV-01');
    expect(commitment.gap()).toBe('number');

    commitment.setNumber(' 1300012345 ');
    expect(commitment.gap()).toBeNull();
    expect(commitment.payloadFor('cmp_1')).toEqual({
      budgetCommitment: { number: '1300012345', serviceCode: 'SRV-01' },
    });
  });

  it('un code exigé sans défaut manque tant qu’il est vide', async () => {
    await read({ ...ARMY, defaultServiceCode: '' });
    commitment.setNumber('N1');

    expect(commitment.gap()).toBe('serviceCode');
    commitment.setServiceCode('SRV-9');
    expect(commitment.gap()).toBeNull();
  });

  it('la commande passée, le bon de commande suivant repart de zéro', async () => {
    await read(ARMY);
    commitment.setNumber('N1');
    commitment.setServiceCode('SRV-9');

    commitment.forget('cmp_1');

    expect(commitment.number()).toBe('');
    expect(commitment.serviceCode()).toBe('SRV-01');
  });

  it('une lecture en échec le dit', async () => {
    commitment.ensure();
    await tick();
    http
      .expectOne((r) => URL_OF.test(r.url))
      .flush('panne', { status: 503, statusText: 'Service Unavailable' });
    await tick();

    expect(commitment.failed()).toBe(true);
  });

  describe('l’engagement en cours', () => {
    const RUNNING: BudgetCommitmentRequirementsView = {
      ...ARMY,
      currentCommitment: { number: 'ENG-2026', endsOn: '2026-12-31' },
    };

    it('préremplit le numéro quand la journée choisie tombe au plus tard la fin', async () => {
      choice.set({ date: '2026-12-31' });
      await read(RUNNING);

      expect(commitment.standing()).toEqual({
        state: 'running',
        number: 'ENG-2026',
        endsOn: '2026-12-31',
      });
      expect(commitment.number()).toBe('ENG-2026');
      expect(commitment.gap()).toBeNull();
      expect(commitment.payloadFor('cmp_1')).toEqual({
        budgetCommitment: { number: 'ENG-2026', serviceCode: 'SRV-01' },
      });
    });

    it('au-delà de la fin, ne propose rien et le dit pris fin', async () => {
      choice.set({ date: '2027-01-04' });
      await read(RUNNING);

      expect(commitment.standing()?.state).toBe('ended');
      expect(commitment.number()).toBe('');
      expect(commitment.gap()).toBe('number');
      expect(commitment.payloadFor('cmp_1')).toEqual({
        budgetCommitment: { number: '', serviceCode: 'SRV-01' },
      });
    });

    it('sans journée choisie, ne propose rien', async () => {
      await read(RUNNING);

      expect(commitment.standing()).toBeNull();
      expect(commitment.number()).toBe('');
    });

    it('la proposition suit la journée tant que rien n’est saisi', async () => {
      choice.set({ date: '2027-01-04' });
      await read(RUNNING);
      expect(commitment.number()).toBe('');

      choice.set({ date: '2026-12-01' });
      expect(commitment.number()).toBe('ENG-2026');
    });

    it('n’écrase jamais une saisie, même effacée', async () => {
      choice.set({ date: '2026-12-01' });
      await read(RUNNING);

      commitment.setNumber('AUTRE-1');
      expect(commitment.number()).toBe('AUTRE-1');

      commitment.setNumber('');
      choice.set({ date: '2026-12-02' });
      expect(commitment.number()).toBe('');
      expect(commitment.payloadFor('cmp_1')).toEqual({
        budgetCommitment: { number: '', serviceCode: 'SRV-01' },
      });
    });

    it('toucher le code service ne fige pas le numéro proposé', async () => {
      choice.set({ date: '2026-12-01' });
      await read(RUNNING);

      commitment.setServiceCode('SRV-9');
      expect(commitment.number()).toBe('ENG-2026');
    });
  });
});
