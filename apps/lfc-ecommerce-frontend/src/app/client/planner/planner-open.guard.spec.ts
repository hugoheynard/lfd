import { TestBed } from '@angular/core/testing';
import {
  provideRouter,
  UrlTree,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';
import { firstValueFrom, isObservable } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { PlannerAccessStore } from './planner-access.store';
import { plannerOpenGuard } from './planner-open.guard';

/** La réponse de l'espace affiché, déjà lue. */
class AnsweredAccess {
  constructor(private readonly open: boolean) {}
  openHere(): Promise<boolean> {
    return Promise.resolve(this.open);
  }
}

async function run(open: boolean): Promise<unknown> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: PlannerAccessStore, useValue: new AnsweredAccess(open) },
    ],
  });
  const result = TestBed.runInInjectionContext(() =>
    plannerOpenGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
  return isObservable(result) ? firstValueFrom(result) : result;
}

describe('plannerOpenGuard — le planificateur de l’espace affiché', () => {
  it('ouvre /planificateur quand il est ouvert dans cet espace', async () => {
    expect(await run(true)).toBe(true);
  });

  it('renvoie au rayon quand il est fermé, ou que la réponse manque', async () => {
    const tree = await run(false);
    expect(tree).toBeInstanceOf(UrlTree);
    expect(String(tree)).toBe('/boutique');
  });
});
