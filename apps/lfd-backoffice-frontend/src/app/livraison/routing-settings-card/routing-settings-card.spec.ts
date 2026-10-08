import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type {
  BinTypesView,
  DeliveryRoutingSettingsPayload,
  DeliveryRoutingSettingsView,
} from '@lfd/contracts';
import { FoldListboxComponent, FoldNumberInputComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../notify.service';
import { DeliveryBinsService } from '../delivery-bins.service';
import { DeliveryRoutingService } from '../delivery-routing.service';
import { RoutingSettingsCard } from './routing-settings-card';

const FACTORY: DeliveryRoutingSettingsView = {
  detourPercent: 140,
  averageSpeedKmh: 35,
  earliestDeparture: '07:00',
  maxRoundMinutes: 240,
  stopMinutes: 5,
  safetyMarginMinutes: 20,
  defaultMode: 'insert',
  multiplePassages: true,
  defaultContainer: null,
  binGapCm: 1,
  source: 'default',
};

const BIN_TYPE = {
  outer: { lengthMm: 665, widthMm: 460, heightMm: 300 },
  inner: { lengthMm: 640, widthMm: 430, heightMm: 280 },
  innerVolumeLiters: 77,
  isotherm: false,
  maxStack: 6,
  divisible: false,
};
const TYPES: BinTypesView = {
  types: [
    { ...BIN_TYPE, id: 'manne', name: 'Manne', archivedAt: null },
    { ...BIN_TYPE, id: 'old', name: 'Vieux bac', archivedAt: '2026-01-01T00:00:00.000Z' },
  ],
};

interface Wire {
  view: DeliveryRoutingSettingsView;
  reads: number;
  writes: DeliveryRoutingSettingsPayload[];
  refuse: string | null;
}

let wire: Wire;

async function boot(canWrite = true): Promise<ComponentFixture<RoutingSettingsCard>> {
  wire = { view: FACTORY, reads: 0, writes: [], refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [RoutingSettingsCard],
    providers: [
      {
        provide: DeliveryRoutingService,
        useValue: {
          settings: () => {
            wire.reads += 1;
            return Promise.resolve(wire.view);
          },
          saveSettings: (payload: DeliveryRoutingSettingsPayload) => {
            wire.writes.push(payload);
            if (wire.refuse !== null) {
              return Promise.reject(
                new HttpErrorResponse({ status: 400, error: { message: wire.refuse } }),
              );
            }
            wire.view = {
              ...payload,
              detourPercent: payload.detourPercent ?? wire.view.detourPercent,
              averageSpeedKmh: payload.averageSpeedKmh ?? wire.view.averageSpeedKmh,
              safetyMarginMinutes: payload.safetyMarginMinutes ?? wire.view.safetyMarginMinutes,
              binGapCm: payload.binGapCm ?? wire.view.binGapCm,
              defaultContainer:
                payload.defaultContainer === undefined
                  ? wire.view.defaultContainer
                  : payload.defaultContainer,
              source: 'explicit',
            };
            return Promise.resolve();
          },
        } satisfies Partial<Record<keyof DeliveryRoutingService, unknown>>,
      },
      {
        provide: DeliveryBinsService,
        useValue: {
          binTypes: () => Promise.resolve(TYPES),
        } satisfies Partial<Record<keyof DeliveryBinsService, unknown>>,
      },
      { provide: NotifyService, useValue: { success: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(RoutingSettingsCard);
  fixture.componentRef.setInput('canWrite', canWrite);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<RoutingSettingsCard>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

const host = (fixture: ComponentFixture<RoutingSettingsCard>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function saveButton(fixture: ComponentFixture<RoutingSettingsCard>): HTMLButtonElement | null {
  return host(fixture).querySelector<HTMLButtonElement>('button[data-save-routing]');
}

function numberInput(fixture: ComponentFixture<RoutingSettingsCard>, selector: string) {
  const found = fixture.debugElement.query(By.css(selector));
  expect(found.componentInstance).toBeInstanceOf(FoldNumberInputComponent);
  return found;
}

describe('RoutingSettingsCard', () => {
  it('dit « par défaut » tant que personne n’a réglé', async () => {
    const fixture = await boot();

    expect(host(fixture).textContent).toContain('Par défaut');
  });

  /** Lot 10 bis (L10b-C5) : le vol d'oiseau a disparu, ses deux réglages avec lui. */
  it('ne montre plus ni détour ni vitesse moyenne', async () => {
    const fixture = await boot();

    expect(host(fixture).querySelector('[data-detour]')).toBeNull();
    expect(host(fixture).querySelector('[data-speed]')).toBeNull();
  });

  it('n’enregistre rien tant que rien n’a changé', async () => {
    const fixture = await boot();

    expect(saveButton(fixture)?.disabled).toBe(true);
  });

  it('renvoie détour et vitesse lus inchangés, puis relit la provenance', async () => {
    const fixture = await boot();
    numberInput(fixture, '[data-stop-minutes]').triggerEventHandler('valueChange', 7);
    await settle(fixture);
    saveButton(fixture)?.click();
    await settle(fixture);

    expect(wire.writes).toEqual([
      {
        detourPercent: 140,
        averageSpeedKmh: 35,
        earliestDeparture: '07:00',
        maxRoundMinutes: 240,
        stopMinutes: 7,
        safetyMarginMinutes: 20,
        defaultMode: 'insert',
        multiplePassages: true,
        defaultContainer: null,
        binGapCm: 1,
      },
    ]);
    expect(wire.reads).toBe(2);
    expect(host(fixture).textContent).toContain('Réglé par l’équipe');
  });

  /** Lot 7 ter (L7t-C3) : le réglage s'appelle comme ce qu'il mesure. */
  it('nomme le temps « de livraison sur place »', async () => {
    const fixture = await boot();

    expect(host(fixture).textContent).toContain('Temps de livraison sur place (min)');
    expect(host(fixture).textContent).not.toContain('Temps d’arrêt');
  });

  /** Lot 7 ter (L7t-C1) : la marge avant la fin du créneau se règle et s'envoie. */
  it('règle la marge de sécurité, et l’aide reprend la valeur', async () => {
    const fixture = await boot();
    expect(host(fixture).textContent).toContain('au moins 20 minutes avant la fin du créneau');
    numberInput(fixture, '[data-safety-margin]').triggerEventHandler('valueChange', 30);
    await settle(fixture);
    expect(host(fixture).textContent).toContain('au moins 30 minutes avant la fin du créneau');
    saveButton(fixture)?.click();
    await settle(fixture);

    expect(wire.writes[0]?.safetyMarginMinutes).toBe(30);
  });

  /** G5a (2026-10-08) : le jeu entre bacs se lit du réglage et s'envoie. */
  it('règle le jeu entre bacs', async () => {
    const fixture = await boot();
    expect(host(fixture).textContent).toContain('Jeu entre bacs (cm)');
    expect(numberInput(fixture, '[data-bin-gap]').componentInstance.value()).toBe(1);
    numberInput(fixture, '[data-bin-gap]').triggerEventHandler('valueChange', 3);
    await settle(fixture);
    saveButton(fixture)?.click();
    await settle(fixture);

    expect(wire.writes[0]?.binGapCm).toBe(3);
  });

  it('n’enregistre pas un jeu vidé', async () => {
    const fixture = await boot();
    numberInput(fixture, '[data-bin-gap]').triggerEventHandler('valueChange', null);
    await settle(fixture);

    expect(saveButton(fixture)?.disabled).toBe(true);
  });

  it('n’enregistre pas une marge vidée', async () => {
    const fixture = await boot();
    numberInput(fixture, '[data-safety-margin]').triggerEventHandler('valueChange', null);
    await settle(fixture);

    expect(saveButton(fixture)?.disabled).toBe(true);
  });

  it('affiche le refus du serveur tel quel', async () => {
    const fixture = await boot();
    wire.refuse = 'La durée maximale ne descend pas sous 30 min.';
    numberInput(fixture, '[data-max-round]').triggerEventHandler('valueChange', 10);
    await settle(fixture);
    saveButton(fixture)?.click();
    await settle(fixture);

    expect(host(fixture).querySelector('[data-routing-refusal]')?.textContent).toContain(
      'La durée maximale ne descend pas sous 30 min.',
    );
  });

  it('n’enregistre pas un brouillon incomplet', async () => {
    const fixture = await boot();
    numberInput(fixture, '[data-stop-minutes]').triggerEventHandler('valueChange', null);
    await settle(fixture);

    expect(saveButton(fixture)?.disabled).toBe(true);
  });

  it('sans droit d’écriture : lecture seule, pas d’Enregistrer', async () => {
    const fixture = await boot(false);

    expect(saveButton(fixture)).toBeNull();
    const maxRound = numberInput(fixture, '[data-max-round]')
      .componentInstance as FoldNumberInputComponent;
    expect(maxRound.readOnly()).toBe(true);
  });

  describe('le contenant par défaut d’une commande (2026-10-06)', () => {
    function listbox(fixture: ComponentFixture<RoutingSettingsCard>) {
      const found = fixture.debugElement.query(By.css('[data-default-bin-type]'));
      expect(found.componentInstance).toBeInstanceOf(FoldListboxComponent);
      return found;
    }

    it('propose « Aucun » et les seuls types en service ; sans type, pas de nombre', async () => {
      const fixture = await boot();
      const options = (
        listbox(fixture).componentInstance as FoldListboxComponent<string>
      ).options();

      expect(options?.map((option) => ('label' in option ? option.label : ''))).toEqual([
        'Aucun — place non vérifiée',
        'Manne',
      ]);
      expect(host(fixture).querySelector('[data-default-bin-count]')).toBeNull();
    });

    it('choisit un type et un nombre, et les envoie', async () => {
      const fixture = await boot();
      listbox(fixture).triggerEventHandler('selectionChange', 'manne');
      await settle(fixture);
      numberInput(fixture, '[data-default-bin-count]').triggerEventHandler('valueChange', 2);
      await settle(fixture);
      saveButton(fixture)?.click();
      await settle(fixture);

      expect(wire.writes[0]?.defaultContainer).toEqual({ binTypeId: 'manne', count: 2 });
      expect(wire.view.defaultContainer).toEqual({ binTypeId: 'manne', count: 2 });
    });

    it('n’enregistre pas un type sans nombre', async () => {
      const fixture = await boot();
      listbox(fixture).triggerEventHandler('selectionChange', 'manne');
      await settle(fixture);
      numberInput(fixture, '[data-default-bin-count]').triggerEventHandler('valueChange', null);
      await settle(fixture);

      expect(saveButton(fixture)?.disabled).toBe(true);
    });

    it('« Aucun » vide un réglage posé', async () => {
      const fixture = await boot();
      listbox(fixture).triggerEventHandler('selectionChange', 'manne');
      await settle(fixture);
      saveButton(fixture)?.click();
      await settle(fixture);
      listbox(fixture).triggerEventHandler('selectionChange', '');
      await settle(fixture);
      saveButton(fixture)?.click();
      await settle(fixture);

      expect(wire.writes.map((write) => write.defaultContainer)).toEqual([
        { binTypeId: 'manne', count: 1 },
        null,
      ]);
    });
  });
});
