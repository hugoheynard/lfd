import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { CustomerRequestsService } from '../../b2b/demandes/customer-requests.service';
import { PimCapabilitiesStore } from '../../pim/capabilities/pim-capabilities.store';
import { WorkspaceRailStore } from '../../shared/workspace-rail/workspace-rail.store';
import { comptoirLanding } from '../comptoir-landing';
import { ComptoirTabs } from '../comptoir-tabs/comptoir-tabs';
import { ComptoirWorkspacePage } from './comptoir-workspace-page';

@Component({
  selector: 'app-blank',
  imports: [ComptoirTabs],
  template: '<app-comptoir-tabs />',
})
class Blank {}

const RETRAIT: readonly StaffPermission[] = ['handover_counter:read'];
const COMMANDE: readonly StaffPermission[] = ['b2b_counter:read', 'b2b_place_order:write'];

async function open(
  granted: readonly StaffPermission[],
  url: string,
): Promise<RouterTestingHarness> {
  TestBed.resetTestingModule();
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
      { provide: PimCapabilitiesStore, useValue: { publication: () => true } },
      { provide: CustomerRequestsService, useValue: {} },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  // `routerLinkActive` se pose après la fin de navigation.
  harness.detectChanges();
  await harness.fixture.whenStable();
  return harness;
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
  it('montre les trois onglets, dans l’ordre voulu, à qui tient tout', async () => {
    const harness = await open([...RETRAIT, ...COMMANDE], '/comptoir/retrait');
    const labels = tabLabels(harness);
    expect(labels).toHaveLength(3);
    expect(labels[0]).toContain('Nouvelle commande pro');
    expect(labels[1]).toContain('Retrait boutique');
    expect(labels[2]).toContain('Réassort boutique');
  });

  it('cache la commande pro à qui ne tient que le retrait', async () => {
    const harness = await open(RETRAIT, '/comptoir/retrait');
    const labels = tabLabels(harness);
    expect(labels.some((label) => label.includes('Nouvelle commande'))).toBe(false);
    expect(labels).toHaveLength(2);
  });

  it('marque actif l’onglet de l’URL', async () => {
    const harness = await open([...RETRAIT, ...COMMANDE], '/comptoir/reassort');
    expect(activeLabel(harness)).toContain('Réassort boutique');
  });

  it('ne publie plus de rail secondaire', async () => {
    await open([...RETRAIT, ...COMMANDE], '/comptoir/retrait');
    expect(TestBed.inject(WorkspaceRailStore).rail()).toBeNull();
  });

  it('ouvre /comptoir sur le premier onglet permis', async () => {
    await open([...RETRAIT, ...COMMANDE], '/comptoir');
    expect(TestBed.inject(Router).url).toBe('/comptoir/nouvelle-commande');
  });

  it('ouvre /comptoir sur le retrait à qui n’a pas la commande pro', async () => {
    await open(RETRAIT, '/comptoir');
    expect(TestBed.inject(Router).url).toBe('/comptoir/retrait');
  });
});
