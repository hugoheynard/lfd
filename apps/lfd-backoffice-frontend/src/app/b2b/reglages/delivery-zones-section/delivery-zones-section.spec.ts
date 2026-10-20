import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { StaffPermission } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { DeliveryZonesService } from '../delivery-zones.service';
import { DeliveryZonesSection } from './delivery-zones-section';
import type { ZonePanelData } from './zone-panel/zone-panel';

/**
 * **Le lien de la fiche client** (2026-10-20) : `?addPostalCode=73320` ouvre le
 * panneau de zone en création, prérempli, une seule fois.
 */

class RecordingPanels {
  readonly opened: unknown[] = [];
  open(
    _component: unknown,
    options: { readonly data: ZonePanelData },
  ): {
    closed: Promise<boolean>;
  } {
    this.opened.push(options.data);
    return { closed: Promise.resolve(false) };
  }
}

async function mount(url: string, granted: readonly StaffPermission[]): Promise<RecordingPanels> {
  const panels = new RecordingPanels();
  TestBed.configureTestingModule({
    imports: [DeliveryZonesSection],
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      {
        provide: DeliveryZonesService,
        useValue: {
          list: () => Promise.resolve([]),
          uncoveredPostalCodes: () => Promise.resolve([]),
        },
      },
      { provide: FoldPanelHostService, useValue: panels },
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => granted.includes(p) } },
    ],
  });
  await TestBed.inject(Router).navigateByUrl(url);
  const fixture = TestBed.createComponent(DeliveryZonesSection);
  fixture.detectChanges();
  await fixture.whenStable();
  // La navigation qui retire le paramètre part après le chargement des zones.
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  return panels;
}

describe('DeliveryZonesSection — ?addPostalCode', () => {
  it('ouvre le panneau en création avec le code, puis retire le paramètre', async () => {
    const panels = await mount('/reglages/livraison/zones?addPostalCode=73320', [
      'delivery_fee:read',
      'delivery_fee:write',
    ]);

    expect(panels.opened).toEqual([{ zone: null, postalCode: '73320' }]);
    expect(TestBed.inject(Router).url).toBe('/reglages/livraison/zones');
  });

  it('sans le droit d’écrire, n’ouvre rien', async () => {
    const panels = await mount('/reglages/livraison/zones?addPostalCode=73320', [
      'delivery_fee:read',
    ]);

    expect(panels.opened).toEqual([]);
  });

  it('ignore un code mal formé', async () => {
    const panels = await mount('/reglages/livraison/zones?addPostalCode=abc', [
      'delivery_fee:write',
    ]);

    expect(panels.opened).toEqual([]);
  });
});
