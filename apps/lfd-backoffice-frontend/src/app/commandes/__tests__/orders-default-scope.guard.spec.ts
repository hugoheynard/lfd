import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, UrlTree } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { parisToday } from '../../shared/paris-today';
import { ordersDefaultScopeGuard } from '../orders-default-scope.guard';
import { nextDay } from '../orders-scope';

function run(queryParams: Record<string, string>): unknown {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const route = new ActivatedRouteSnapshot();
  route.queryParams = queryParams;
  const state = TestBed.inject(Router).routerState.snapshot;
  return TestBed.runInInjectionContext(() => ordersDefaultScopeGuard(route, state));
}

describe('ordersDefaultScopeGuard — la liste s’ouvre sur demain', () => {
  it('recadre une arrivée sans paramètre sur demain', () => {
    const result = run({});
    const tomorrow = nextDay(parisToday());
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).queryParams).toEqual({
      fulfillmentFrom: tomorrow,
      fulfillmentTo: tomorrow,
    });
  });

  it('respecte une adresse qui porte déjà un onglet', () => {
    expect(run({ view: 'drafts' })).toBe(true);
  });

  it('respecte une adresse qui porte déjà un filtre', () => {
    expect(run({ method: 'pickup' })).toBe(true);
  });
});
