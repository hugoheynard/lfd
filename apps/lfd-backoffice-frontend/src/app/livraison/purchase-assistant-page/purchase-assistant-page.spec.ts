import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  BinTypesView,
  PurchaseAssistantPayload,
  PurchaseAssistantView,
  VehiclesView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { DeliveryBinsService } from '../delivery-bins.service';
import { DeliverySettingsService } from '../delivery-settings.service';
import { PurchaseAssistantPage, RECOMPUTE_DEBOUNCE_MS } from './purchase-assistant-page';

const FLEET: VehiclesView = {
  vehicles: [
    {
      id: 'v-sans-cotes',
      name: 'Kangoo',
      plate: 'AA-123-AA',
      retiredAt: null,
      createdAt: '',
      cargo: null,
      wheelArches: null,
      refrigeration: null,
      energy: null,
    },
    {
      id: 'v-trafic',
      name: 'Trafic',
      plate: 'BB-123-BB',
      retiredAt: null,
      createdAt: '',
      cargo: { lengthCm: 290, widthCm: 166, heightCm: 139, volumeLiters: 6691 },
      wheelArches: null,
      refrigeration: null,
      energy: null,
    },
    {
      id: 'v-retire',
      name: 'Ancien',
      plate: 'CC-123-CC',
      retiredAt: '2026-01-01',
      createdAt: '',
      cargo: { lengthCm: 100, widthCm: 100, heightCm: 100, volumeLiters: 1000 },
      wheelArches: null,
      refrigeration: null,
      energy: null,
    },
  ],
};

const BINS: BinTypesView = {
  types: [
    {
      id: 'b-m',
      name: 'Bac M',
      outer: { lengthCm: 60, widthCm: 40, heightCm: 22 },
      inner: { lengthCm: 57, widthCm: 37, heightCm: 20 },
      innerVolumeLiters: 42,
      isotherm: false,
      maxStack: 7,
      divisible: false,
      archivedAt: null,
    },
    {
      id: 'b-vieux',
      name: 'Bac archivé',
      outer: { lengthCm: 30, widthCm: 20, heightCm: 10 },
      inner: { lengthCm: 28, widthCm: 18, heightCm: 9 },
      innerVolumeLiters: 4,
      isotherm: false,
      maxStack: 5,
      divisible: false,
      archivedAt: '2026-01-01',
    },
  ],
};

const VIEW: PurchaseAssistantView = {
  vehicleVolumeLiters: 6691,
  formats: [
    {
      name: 'Bac M',
      floorCount: 16,
      levels: 6,
      total: 96,
      usefulLiters: 4032,
      vehiclePercent: 60,
      heightLimit: 'ceiling',
      rows: [
        { fromCm: 0, depthCm: 61, count: 4, orientation: 'length' },
        { fromCm: 61, depthCm: 41, count: 2, orientation: 'turned' },
      ],
    },
  ],
};

interface Wire {
  sent: PurchaseAssistantPayload[];
  refuse: string | null;
}

let wire: Wire;

async function boot(down = false): Promise<ComponentFixture<PurchaseAssistantPage>> {
  const refused = (): Promise<never> => Promise.reject(new Error('lecture refusée'));
  wire = { sent: [], refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PurchaseAssistantPage],
    providers: [
      {
        provide: DeliverySettingsService,
        useValue: {
          vehicles: () => (down ? refused() : Promise.resolve(FLEET)),
        } satisfies Pick<DeliverySettingsService, 'vehicles'>,
      },
      {
        provide: DeliveryBinsService,
        useValue: {
          binTypes: () => (down ? refused() : Promise.resolve(BINS)),
          assistPurchase: (payload: PurchaseAssistantPayload) => {
            wire.sent.push(payload);
            return wire.refuse === null
              ? Promise.resolve(VIEW)
              : Promise.reject(
                  new HttpErrorResponse({ status: 400, error: { message: wire.refuse } }),
                );
          },
        } satisfies Pick<DeliveryBinsService, 'binTypes' | 'assistPurchase'>,
      },
    ],
  });
  const fixture = TestBed.createComponent(PurchaseAssistantPage);
  await settle(fixture);
  return fixture;
}

/** Laisse passer l'anti-rebond et la réponse. */
async function settle(fixture: ComponentFixture<PurchaseAssistantPage>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve, RECOMPUTE_DEBOUNCE_MS + 20));
  await fixture.whenStable();
  fixture.detectChanges();
}

const host = (fixture: ComponentFixture<PurchaseAssistantPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function typeIn(
  fixture: ComponentFixture<PurchaseAssistantPage>,
  selector: string,
  value: string,
): void {
  const input = host(fixture).querySelector(`${selector} input`);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`${selector} absent`);
  }
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function click(fixture: ComponentFixture<PurchaseAssistantPage>, selector: string): void {
  const button = host(fixture).querySelector<HTMLButtonElement>(selector);
  if (button === null) {
    throw new Error(`${selector} absent`);
  }
  button.click();
  fixture.detectChanges();
}

