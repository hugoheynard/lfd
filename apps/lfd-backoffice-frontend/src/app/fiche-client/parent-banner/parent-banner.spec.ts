import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import type { FollowedAspectView } from '@lfd/contracts';
import { FoldInlineConfirmComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { AdminCompanyHierarchyService } from '../../comptes-clients/admin-company-hierarchy.service';
import { NotifyService } from '../../notify.service';
import { ParentBanner } from './parent-banner';

interface Wire {
  readonly calls: string[];
  refuse: HttpErrorResponse | null;
  detached: number;
}

function boot(follows: readonly FollowedAspectView[]): {
  fixture: ComponentFixture<ParentBanner>;
  wire: Wire;
} {
  const wire: Wire = { calls: [], refuse: null, detached: 0 };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: NotifyService, useValue: { success: () => undefined } },
      {
        provide: AdminCompanyHierarchyService,
        useValue: {
          detach: (id: string): Promise<void> => {
            wire.calls.push(id);
            return wire.refuse === null ? Promise.resolve() : Promise.reject(wire.refuse);
          },
        } satisfies Partial<Record<keyof AdminCompanyHierarchyService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(ParentBanner);
  fixture.componentRef.setInput('companyId', 'child_1');
  fixture.componentRef.setInput('parent', {
    id: 'parent_1',
    enseigne: 'Club Med',
    status: 'active',
  });
  fixture.componentRef.setInput('follows', follows);
  fixture.componentInstance.detached.subscribe(() => (wire.detached += 1));
  fixture.detectChanges();
  return { fixture, wire };
}

function host(fixture: ComponentFixture<ParentBanner>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function askToDetach(fixture: ComponentFixture<ParentBanner>): FoldInlineConfirmComponent {
  host(fixture).querySelector<HTMLButtonElement>('[data-detach]')?.click();
  fixture.detectChanges();
  return fixture.debugElement.query(By.directive(FoldInlineConfirmComponent))
    .componentInstance as FoldInlineConfirmComponent;
}

async function settle(fixture: ComponentFixture<ParentBanner>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('ParentBanner', () => {
  it('nomme le principal et mène à sa fiche', () => {
    const { fixture } = boot([]);
    const link = host(fixture).querySelector('[data-parent-banner] a');
    expect(link?.textContent).toContain('Club Med');
    expect(link?.getAttribute('href')).toBe('/comptes-clients/parent_1');
  });

  it('dit « Site de » quand la facturation est suivie, « Entité rattachée à » sinon', () => {
    const site = boot([{ aspect: 'billing', since: '2026-03-01T00:00:00.000Z' }]).fixture;
    expect(host(site).querySelector('[data-parent-banner]')?.textContent).toContain('Site de');
    const entity = boot([]).fixture;
    expect(host(entity).querySelector('[data-parent-banner]')?.textContent).toContain(
      'Entité rattachée à',
    );
  });

  it('la confirmation dit que toutes les périodes de suivi se ferment, et lesquelles', () => {
    const { fixture } = boot([
      { aspect: 'billing', since: '2026-03-01T00:00:00.000Z' },
      { aspect: 'pricing', since: '2026-03-01T00:00:00.000Z' },
    ]);
    const confirm = askToDetach(fixture);
    expect(confirm.message()).toContain('Toutes les périodes de suivi se ferment');
    expect(confirm.message()).toContain('facturation, tarif');
  });

  it('confirmer détache, puis prévient la fiche', async () => {
    const { fixture, wire } = boot([]);
    askToDetach(fixture).confirmed.emit('');
    await settle(fixture);

    expect(wire.calls).toEqual(['child_1']);
    expect(wire.detached).toBe(1);
  });

  it('un refus s’affiche tel quel', async () => {
    const { fixture, wire } = boot([]);
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'Ce compte n’est le sous-compte de personne.' },
    });
    askToDetach(fixture).confirmed.emit('');
    await settle(fixture);

    expect(host(fixture).querySelector('[data-detach-refusal]')?.textContent).toContain(
      'Ce compte n’est le sous-compte de personne.',
    );
    expect(wire.detached).toBe(0);
  });
});
