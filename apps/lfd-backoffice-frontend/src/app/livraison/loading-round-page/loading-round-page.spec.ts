import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import type {
  DeliveryLoadingBinView,
  DeliveryLoadingRoundView,
  LoadDeliveryBinPayload,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { BinScanner } from '../bin-scanner/bin-scanner';
import { DeliveryLoadingService } from '../delivery-loading.service';
import { loadedNotice } from '../loading-round/loading-round';
import { LoadingRoundPage } from './loading-round-page';

const WRITE: readonly StaffPermission[] = ['delivery_loading:read', 'delivery_loading:write'];

function bin(overrides: Partial<DeliveryLoadingBinView> = {}): DeliveryLoadingBinView {
  return {
    binId: 'b-1',
    code: 'ABC234',
    index: 1,
    binTypeName: 'Bac M',
    half: null,
    innerBags: 0,
    sharedWithReference: null,
    toRedo: false,
    loadedAt: null,
    ...overrides,
  };
}

function round(overrides: Partial<DeliveryLoadingRoundView> = {}): DeliveryLoadingRoundView {
  return {
    roundId: 'r-1',
    day: '2026-10-01',
    vehicleName: 'Kangoo',
    passage: 1,
    version: 5,
    departedAt: null,
    stops: [
      {
        stopId: 's-1',
        orderId: 'o-1',
        reference: 'CMD-1',
        customerLabel: 'Le Comptoir',
        position: 1,
        state: 'partial',
        bins: [
          bin({ binId: 'b-1', code: 'ABC234', index: 1, loadedAt: '2026-10-01T05:00:00.000Z' }),
          bin({ binId: 'b-2', code: 'ABC235', index: 2, half: 'left', innerBags: 2 }),
        ],
      },
      {
        stopId: 's-2',
        orderId: 'o-2',
        reference: 'CMD-2',
        customerLabel: 'Chez Paul',
        position: 2,
        state: 'unlabelled',
        bins: [],
      },
    ],
    ...overrides,
  };
}

interface Wire {
  readonly calls: string[];
  view: DeliveryLoadingRoundView;
  refuse: HttpErrorResponse | null;
}

let wire: Wire;

function outcome(call: string): Promise<void> {
  wire.calls.push(call);
  return wire.refuse === null ? Promise.resolve() : Promise.reject(wire.refuse);
}

async function settle(fixture: ComponentFixture<LoadingRoundPage>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function boot(
  grants: readonly StaffPermission[] = WRITE,
  view: DeliveryLoadingRoundView = round(),
): Promise<{ fixture: ComponentFixture<LoadingRoundPage>; element: HTMLElement }> {
  wire = { calls: [], view, refuse: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: DeliveryLoadingService,
        useValue: {
          round: () => Promise.resolve(wire.view),
          plan: () => Promise.reject(new Error('plan hors sujet ici')),
          load: (roundId: string, payload: LoadDeliveryBinPayload) =>
            outcome(`load ${roundId} ${JSON.stringify(payload)}`),
          unload: (roundId: string, binId: string) => outcome(`unload ${roundId} ${binId}`),
          depart: (roundId: string, version: number) =>
            outcome(`depart ${roundId} ${String(version)}`),
        } satisfies Partial<Record<keyof DeliveryLoadingService, unknown>>,
      },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission) => grants.includes(permission) },
      },
    ],
  });
  const fixture = TestBed.createComponent(LoadingRoundPage);
  fixture.componentRef.setInput('roundId', 'r-1');
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

function scan(fixture: ComponentFixture<LoadingRoundPage>, raw: string): void {
  fixture.debugElement.query(By.directive(BinScanner)).triggerEventHandler('scanned', raw);
}