describe('PurchaseAssistantPage', () => {
  it('pré-remplit par le premier véhicule mesuré et les bacs en service, puis calcule seul', async () => {
    const fixture = await boot();

    expect(wire.sent).toHaveLength(1);
    expect(wire.sent[0]).toEqual({
      floor: { lengthCm: 290, widthCm: 166, heightCm: 139, wheelArches: null },
      gapCm: 1,
      formats: [
        {
          name: 'Bac M',
          outer: { lengthCm: 60, widthCm: 40, heightCm: 22 },
          inner: { lengthCm: 57, widthCm: 37, heightCm: 20 },
          maxStack: 7,
        },
      ],
    });
    expect(host(fixture).querySelectorAll('[data-format]')).toHaveLength(1);
    expect(host(fixture).querySelector('[data-summary]')?.textContent).toContain('6,69 m³');
    const result = host(fixture).querySelector('[data-result]')?.textContent ?? '';
    expect(result).toContain('96');
    expect(result).toContain('16 au sol × 6 étages');
    expect(result).toContain('4,03 m³');
    expect(result).toContain('Limité par le plafond — 7 cm libres au-dessus');
    expect(host(fixture).querySelector('[data-best]')).not.toBeNull();
    // Six bacs dessinés : quatre dans la longueur, deux tournés.
    expect(host(fixture).querySelectorAll('[data-bin]')).toHaveLength(6);
    expect(host(fixture).querySelectorAll('[data-bin].turned')).toHaveLength(2);
    expect(host(fixture).querySelector('[data-method]')?.textContent).toContain('par rangées');
  });

  it('recalcule une seule fois après une rafale de frappes, et la cote retouchée devient une saisie libre', async () => {
    const fixture = await boot();
    typeIn(fixture, '[data-floor-length]', '30');
    typeIn(fixture, '[data-floor-length]', '300');
    await settle(fixture);

    expect(wire.sent).toHaveLength(2);
    expect(wire.sent[1]?.floor.lengthCm).toBe(300);
    expect(host(fixture).querySelector('[data-vehicle-choice]')?.textContent).toContain(
      'Saisie libre',
    );
  });

  it('envoie les passages de roue saisis', async () => {
    const fixture = await boot();
    const checkbox = host(fixture).querySelector('[data-arches] input');
    if (!(checkbox instanceof HTMLInputElement)) {
      throw new Error('case absente');
    }
    checkbox.click();
    fixture.detectChanges();
    typeIn(fixture, '[data-arch-length]', '90');
    typeIn(fixture, '[data-arch-protrusion]', '20');
    typeIn(fixture, '[data-arch-from-back]', '60');
    await settle(fixture);

    expect(wire.sent.at(-1)?.floor.wheelArches).toEqual({
      lengthCm: 90,
      protrusionCm: 20,
      fromBackCm: 60,
    });
    expect(host(fixture).querySelectorAll('[data-arch]')).toHaveLength(2);
  });

  it('n’envoie rien tant qu’un format ajouté n’a pas ses cotes, et le dit', async () => {
    const fixture = await boot();
    click(fixture, '[data-add-format]');
    await settle(fixture);

    expect(wire.sent).toHaveLength(1);
    expect(host(fixture).querySelectorAll('[data-format]')).toHaveLength(2);
    expect(host(fixture).querySelector('[data-missing]')?.textContent).toContain(
      'Format 2, extérieur',
    );
    expect(host(fixture).querySelector('[data-result]')).toBeNull();

    click(fixture, '[data-format]:last-child [data-remove-format] button');
    await settle(fixture);
    expect(host(fixture).querySelectorAll('[data-format]')).toHaveLength(1);
    expect(wire.sent).toHaveLength(2);
  });

  it('montre le refus du serveur tel quel, sans laisser de résultat', async () => {
    const fixture = await boot();
    wire.refuse = 'Le jeu entre bacs doit être compris entre 0 et 10 cm.';
    typeIn(fixture, '[data-gap]', '40');
    await settle(fixture);

    expect(host(fixture).querySelector('[data-refusal]')?.textContent).toContain(
      'Le jeu entre bacs doit être compris entre 0 et 10 cm.',
    );
    expect(host(fixture).querySelector('[data-result]')).toBeNull();
  });

  it('si la flotte et les bacs ne se lisent pas, laisse tout vide, le dit, et n’envoie rien', async () => {
    const fixture = await boot(true);

    expect(host(fixture).querySelector('[data-fleet-unread]')).not.toBeNull();
    expect(host(fixture).querySelector('[data-bins-unread]')).not.toBeNull();
    expect(wire.sent).toHaveLength(0);
    expect(host(fixture).querySelector('[data-missing]')?.textContent).toContain(
      'longueur du véhicule',
    );
  });
});
