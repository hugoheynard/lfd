import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CompanyFollowAspect, FollowedAspectView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminCompanyHierarchyService } from '../../comptes-clients/admin-company-hierarchy.service';
import { FollowParentToggle } from './follow-parent-toggle';

interface Wire {
  readonly calls: string[];
  refuse: HttpErrorResponse | null;
  readonly emitted: boolean[];
}

async function boot(
  aspect: CompanyFollowAspect,
  follows: readonly FollowedAspectView[],
  granted: readonly StaffPermission[] = [],
): Promise<{ fixture: ComponentFixture<FollowParentToggle>; wire: Wire }> {
  const wire: Wire = { calls: [], refuse: null, emitted: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => granted.includes(p) } },
      {
        provide: AdminCompanyHierarchyService,
        useValue: {
          setFollowing: (id: string, a: CompanyFollowAspect, on: boolean): Promise<void> => {
            wire.calls.push(`${id} ${a} ${String(on)}`);
            const refuse = wire.refuse;
            return new Promise((resolve, reject) =>
              setTimeout(() => (refuse === null ? resolve() : reject(refuse))),
            );
          },
        } satisfies Partial<Record<keyof AdminCompanyHierarchyService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(FollowParentToggle);
  fixture.componentRef.setInput('companyId', 'child_1');
  fixture.componentRef.setInput('aspect', aspect);
  fixture.componentRef.setInput('parent', {
    id: 'parent_1',
    enseigne: 'Chalets du Lac',
    status: 'active',
  });
  fixture.componentRef.setInput('follows', follows);
  fixture.componentInstance.changed.subscribe((value) => wire.emitted.push(value));
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, wire };
}

function box(fixture: ComponentFixture<FollowParentToggle>): HTMLInputElement {
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
    '[data-follow-parent] input[type="checkbox"]',
  );
  if (input === null) {
    throw new Error('case introuvable');
  }
  return input;
}

function text(fixture: ComponentFixture<FollowParentToggle>, selector: string): string {
  return (fixture.nativeElement as HTMLElement).querySelector(selector)?.textContent ?? '';
}

async function settle(fixture: ComponentFixture<FollowParentToggle>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('FollowParentToggle', () => {
  it('suivi en cours : cochée, et dit de qui et depuis quand', async () => {
    const since = new Date(2026, 2, 12, 12).toISOString();
    const { fixture } = await boot('billing', [{ aspect: 'billing', since }]);

    expect(box(fixture).checked).toBe(true);
    expect(text(fixture, '[data-follow-since]')).toContain('Hérité de');
    expect(text(fixture, '[data-follow-since]')).toContain('Chalets du Lac');
    expect(text(fixture, '[data-follow-since]')).toContain('12/03/2026');
  });

  it('cocher la facturation écrit, puis prévient la fiche', async () => {
    const { fixture, wire } = await boot('billing', []);
    expect(box(fixture).checked).toBe(false);

    box(fixture).click();
    await settle(fixture);

    expect(wire.calls).toEqual(['child_1 billing true']);
    expect(wire.emitted).toEqual([true]);
  });

  it('le tarif ne se règle pas sans le droit de tarification (Q9)', async () => {
    const { fixture, wire } = await boot('pricing', [], ['b2b_pricing:read']);

    expect(box(fixture).disabled).toBe(true);
    expect(wire.calls).toEqual([]);
  });

  it('le tarif se règle avec b2b_pricing:write', async () => {
    const { fixture, wire } = await boot('pricing', [], ['b2b_pricing:write']);

    box(fixture).click();
    await settle(fixture);

    expect(wire.calls).toEqual(['child_1 pricing true']);
  });

  it('un refus s’affiche tel quel, et la case revient à ce qui est enregistré', async () => {
    const { fixture, wire } = await boot('billing', []);
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'Le compte principal Chalets du Lac n’est pas actif.' },
    });

    box(fixture).click();
    await settle(fixture);

    expect(text(fixture, '[data-follow-refusal]')).toContain(
      'Le compte principal Chalets du Lac n’est pas actif.',
    );
    expect(box(fixture).checked).toBe(false);
    expect(wire.emitted).toEqual([]);
  });
});
