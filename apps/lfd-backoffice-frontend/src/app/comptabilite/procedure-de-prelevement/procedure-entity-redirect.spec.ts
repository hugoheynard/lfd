import { TestBed } from '@angular/core/testing';
import {
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
  Router,
  UrlTree,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import type { CollectionProcedureView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { procedureBatch, procedureView } from '../__tests__/collection-procedure-fixture';
import { CollectionProcedureService, type ProcedureAddress } from '../collection-procedure.service';
import { procedureOfEntityRedirect, procedureOfEntityRoutes } from './procedure-entity-redirect';

/** La lecture du détail, doublée : elle rend ce qu'on lui donne et note l'adresse. */
class FakeProcedure {
  answer: () => Promise<CollectionProcedureView> = () => Promise.resolve(procedureView());
  readonly asked: ProcedureAddress[] = [];
  read(address: ProcedureAddress): Promise<CollectionProcedureView> {
    this.asked.push(address);
    return this.answer();
  }
}

let procedure: FakeProcedure;

beforeEach(() => {
  procedure = new FakeProcedure();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: CollectionProcedureService, useValue: procedure }],
  });
});

async function redirect(queryParams: Readonly<Record<string, string>> = {}): Promise<string> {
  const route = {
    paramMap: convertToParamMap({ entityId: 'le1' }),
    queryParamMap: convertToParamMap(queryParams),
  } as ActivatedRouteSnapshot;
  const result = await TestBed.runInInjectionContext(() =>
    procedureOfEntityRedirect(route, {} as RouterStateSnapshot),
  );
  expect(result).toBeInstanceOf(UrlTree);
  return TestBed.inject(Router).serializeUrl(result as UrlTree);
}

describe('le renvoi vers la procédure en cours d’une entité', () => {
  it('mène au détail de la procédure du lot suivi, sur l’onglet demandé', async () => {
    procedure.answer = () =>
      Promise.resolve(
        procedureView({ followed: procedureBatch({ procedureId: 'le1~2026-11-01' }) }),
      );

    expect(await redirect({ onglet: 'mandats' })).toBe(
      '/comptabilite/procedure-de-prelevement/le1~2026-11-01?onglet=mandats',
    );
    expect(procedure.asked).toEqual([{ legalEntityId: 'le1' }]);
  });

  it('sans lot suivi : la procédure de la clôture à préparer', async () => {
    procedure.answer = () =>
      Promise.resolve(
        procedureView({
          followed: null,
          toPrepare: { procedureId: 'le1~2026-12-01', closesAt: '', periodLabel: '' },
        }),
      );

    expect(await redirect()).toBe('/comptabilite/procedure-de-prelevement/le1~2026-12-01');
  });

  it('sans procédure, ou lecture refusée : la table des procédures de l’entité', async () => {
    procedure.answer = () => Promise.resolve(procedureView({ followed: null, toPrepare: null }));
    expect(await redirect()).toBe('/comptabilite/procedure-de-prelevement?entite=le1');

    procedure.answer = () => Promise.reject(new Error('404'));
    expect(await redirect()).toBe('/comptabilite/procedure-de-prelevement?entite=le1');
  });

  it('la route elle-même renvoie : l’adresse de la fiche mène au détail', async () => {
    procedure.answer = () =>
      Promise.resolve(procedureView({ followed: procedureBatch({ procedureId: 'p1' }) }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'comptabilite/procedure-de-prelevement/entite/:entityId',
            children: procedureOfEntityRoutes,
          },
          { path: 'comptabilite/procedure-de-prelevement/:id', children: [] },
        ]),
        { provide: CollectionProcedureService, useValue: procedure },
      ],
    });
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/comptabilite/procedure-de-prelevement/entite/le1?onglet=comptes');

    expect(router.url).toBe('/comptabilite/procedure-de-prelevement/p1?onglet=comptes');
  });
});
