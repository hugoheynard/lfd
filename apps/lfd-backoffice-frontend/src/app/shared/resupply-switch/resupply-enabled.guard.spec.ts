import { TestBed } from '@angular/core/testing';
import { provideRouter, UrlTree } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { resupplyEnabledGuard } from './resupply-enabled.guard';
import { ResupplySwitchStore } from './resupply-switch.store';

async function run(enabled: boolean): Promise<unknown> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: ResupplySwitchStore,
        useValue: {
          ensureLoaded: () => Promise.resolve(),
          enabled: () => enabled,
        } satisfies Pick<ResupplySwitchStore, 'ensureLoaded'> & { enabled: () => boolean },
      },
    ],
  });
  const guard = resupplyEnabledGuard('/comptoir');
  return TestBed.runInInjectionContext(() => guard(null as never, null as never));
}

describe('resupplyEnabledGuard', () => {
  it('laisse passer quand le réassort est allumé', async () => {
    expect(await run(true)).toBe(true);
  });

  it('renvoie à l’atterrissage de l’espace quand il est éteint', async () => {
    const result = await run(false);
    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toBe('/comptoir');
  });
});