describe('LoadingRoundPage', () => {
  it('liste ce qui manque, arrêt par arrêt, l’arrêt sans bac compris', async () => {
    const { element } = await boot();
    const missing = [...element.querySelectorAll('[data-missing-row]')].map((line) =>
      [...line.querySelectorAll(':scope > span, :scope > span > *')]
        .filter((part) => part.children.length === 0)
        .map((part) => part.textContent?.trim())
        .join(' '),
    );
    // La pastille d'arrêt, le client, les codes restants en Mono, combien.
    expect(missing).toEqual(['1 Le Comptoir ABC235 1 à charger', '2 Chez Paul aucun bac déclaré']);
    expect(element.querySelector('[data-missing-row] .lr-miss-stop')?.className).toContain(
      'hue-a-0',
    );
  });

  it('charge un bac scanné par son identifiant — le scan est le geste', async () => {
    const { fixture, element } = await boot();
    scan(fixture, 'https://bo.example/livraison/bac/b-2');
    await settle(fixture);
    expect(wire.calls).toEqual(['load r-1 {"binId":"b-2"}']);
    expect(element.querySelector('[data-notice]')?.textContent).toContain(
      'CMD-1 · Le Comptoir — bac 2 (Bac M · ½ gauche · 2 sacs dedans) chargé',
    );
  });

  it('🔴 n’envoie rien pour un code qui n’est pas un bac', async () => {
    const { fixture, element } = await boot();
    scan(fixture, 'https://bo.example/colisage/CMD-1');
    await settle(fixture);
    expect(wire.calls).toEqual([]);
    expect(element.querySelector('[data-notice]')?.textContent).toContain('ne désigne pas un bac');
  });

  it('affiche le refus du serveur tel quel — un bac d’une autre tournée nomme le véhicule', async () => {
    const { fixture, element } = await boot();
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'Ce bac part dans le Master bleu.' },
    });
    scan(fixture, 'abc 236');
    await settle(fixture);
    expect(wire.calls).toEqual(['load r-1 {"code":"ABC236"}']);
    expect(element.querySelector('[data-notice-text]')?.textContent?.trim()).toBe(
      'Ce bac part dans le Master bleu.',
    );
  });

  it('part avec la version lue, et dit le refus qui liste les références', async () => {
    const { fixture, element } = await boot();
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'Non chargés : CMD-1, CMD-2.' },
    });
    element.querySelector<HTMLButtonElement>('button[data-depart]')?.click();
    await settle(fixture);
    expect(wire.calls).toEqual(['depart r-1 5']);
    expect(element.querySelector('[data-notice]')?.textContent).toContain('CMD-1, CMD-2');
  });

  it('une tournée partie est en lecture seule : ni scanner, ni décharger, ni partir', async () => {
    const { element } = await boot(WRITE, round({ departedAt: '2026-10-01T05:42:00.000Z' }));
    expect(element.querySelector('[data-departed]')?.textContent).toContain('7 h 42');
    expect(element.querySelector('[data-scan]')).toBeNull();
    expect(element.querySelector('[data-unload]')).toBeNull();
    expect(element.querySelector('[data-depart]')).toBeNull();
  });

  it('🔴 un bac partagé à refaire se dit en alerte, et « Partir » dit le refus tel quel', async () => {
    const view = round();
    const [first, second] = view.stops;
    if (first === undefined || second === undefined) {
      throw new Error('fixture');
    }
    const redo = bin({
      binId: 'h-1',
      code: 'ABC299',
      half: 'left',
      sharedWithReference: 'CMD-9',
      toRedo: true,
      loadedAt: '2026-10-01T05:00:00.000Z',
    });
    const { fixture, element } = await boot(
      WRITE,
      round({ stops: [{ ...first, state: 'loaded', bins: [redo] }, second] }),
    );
    expect(element.querySelector('[data-to-redo]')?.textContent).toContain('Un arrêt porte');
    expect(element.querySelector('[data-missing-row]')?.textContent).toContain(
      'bac partagé à refaire',
    );
    const refusal =
      'Le bac partagé ABC299 n’est plus entre deux arrêts consécutifs : recolisez-le ou remettez les arrêts côte à côte.';
    wire.refuse = new HttpErrorResponse({ status: 409, error: { message: refusal } });
    element.querySelector<HTMLButtonElement>('button[data-depart]')?.click();
    await settle(fixture);
    expect(element.querySelector('[data-notice-text]')?.textContent?.trim()).toBe(refusal);
  });

  it('sans écriture, on lit le chargement sans aucun geste', async () => {
    const { element } = await boot(['delivery_loading:read']);
    expect(element.querySelectorAll('[data-missing-row]')).toHaveLength(2);
    expect(element.querySelector('[data-scan]')).toBeNull();
    expect(element.querySelector('[data-depart]')).toBeNull();
  });
});

describe('LoadingRoundPage — le bandeau du dépôt', () => {
  it('porte le fil d’Ariane Livraison / Chargement / Tournée, sans titre de page', async () => {
    const { element } = await boot();
    const crumbs = element.querySelector('[data-loading-head] fold-breadcrumb');
    const links = [...(crumbs?.querySelectorAll('a') ?? [])].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/livraison', '/livraison/chargement']);
    expect(crumbs?.textContent).toContain('Tournée · Kangoo');
    expect(element.querySelector('h1')).toBeNull();
  });
});

describe('loadedNotice', () => {
  it('nomme la commande, le rang et le type du bac chargé', () => {
    expect(loadedNotice(round(), { code: 'ABC235' })).toBe(
      'CMD-1 · Le Comptoir — bac 2 (Bac M · ½ gauche · 2 sacs dedans) chargé (1 bac sur 2).',
    );
  });
});
