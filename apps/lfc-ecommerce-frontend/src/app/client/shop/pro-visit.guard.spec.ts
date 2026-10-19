import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  provideRouter,
  UrlTree,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';
import { describe, expect, it } from 'vitest';

import { noProVisitGuard } from './pro-visit.guard';
import { ProVisit } from './pro-visit.service';

function run(active: boolean): unknown {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: ProVisit, useValue: { active: signal(active) } }],
  });
  const state: Pick<RouterStateSnapshot, 'url'> = { url: '/reglement/ord_1' };
  return TestBed.runInInjectionContext(() =>
    noProVisitGuard({} as ActivatedRouteSnapshot, state as RouterStateSnapshot),
  );
}

describe('noProVisitGuard — pas de règlement en visite pro', () => {
  it('renvoie à la connexion pendant la visite pro, cible gardée', () => {
    const tree = run(true);

    expect(tree).toBeInstanceOf(UrlTree);
    expect(String(tree)).toBe('/login?returnTo=%2Freglement%2Ford_1');
  });

  it('laisse passer hors visite pro', () => {
    expect(run(false)).toBe(true);
  });
});
