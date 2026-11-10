import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { provideRecognised } from '../../client-orders.fixture';
import { provideWorkspace, workspaceDouble } from '../../client-workspace.fixture';
import { TOMMEUSES } from '../../mon-compte/account.fixture';
import { ClientOrderHistory } from '../client-order-history.service';
import { CommandesPage } from './commandes-page';

describe('CommandesPage', () => {
  /**
   * Régression : la liste, gardée par un service de l'application, n'était
   * relue qu'à l'arrivée dans un espace. Revenir d'une modification ou d'une
   * passation montrait la commande d'avant jusqu'au rechargement (2026-11-10).
   */
  it('relit la liste des commandes à chaque ouverture de la page', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideRecognised(),
        provideWorkspace(workspaceDouble(TOMMEUSES.id, [TOMMEUSES])),
      ],
    });
    const history = TestBed.inject(ClientOrderHistory);
    const reload = vi.spyOn(history, 'reload');

    TestBed.runInInjectionContext(() => new CommandesPage());
    TestBed.runInInjectionContext(() => new CommandesPage());

    expect(reload).toHaveBeenCalledTimes(2);
  });
});
