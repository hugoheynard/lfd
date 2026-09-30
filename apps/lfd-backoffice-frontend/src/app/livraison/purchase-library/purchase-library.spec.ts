import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  PurchaseBinCandidateView,
  PurchaseVehicleCandidateView,
  StaffPermission,
} from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { PurchaseLibraryService } from '../purchase-library.service';
import { PurchaseVehicleCandidateDialog } from '../purchase-vehicle-candidate-dialog/purchase-vehicle-candidate-dialog';
import { PurchaseLibrary } from './purchase-library';

const AUTHOR = { staffUserId: 's1', name: 'Hugo', role: 'admin' };

function vehicle(id: string, archivedAt: string | null = null): PurchaseVehicleCandidateView {
  return {
    id,
    name: `Trafic ${id}`,
    reference: 'L2H1',
    purchaseUrl: 'https://exemple.fr/trafic',
    createdAt: '2026-01-01T08:00:00.000Z',
    updatedAt: '2026-01-01T08:00:00.000Z',
    updatedBy: AUTHOR,
    archivedAt,
    cargo: { lengthCm: 250, widthCm: 170, heightCm: 130, volumeLiters: 5525 },
    wheelArches: null,
    priceCentsExclVat: id === 'v1' ? 2_500_000 : null,
  };
}

const BIN: PurchaseBinCandidateView = {
  id: 'b1',
  name: 'Caisse Dupont 50',
  reference: null,
  purchaseUrl: null,
  createdAt: '2026-01-01T08:00:00.000Z',
  updatedAt: '2026-01-01T08:00:00.000Z',
  updatedBy: AUTHOR,
  archivedAt: null,
  outer: { lengthCm: 60, widthCm: 40, heightCm: 30 },
  inner: { lengthCm: 56, widthCm: 36, heightCm: 28 },
  innerVolumeLiters: 56,
  isotherm: true,
  maxStack: 5,
  supplier: 'Dupont',
  unitPriceCentsExclVat: 1250,
};

interface Wire {
  vehicles: PurchaseVehicleCandidateView[] | null;
  reads: boolean[];
  archived: string[];
  refuse: string | null;
  opened: { component: unknown; data: unknown }[];
}

let wire: Wire;

async function boot(
  vehicles: PurchaseVehicleCandidateView[] | null,
  grants: readonly StaffPermission[] = ['delivery_rounds:read', 'delivery_rounds:write'],
): Promise<ComponentFixture<PurchaseLibrary>> {
  wire = { vehicles, reads: [], archived: [], refuse: null, opened: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PurchaseLibrary],
    providers: [
      {
        provide: PurchaseLibraryService,
        useValue: {
          vehicleCandidates: (include: boolean) => {
            wire.reads.push(include);
            return wire.vehicles === null
              ? Promise.reject(new Error('indisponible'))
              : Promise.resolve({ candidates: wire.vehicles });
          },
          binCandidates: () => Promise.resolve({ candidates: [BIN] }),
          archiveVehicleCandidate: (id: string) => {
            wire.archived.push(id);
            return wire.refuse === null
              ? Promise.resolve()
              : Promise.reject(
                  new HttpErrorResponse({ status: 409, error: { message: wire.refuse } }),
                );
          },
        } satisfies Partial<PurchaseLibraryService>,
      },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission) => grants.includes(permission) },
      },
      { provide: NotifyService, useValue: { success: () => undefined } },
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (component: unknown, config: { data: unknown }) => {
            wire.opened.push({ component, data: config.data });
            return { closed: Promise.resolve(false) };
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(PurchaseLibrary);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<PurchaseLibrary>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

const host = (fixture: ComponentFixture<PurchaseLibrary>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('PurchaseLibrary', () => {
  it('montre les deux listes : prix HT en euros, « prix inconnu » sinon', async () => {
    const fixture = await boot([vehicle('v1'), vehicle('v2')]);
    const cards = [...host(fixture).querySelectorAll('[data-vehicle-candidate]')];
    expect(cards).toHaveLength(2);
    expect(cards[0]?.textContent?.replace(/\s/g, ' ')).toContain('25 000,00 € HT');
    expect(cards[1]?.textContent).toContain('prix inconnu');
    expect(
      host(fixture).querySelector('[data-bin-candidate]')?.textContent?.replace(/\s/g, ' '),
    ).toContain('12,50 € HT l’unité');
  });

  it('ouvre le lien d’achat dans un nouvel onglet, sans référent', async () => {
    const fixture = await boot([vehicle('v1')]);
    const link = host(fixture).querySelector<HTMLAnchorElement>('[data-url] a');
    expect(link?.getAttribute('href')).toBe('https://exemple.fr/trafic');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('sans `delivery_rounds:write`, aucun geste d’écriture', async () => {
    const fixture = await boot([vehicle('v1')], ['delivery_rounds:read']);
    expect(host(fixture).querySelector('[data-add-vehicle]')).toBeNull();
    expect(host(fixture).querySelector('[data-add-bin]')).toBeNull();
    expect(host(fixture).querySelector('[data-correct]')).toBeNull();
    expect(host(fixture).querySelector('[data-archive]')).toBeNull();
  });

  it('les archivés ne se lisent que sur demande, et se réactivent', async () => {
    const fixture = await boot([vehicle('v1')]);
    expect(wire.reads).toEqual([false]);

    wire.vehicles = [vehicle('v1'), vehicle('v3', '2026-02-01T10:00:00.000Z')];
    host(fixture).querySelector<HTMLInputElement>('[data-show-archived] input')?.click();
    await settle(fixture);

    expect(wire.reads).toEqual([false, true]);
    expect(host(fixture).textContent).toContain('archivé le 1 février 2026');
    expect(host(fixture).querySelectorAll('[data-reactivate]')).toHaveLength(1);
  });

  it('🔴 un refus d’archivage s’affiche tel quel, la liste reste', async () => {
    const fixture = await boot([vehicle('v1')]);
    wire.refuse = 'Le véhicule « Trafic v1 » est cité par un scénario.';
    host(fixture).querySelector<HTMLButtonElement>('[data-archive]')?.click();
    await settle(fixture);

    expect(wire.archived).toEqual(['v1']);
    expect(host(fixture).querySelector('[data-refusal]')?.textContent).toContain(
      'cité par un scénario',
    );
    expect(host(fixture).querySelectorAll('[data-vehicle-candidate]')).toHaveLength(1);
  });

  it('corriger ouvre le dialogue du candidat', async () => {
    const fixture = await boot([vehicle('v1')]);
    host(fixture).querySelector<HTMLButtonElement>('[data-correct]')?.click();
    await settle(fixture);
    expect(wire.opened).toEqual([
      { component: PurchaseVehicleCandidateDialog, data: { candidate: vehicle('v1') } },
    ]);
  });

  it('dit l’échec de lecture par liste', async () => {
    const fixture = await boot(null);
    expect(host(fixture).querySelector('[data-vehicles-error]')).not.toBeNull();
    expect(host(fixture).querySelectorAll('[data-bin-candidate]')).toHaveLength(1);
  });
});
