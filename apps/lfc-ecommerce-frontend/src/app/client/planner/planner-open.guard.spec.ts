import { TestBed } from '@angular/core/testing';
import {
  provideRouter,
  UrlTree,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';
import type { FeatureLevelsView } from '@lfd/contracts';
import { firstValueFrom, isObservable } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { ClientFeatureAccess } from '../feature-access/client-feature-access.service';
import { DEFAULT_LEVELS } from '../feature-access/feature-access.fixture';
import { plannerOpenGuard } from './planner-open.guard';

/** Les niveaux déjà lus, ou une lecture en échec (`null`). */
class SettledAccess {
  constructor(private readonly levels: FeatureLevelsView | null) {}
  load(): Promise<void> {
    return Promise.resolve();
  }
  settled(): Promise<void> {
    return Promise.resolve();
  }
  orderPlannerOpen(): boolean {
    return this.levels?.orderPlanner === 'open';
  }
}

async function run(levels: FeatureLevelsView | null): Promise<unknown> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ClientFeatureAccess, useValue: new SettledAccess(levels) },
    ],
  });
  const result = TestBed.runInInjectionContext(() =>
    plannerOpenGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
  return isObservable(result) ? firstValueFrom(result) : result;
}

describe('plannerOpenGuard — la clé orderPlanner', () => {
  it('ouvre /planificateur quand la clé est ouverte pour la personne', async () => {
    expect(await run({ ...DEFAULT_LEVELS, orderPlanner: 'open' })).toBe(true);
  });

  it('renvoie au rayon quand elle est fermée', async () => {
    const tree = await run(DEFAULT_LEVELS);
    expect(tree).toBeInstanceOf(UrlTree);
    expect(String(tree)).toBe('/boutique');
  });

  it('renvoie au rayon quand les niveaux sont inconnus', async () => {
    expect(String(await run(null))).toBe('/boutique');
  });
});
