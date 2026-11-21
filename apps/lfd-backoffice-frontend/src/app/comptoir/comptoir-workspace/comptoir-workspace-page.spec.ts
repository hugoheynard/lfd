import { PickupAddressesService } from '../../b2b/reglages/pickup-addresses.service';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { HandoverQueueEntryView, HandoverQueueView, StaffPermission } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NewOrderDialog } from '../../commandes/new-order-dialog/new-order-dialog';
import { VersionWatcher } from '../../shared/version/version-watcher';
import { HandoverQueueService } from '../../handover-shop/handover-queue.service';
import { CustomerRequestsService } from '../../b2b/demandes/customer-requests.service';
import { WorkspaceRailStore } from '../../shared/workspace-rail/workspace-rail.store';
import { comptoirLanding } from '../comptoir-landing';
import { ComptoirWorkspacePage } from './comptoir-workspace-page';

@Component({
  selector: 'app-blank',
  template: '',
})
class Blank {}

function entry(id: string, pickupLabel: string): HandoverQueueEntryView {
  return {
    orderId: id,
    reference: `CMD-${id}`,
    customerLabel: 'Boulangerie Marin',
    tradeName: null,
    pickupLabel,
    fulfillmentMethod: 'pickup',
    window: { start: '06:00', end: '08:00', source: 'default' },
    totalUnits: 1,
    placedAt: '2026-09-10T05:00:00.000Z',
    state: 'expected',
    handedOverAt: null,
    handedOverVia: null,
    readyAt: null,
    heldForQuality: false,
    clientele: 'pro',
  };
}

/** La file doublée : elle compte les appels — c'est par eux qu'on voit un 403 évité. */
class FakeQueue {
  readonly days: string[] = [];
  /** Tolérance nulle : ces cas jugent le retard dès la fin du créneau. */
  lateTolerance(): Promise<number> {
    return Promise.resolve(0);
  }

  forDay(day: string): Promise<HandoverQueueView> {
    this.days.push(day);
    return Promise.resolve({
      day,
      entries: [entry('a', 'Laboratoire'), entry('b', 'Val Thorens')],
    });
  }
}

let queue = new FakeQueue();

const RETRAIT: readonly StaffPermission[] = ['handover_counter:read'];
const COMMANDE: readonly StaffPermission[] = ['b2b_counter:read', 'b2b_place_order:write'];

async function open(
  granted: readonly StaffPermission[],
  url: string,
  places: readonly { id: string; label: string }[] = [],
): Promise<RouterTestingHarness> {
  TestBed.resetTestingModule();
  queue = new FakeQueue();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        {
          path: 'comptoir',
          component: ComptoirWorkspacePage,
          children: [
            { path: '', pathMatch: 'full', redirectTo: comptoirLanding },
            { path: '**', component: Blank },
          ],
        },
      ]),
      {
        provide: PermissionsStore,
        useValue: {
          can: (p: StaffPermission) => granted.includes(p),
          ensureLoaded: () => Promise.resolve(),
        },
      },
      { provide: CustomerRequestsService, useValue: {} },
      { provide: HandoverQueueService, useValue: queue },
      { provide: VersionWatcher, useValue: { watch: () => undefined } },
      {
        provide: PickupAddressesService,
        useValue: { list: () => Promise.resolve(places), listFor: () => Promise.resolve([]) },
      },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  // `routerLinkActive` se pose après la fin de navigation.
  harness.detectChanges();
  await harness.fixture.whenStable();
  return harness;
}

function newOrderButton(harness: RouterTestingHarness): HTMLElement | null {
  const el: HTMLElement = harness.fixture.nativeElement;
  return el.querySelector<HTMLElement>('app-comptoir-masthead [data-new-order]');
}

function tabLabels(harness: RouterTestingHarness): string[] {
  const nav: HTMLElement = harness.fixture.nativeElement;
  return Array.from(nav.querySelectorAll('fold-view-nav a')).map(
    (a) => a.textContent?.trim() ?? '',
  );
}

function activeLabel(harness: RouterTestingHarness): string | undefined {
  const nav: HTMLElement = harness.fixture.nativeElement;
  return nav.querySelector('fold-view-nav a[aria-current="page"]')?.textContent?.trim();
}

