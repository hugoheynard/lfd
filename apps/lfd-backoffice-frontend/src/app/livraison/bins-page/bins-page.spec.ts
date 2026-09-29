import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { BinTypeView, StaffPermission } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { BinTypeDialog } from '../bin-type-dialog/bin-type-dialog';
import { DeliveryBinsService } from '../delivery-bins.service';
import { BinsPage } from './bins-page';

function bin(id: string, name: string, archivedAt: string | null = null): BinTypeView {
  return {
    id,
    name,
    outer: { lengthCm: 60, widthCm: 40, heightCm: 30 },
    inner: { lengthCm: 56, widthCm: 36, heightCm: 27 },
    innerVolumeLiters: 54,
    isotherm: false,
    maxStack: 5,
    divisible: false,
    archivedAt,
  };
}

interface Wire {
  types: BinTypeView[] | null;
  reads: number;
  archived: string[];
  reactivated: string[];
  refuse: string | null;
  opened: { component: unknown; data: unknown }[];
  answer: (result: boolean | undefined) => void;
  said: string[];
}

let wire: Wire;

function writeOutcome(): Promise<void> {
  return wire.refuse === null
    ? Promise.resolve()
    : Promise.reject(new HttpErrorResponse({ status: 409, error: { message: wire.refuse } }));
}

async function boot(
  types: BinTypeView[] | null,
  grants: readonly StaffPermission[] = ['delivery_settings:read', 'delivery_settings:write'],
): Promise<ComponentFixture<BinsPage>> {
  wire = {
    types,
    reads: 0,
    archived: [],
    reactivated: [],
    refuse: null,
    opened: [],
    answer: () => undefined,
    said: [],
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BinsPage],
    providers: [
      {
        provide: DeliveryBinsService,
        useValue: {
          binTypes: () => {
            wire.reads += 1;
            return wire.types === null
              ? Promise.reject(new Error('indisponible'))
              : Promise.resolve({ types: wire.types });
          },
          archiveBinType: (id: string) => {
            wire.archived.push(id);
            return writeOutcome();
          },
          reactivateBinType: (id: string) => {
            wire.reactivated.push(id);
            return writeOutcome();
          },
        } satisfies Pick<DeliveryBinsService, 'binTypes' | 'archiveBinType' | 'reactivateBinType'>,
      },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission) => grants.includes(permission) },
      },
      { provide: NotifyService, useValue: { success: (m: string) => wire.said.push(m) } },
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (component: unknown, config: { data: unknown }) => {
            wire.opened.push({ component, data: config.data });
            return {
              closed: new Promise<boolean | undefined>((resolve) => {
                wire.answer = resolve;
              }),
            };
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(BinsPage);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<BinsPage>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

const all = (fixture: ComponentFixture<BinsPage>, selector: string): HTMLElement[] => [
  ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(selector),
];

function click(fixture: ComponentFixture<BinsPage>, selector: string, index = 0): void {
  const button = all(fixture, selector)[index];
  if (button === undefined) throw new Error(`${selector} absent.`);
  button.click();
}

const CATALOGUE = [
  bin('1', 'Bac M'),
  bin('2', 'Bac L', '2026-02-01T10:00:00.000Z'),
  bin('3', 'Bac S'),
];

describe('BinsPage', () => {
  it('montre les proposés avec leurs dimensions, et les archivés à part', async () => {
    const fixture = await boot(CATALOGUE);

    expect(all(fixture, '[data-active-bin]').map((card) => card.textContent)).toEqual([
      expect.stringContaining('Bac M'),
      expect.stringContaining('Bac S'),
    ]);
    expect(all(fixture, '[data-outer]')[0]?.textContent).toContain('60 × 40 × 30 cm');
    expect(all(fixture, '[data-inner]')[0]?.textContent).toContain('56 × 36 × 27 cm · 54 L');
    expect(all(fixture, '[data-archived-bin]')[0]?.textContent).toContain(
      'archivé le 1 février 2026',
    );
  });

  it('dit le catalogue vide, et l’échec de lecture avec un geste pour relire', async () => {
    expect(all(await boot([]), '[data-bins-empty]')).toHaveLength(1);

    const fixture = await boot(null);
    expect(all(fixture, '[data-bins-error]')).toHaveLength(1);
    wire.types = CATALOGUE;
    click(fixture, '[data-bins-error] button');
    await settle(fixture);
    expect(all(fixture, '[data-active-bin]')).toHaveLength(2);
  });

  it('sans droit d’écriture, aucun geste n’est offert', async () => {
    const fixture = await boot(CATALOGUE, ['delivery_settings:read']);
    expect(all(fixture, '[data-add], [data-correct], [data-archive], [data-reactivate]')).toEqual(
      [],
    );
  });

  it('archiver écrit, annonce et relit', async () => {
    const fixture = await boot(CATALOGUE);
    click(fixture, '[data-archive]', 1);
    await settle(fixture);

    expect(wire.archived).toEqual(['3']);
    expect(wire.said).toEqual(['« Bac S » archivé.']);
    expect(wire.reads).toBe(2);
  });

  it('un refus de réactivation s’affiche tel quel, la liste reste', async () => {
    const fixture = await boot(CATALOGUE);
    wire.refuse = 'Un type actif porte déjà le nom « Bac L ».';
    click(fixture, '[data-reactivate]');
    await settle(fixture);

    expect(all(fixture, '[data-refusal]')[0]?.textContent).toContain('porte déjà le nom');
    expect(all(fixture, '[data-active-bin]')).toHaveLength(2);
  });

  it('corriger ouvre le dialogue sur le type, et relit s’il enregistre', async () => {
    const fixture = await boot(CATALOGUE);
    click(fixture, '[data-correct]');
    expect(wire.opened).toEqual([{ component: BinTypeDialog, data: { bin: CATALOGUE[0] } }]);

    wire.answer(true);
    await settle(fixture);
    expect(wire.said).toEqual(['Type de bac mis à jour.']);
    expect(wire.reads).toBe(2);
  });
});
