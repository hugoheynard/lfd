import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { FicheClientActions } from '../informations/fiche-client.actions';
import { FicheClientFacade } from '../informations/fiche-client.facade';
import { FicheClientPanels } from '../informations/fiche-client.panels';
import { FicheClientStore } from '../informations/fiche-client.store';

const COMPANY = { id: 'cmp_1', contacts: [] } as unknown as AdminCompanyDetail;

interface Harness {
  readonly facade: FicheClientFacade;
  readonly loads: () => number;
  readonly store: FicheClientStore;
}

/**
 * La façade seule, ses trois collaborateurs doublés : ce qu'on éprouve ici,
 * c'est **la couture** — qui recharge quoi, et quand.
 */
function setup(
  options: {
    readonly succeeds?: boolean;
    readonly panelCloses?: boolean;
  } = {},
): Harness {
  let loads = 0;
  const store = {
    company: (): AdminCompanyDetail | null => COMPANY,
    load: (): Promise<void> => {
      loads += 1;
      return Promise.resolve();
    },
    adopt: vi.fn(),
    start: vi.fn(),
    // Les signaux ré-exposés : la façade les lit au champ, pas à l'appel.
    state: vi.fn(),
    draft: vi.fn(),
    identity: vi.fn(),
    contacts: vi.fn(),
    billing: vi.fn(),
    deliveries: vi.fn(),
    pickups: vi.fn(),
    defaultPickup: vi.fn(),
    kbisRequirement: vi.fn(),
    deliveryHidden: vi.fn(),
    libSteps: (): readonly unknown[] => [],
    ready: vi.fn(),
    isPending: vi.fn(),
    canActivate: vi.fn(),
    blockedReason: vi.fn(),
  } as unknown as FicheClientStore;

  const actions = {
    creating: vi.fn(),
    granting: vi.fn(),
    activate: (): Promise<boolean> => Promise.resolve(options.succeeds ?? true),
  } as unknown as FicheClientActions;

  const panels = {
    openStep: (): Promise<unknown> | null =>
      options.panelCloses === false ? null : Promise.resolve(),
  } as unknown as FicheClientPanels;

  TestBed.configureTestingModule({
    providers: [
      FicheClientFacade,
      { provide: FicheClientStore, useValue: store },
      { provide: FicheClientActions, useValue: actions },
      { provide: FicheClientPanels, useValue: panels },
    ],
  });

  return { facade: TestBed.inject(FicheClientFacade), loads: () => loads, store };
}

describe('façade — un geste réussi recharge la fiche', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('recharge après une mutation qui a tenu', async () => {
    // La couture est écrite ICI, une seule fois : chaque méthode de la page la
    // réécrivait, et il suffisait d'en oublier une pour que l'écran mente.
    const { facade, loads } = setup({ succeeds: true });

    await facade.activate();

    expect(loads()).toBe(1);
  });

  it('NE recharge PAS quand le geste a échoué', async () => {
    // Un échec laisse l'écran tel quel : recharger dessus effacerait ce que le
    // commercial avait sous les yeux au moment du refus.
    const { facade, loads } = setup({ succeeds: false });

    await facade.activate();

    expect(loads()).toBe(0);
  });
});

describe('façade — un panneau fermé recharge la fiche', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('recharge à la fermeture, quoi qu’il s’y soit passé', async () => {
    // On ne sait pas ce que le panneau a écrit : la seule réponse honnête est
    // de relire.
    const { facade, loads } = setup({});

    facade.openStep('tva');
    await Promise.resolve();
    await Promise.resolve();

    expect(loads()).toBe(1);
  });

  it('ne recharge pas quand l’étape n’a AUCUN panneau', async () => {
    // Le KBIS est un dépôt de fichier, le règlement se règle sur la fiche :
    // rien ne s'est ouvert, donc rien n'a changé.
    const { facade, loads } = setup({ panelCloses: false });

    facade.openStep('kbis');
    await Promise.resolve();

    expect(loads()).toBe(0);
  });
});