describe('ComptoirWorkspacePage — les onglets du comptoir', () => {
  it('montre deux onglets et le bouton « Nouvelle commande » à qui tient tout', async () => {
    const harness = await open([...RETRAIT, ...COMMANDE], '/comptoir/retrait');
    const labels = tabLabels(harness);
    expect(labels).toHaveLength(2);
    // Le retrait en tête, puis le réassort.
    expect(labels[0]).toContain('Retrait commande');
    expect(labels[1]).toContain('Réassort');
    // Prendre une commande est un geste, pas une vue (Hugo, 2026-11-21).
    expect(newOrderButton(harness)).not.toBeNull();
  });

  it('ouvre le dialogue de la liste, avec le comptoir pour origine et le point ouvert', async () => {
    const harness = await open([...RETRAIT, ...COMMANDE], '/comptoir/retrait', [
      { id: 'site_l', label: 'Labo' },
    ]);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const opened = vi.spyOn(TestBed.inject(FoldPanelHostService), 'open');
    pointTab(harness, 'Labo')?.click();
    harness.detectChanges();
    newOrderButton(harness)?.click();
    expect(opened).toHaveBeenCalledWith(NewOrderDialog, {
      side: 'center',
      width: 'sm',
      data: { origin: '/comptoir', point: 'site_l' },
    });
  });

  it('ne montre plus les modèles de réassort en onglet, même à qui les lit', async () => {
    const harness = await open(
      [...RETRAIT, ...COMMANDE, 'resupply_templates:read'],
      '/comptoir/retrait',
    );
    expect(tabLabels(harness).some((label) => label.includes('Modèles'))).toBe(false);
  });

  it('cache « Nouvelle commande » à qui ne tient que le retrait', async () => {
    const harness = await open(RETRAIT, '/comptoir/retrait');
    expect(newOrderButton(harness)).toBeNull();
    expect(tabLabels(harness)).toHaveLength(2);
  });

  it('marque actif l’onglet de l’URL', async () => {
    const harness = await open([...RETRAIT, ...COMMANDE], '/comptoir/reassort');
    expect(activeLabel(harness)).toContain('Réassort');
  });

  it('nomme l’onglet du réassort d’après le point ouvert dans la bande', async () => {
    const harness = await open(RETRAIT, '/comptoir/reassort', [{ id: 'site_l', label: 'Labo' }]);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(activeLabel(harness)).toBe('Réassort Labo');
  });

  it('ne publie plus de rail secondaire', async () => {
    await open([...RETRAIT, ...COMMANDE], '/comptoir/retrait');
    expect(TestBed.inject(WorkspaceRailStore).rail()).toBeNull();
  });

  it('ouvre /comptoir sur le premier onglet permis', async () => {
    await open([...RETRAIT, ...COMMANDE], '/comptoir');
    expect(TestBed.inject(Router).url).toBe('/comptoir/retrait');
  });

  it('ouvre /comptoir sur la commande pro à qui ne tient qu’elle', async () => {
    await open(COMMANDE, '/comptoir');
    expect(TestBed.inject(Router).url).toBe('/comptoir/nouvelle-commande');
  });
});

/** Le texte des onglets de POINT de la bande (`fold-tabs`), pas ceux du comptoir. */
function pointTab(harness: RouterTestingHarness, label: string): HTMLElement | undefined {
  const el: HTMLElement = harness.fixture.nativeElement;
  return [...el.querySelectorAll<HTMLElement>('app-handover-masthead [role="tab"]')].find((tab) =>
    (tab.textContent ?? '').includes(label),
  );
}

describe('ComptoirWorkspacePage — la bande de tête', () => {
  it.each(['/comptoir/retrait', '/comptoir/reassort', '/comptoir/nouvelle-commande'])(
    'reste présente sur %s, onglets et retrait compris',
    async (url) => {
      const harness = await open([...RETRAIT, ...COMMANDE], url);
      const el: HTMLElement = harness.fixture.nativeElement;
      expect(el.querySelector('app-comptoir-masthead fold-view-nav')).not.toBeNull();
      expect(el.querySelector('app-comptoir-masthead app-handover-masthead')).not.toBeNull();
    },
  );

  it('🔴 sans le retrait, ne porte que les onglets — et n’appelle pas la file', async () => {
    // Le poste qui ne tient que la commande pro se prendrait un 403 à chaque
    // ouverture du comptoir si la bande lisait la file pour lui.
    const harness = await open(COMMANDE, '/comptoir/nouvelle-commande');
    const el: HTMLElement = harness.fixture.nativeElement;
    expect(el.querySelector('app-comptoir-masthead fold-view-nav')).not.toBeNull();
    expect(el.querySelector('app-handover-masthead')).toBeNull();
    expect(queue.days).toHaveLength(0);
  });

  it('garde le point choisi, sans relire la file, en changeant d’onglet', async () => {
    const harness = await open([...RETRAIT, ...COMMANDE], '/comptoir/retrait');
    pointTab(harness, 'Val Thorens')?.click();
    harness.detectChanges();
    expect(pointTab(harness, 'Val Thorens')?.getAttribute('aria-selected')).toBe('true');
    const reads = queue.days.length;

    await harness.navigateByUrl('/comptoir/reassort');
    harness.detectChanges();
    await harness.fixture.whenStable();

    expect(pointTab(harness, 'Val Thorens')?.getAttribute('aria-selected')).toBe('true');
    expect(queue.days).toHaveLength(reads);
  });
});
