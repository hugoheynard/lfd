import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  DEFAULT_DELIVERY_AVAILABILITY,
  DEFAULT_DELIVERY_PRICING,
  type AdminDeliveryZoneView,
  type DeliveryAvailabilityView,
  type DeliveryPricingView,
  type StaffPermission,
} from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { DeliveryAvailabilityService } from '../delivery-availability.service';
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

interface Setup {
  readonly open?: Pick<DeliveryAvailabilityView, 'openToB2b' | 'openToB2c'>;
  readonly pricing?: DeliveryPricingView;
  readonly zones?: readonly AdminDeliveryZoneView[];
}

let mounted: HTMLElement | null = null;

async function mount(
  url: string,
  granted: readonly StaffPermission[],
  setup: Setup = {},
): Promise<RecordingPanels> {
  const panels = new RecordingPanels();
  const open = setup.open ?? { openToB2b: true, openToB2c: true };
  TestBed.configureTestingModule({
    imports: [DeliveryZonesSection],
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      {
        provide: DeliveryZonesService,
        useValue: {
          list: () => Promise.resolve([]),
          listAdmin: () => Promise.resolve(setup.zones ?? []),
          pricing: () => Promise.resolve(setup.pricing ?? DEFAULT_DELIVERY_PRICING),
          uncoveredPostalCodes: () => Promise.resolve([]),
        },
      },
      {
        provide: DeliveryAvailabilityService,
        useValue: {
          readPublic: () => Promise.resolve({ ...DEFAULT_DELIVERY_AVAILABILITY, ...open }),
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
  fixture.detectChanges();
  mounted = fixture.nativeElement as HTMLElement;
  return panels;
}

const text = (): string => mounted?.textContent?.replace(/\s+/gu, ' ') ?? '';

describe('DeliveryZonesSection — ?addPostalCode', () => {
  it('ouvre le panneau en création avec le code, puis retire le paramètre', async () => {
    const panels = await mount('/reglages/livraison/zones?addPostalCode=73320', [
      'delivery_fee:read',
      'delivery_fee:write',
    ]);

    expect(panels.opened).toEqual([{ zone: null, postalCode: '73320', audiences: ['b2b', 'b2c'] }]);
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

describe('DeliveryZonesSection — le réglage global et les remplacements (0b)', () => {
  const PRICED: DeliveryPricingView = {
    ...DEFAULT_DELIVERY_PRICING,
    b2b: { fee: { mode: 'amount', cents: 900 }, freeDeliveryThresholdCents: 5_000 },
  };
  const VAL: AdminDeliveryZoneView = {
    id: 'zone_1',
    postalPrefixes: ['73150'],
    label: 'Val d’Isère',
    fee: { mode: 'amount', cents: 2_000 },
    audienceTerms: {
      b2b: { fee: null, freeDeliveryThresholdCents: null },
      b2c: { fee: { mode: 'amount', cents: 2_500 }, freeDeliveryThresholdCents: null },
    },
  };

  it('montre le frais global de chaque clientèle ouverte, et les remplacements de la zone', async () => {
    await mount('/reglages/livraison/zones', ['delivery_fee:read'], {
      pricing: PRICED,
      zones: [VAL],
    });

    expect(text()).toContain('Réglage global');
    expect(text()).toContain('Pros');
    expect(text()).toContain('Frais de chaque zone');
    expect(text()).toMatch(/Particuliers \+ 25,00/u);
  });

  it('une zone sans remplacement, sous un réglage global, dit « Global » et pas son ancien frais', async () => {
    await mount('/reglages/livraison/zones', ['delivery_fee:read'], {
      open: { openToB2b: true, openToB2c: false },
      pricing: PRICED,
      zones: [{ ...VAL, audienceTerms: { ...VAL.audienceTerms, b2c: VAL.audienceTerms.b2b } }],
    });

    const badges = [...document.querySelectorAll('.zone fold-badge')].map((b) =>
      b.textContent?.trim(),
    );
    expect(badges).toEqual(['Global']);
  });

  it('une zone dont une clientèle suit le global et l’autre l’ancien frais les nomme', async () => {
    await mount('/reglages/livraison/zones', ['delivery_fee:read'], {
      pricing: PRICED,
      zones: [{ ...VAL, audienceTerms: { ...VAL.audienceTerms, b2c: VAL.audienceTerms.b2b } }],
    });

    const badges = [...document.querySelectorAll('.zone fold-badge')].map((b) =>
      b.textContent?.trim(),
    );
    expect(badges.map((b) => b?.replace(/\s/gu, ' '))).toEqual([
      'Particuliers + 20,00 €',
      'Pros Global',
    ]);
  });

  it('une clientèle fermée est montrée grisée au réglage global, avec où l’ouvrir', async () => {
    await mount('/reglages/livraison/zones', ['delivery_fee:read'], {
      open: { openToB2b: true, openToB2c: false },
      pricing: PRICED,
      zones: [VAL],
    });

    const closed = document.querySelector('.global-fee.closed');
    expect(closed?.textContent).toContain('Particuliers');
    expect(document.querySelector('fold-callout[data-closed]')?.textContent).toContain(
      'Disponibilité de la livraison',
    );
    // Les pastilles d'une zone ne parlent toujours que des clientèles ouvertes.
    const badges = [...document.querySelectorAll('.zone fold-badge')].map((b) => b.textContent);
    expect(badges.join(' ')).not.toContain('Particuliers');
  });

  it('montre le seuil global de livraison offerte à côté du frais', async () => {
    await mount('/reglages/livraison/zones', ['delivery_fee:read'], { pricing: PRICED });

    expect(text().replace(/\s/gu, ' ')).toContain('Livraison offerte dès 50,00 € HT');
  });

  it('une zone n’a une pastille de seuil que si elle le remplace', async () => {
    await mount('/reglages/livraison/zones', ['delivery_fee:read'], {
      pricing: PRICED,
      zones: [
        {
          ...VAL,
          audienceTerms: {
            ...VAL.audienceTerms,
            b2b: { fee: null, freeDeliveryThresholdCents: 12_000 },
          },
        },
      ],
    });

    const badges = [...document.querySelectorAll('.zone fold-badge')].map((b) =>
      b.textContent?.replace(/\s/gu, ' ').trim(),
    );
    expect(badges).toContain('Pros : livraison offerte dès 120,00 € HT');
    expect(badges.some((b) => b?.includes('50,00'))).toBe(false);
  });
});
