import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { ProductionDisplayPayload, ProductionDisplayView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ProductionSettingsService } from '../production-settings.service';
import { ProductionDisplayCard } from './production-display-card';

interface Wire {
  sent: ProductionDisplayPayload[];
  refuse: string | null;
  saved: number;
}

let wire: Wire;

async function boot(
  display: ProductionDisplayView,
  canWrite = true,
): Promise<ComponentFixture<ProductionDisplayCard>> {
  wire = { sent: [], refuse: null, saved: 0 };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProductionDisplayCard],
    providers: [
      {
        provide: ProductionSettingsService,
        useValue: {
          saveDisplay: (payload: ProductionDisplayPayload) => {
            wire.sent.push(payload);
            return wire.refuse === null
              ? Promise.resolve()
              : Promise.reject(
                  new HttpErrorResponse({
                    status: 400,
                    error: { code: 'x', message: wire.refuse },
                  }),
                );
          },
        } satisfies Partial<Record<keyof ProductionSettingsService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(ProductionDisplayCard);
  fixture.componentRef.setInput('display', display);
  fixture.componentRef.setInput('canWrite', canWrite);
  fixture.componentInstance.saved.subscribe(() => {
    wire.saved += 1;
  });
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<ProductionDisplayCard>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

function check(fixture: ComponentFixture<ProductionDisplayCard>, value: boolean): void {
  fixture.debugElement
    .query(By.css('[data-show-subcategories]'))
    .triggerEventHandler('checkedChange', value);
}

describe('ProductionDisplayCard', () => {
  it('coche « Afficher les sous-catégories » : part d’un geste, puis le parent relit', async () => {
    const fixture = await boot({ showSubcategories: false });

    check(fixture, true);
    await settle(fixture);

    expect(wire.sent).toEqual([{ showSubcategories: true }]);
    expect(wire.saved).toBe(1);
  });

  it('un refus se dit avec les mots du serveur, et rien n’est relu', async () => {
    const fixture = await boot({ showSubcategories: false });
    wire.refuse = 'Réglage refusé.';

    check(fixture, true);
    await settle(fixture);

    expect(wire.saved).toBe(0);
    expect(fixture.nativeElement.querySelector('[data-display-refusal]')?.textContent?.trim()).toBe(
      'Réglage refusé.',
    );
  });

  it('sans droit d’écriture, le geste ne part pas', async () => {
    const fixture = await boot({ showSubcategories: true }, false);

    check(fixture, false);
    await settle(fixture);

    expect(wire.sent).toEqual([]);
  });
});
