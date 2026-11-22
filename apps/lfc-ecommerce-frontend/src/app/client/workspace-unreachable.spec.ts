import { HttpClient, HttpHeaders, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { WORKSPACE_HEADER } from '@lfd/contracts/workspace';

import type { AccountStatus } from '../account/account.service';
import { AccountService } from '../account/account.service';
import { NotifyService } from '../notify.service';
import { WORKSPACE_RELOAD_ROUTE, WORKSPACE_UNKNOWN_HOME } from './client-workspace-switch.service';
import { WORKSPACE_UNREACHABLE, workspaceUnreachableInterceptor } from './workspace-unreachable';

const MESSAGE = 'Ce compte n’est plus accessible.';

describe('workspaceUnreachableInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let status: ReturnType<typeof signal<AccountStatus>>;
  let loads: number;
  let toasts: string[];
  let navigations: string[];

  beforeEach(() => {
    loads = 0;
    toasts = [];
    navigations = [];
    status = signal<AccountStatus>('ready');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([workspaceUnreachableInterceptor])),
        provideHttpClientTesting(),
        {
          provide: AccountService,
          useValue: {
            status,
            load: (): void => {
              loads += 1;
              status.set('loading');
            },
          },
        },
        { provide: NotifyService, useValue: { info: (m: string): number => toasts.push(m) } },
        {
          provide: Router,
          useValue: {
            navigateByUrl: (url: string): Promise<boolean> => {
              navigations.push(url);
              return Promise.resolve(true);
            },
          },
        },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  /** Lance une requête dans un espace et la refuse ; rend ce que l'écran a reçu. */
  function refuse(url: string, code: string, workspace = 'c_closed'): { error: unknown } {
    const seen: { error: unknown } = { error: undefined };
    http
      .get(url, { headers: new HttpHeaders({ [WORKSPACE_HEADER]: workspace }) })
      .subscribe({ error: (error: unknown) => (seen.error = error) });
    backend
      .expectOne(url)
      .flush({ code, message: MESSAGE }, { status: 403, statusText: 'Forbidden' });
    return seen;
  }

  async function settle(): Promise<void> {
    status.set('ready');
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('relit /me, prévient une fois et revient à l’accueil, sans erreur pour l’écran', async () => {
    const seen = refuse('/orders', WORKSPACE_UNREACHABLE);
    expect(seen.error).toBeUndefined();
    expect(loads).toBe(1);
    expect(toasts).toEqual([MESSAGE]);

    await settle();
    expect(navigations).toEqual([WORKSPACE_RELOAD_ROUTE, WORKSPACE_UNKNOWN_HOME]);
  });

  it('une vague de refus ne relit qu’une fois et ne prévient qu’une fois', async () => {
    const first = refuse('/orders', WORKSPACE_UNREACHABLE);
    const second = refuse('/cart', WORKSPACE_UNREACHABLE);
    expect(first.error).toBeUndefined();
    expect(second.error).toBeUndefined();
    expect(loads).toBe(1);
    expect(toasts).toHaveLength(1);
    await settle();
    expect(navigations).toHaveLength(2);
  });

  it('ne boucle pas : un espace déjà quitté et refusé encore laisse passer l’erreur', async () => {
    refuse('/orders', WORKSPACE_UNREACHABLE);
    await settle();
    const again = refuse('/orders', WORKSPACE_UNREACHABLE);
    expect(again.error).toBeDefined();
    expect(loads).toBe(1);
  });

  it('laisse passer un autre 403 sans rien faire', () => {
    const seen = refuse('/orders', 'account.forbidden');
    expect(seen.error).toBeDefined();
    expect(loads).toBe(0);
    expect(toasts).toEqual([]);
  });
});
