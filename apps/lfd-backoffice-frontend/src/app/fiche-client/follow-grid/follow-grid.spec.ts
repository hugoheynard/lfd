import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CompanyFollowAspect, StaffPermission, SubAccountView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminCompanyHierarchyService } from '../../comptes-clients/admin-company-hierarchy.service';
import { NotifyService } from '../../notify.service';
import { FollowGrid } from './follow-grid';

const SINCE = '2026-09-10T08:00:00.000Z';

const CHALET: SubAccountView = {
  id: 'c1',
  enseigne: 'Chalet Edelweiss',
  city: "Val d'Isère",
  status: 'active',
  followedAspects: ['billing'],
  follows: [{ aspect: 'billing', since: SINCE }],
};

interface Wire {
  readonly calls: string[];
  refuse: HttpErrorResponse | null;
  changed: number;
}

async function boot(
  granted: readonly StaffPermission[] = [],
): Promise<{ fixture: ComponentFixture<FollowGrid>; wire: Wire }> {
  const wire: Wire = { calls: [], refuse: null, changed: 0 };
  const settle = (): Promise<void> =>
    wire.refuse === null ? Promise.resolve() : Promise.reject(wire.refuse);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => granted.includes(p) } },
      { provide: NotifyService, useValue: { success: (): void => undefined } },
      {
        provide: AdminCompanyHierarchyService,
        useValue: {
          setFollowing: (id: string, aspect: CompanyFollowAspect, on: boolean): Promise<void> => {
            wire.calls.push(`follow ${id} ${aspect} ${String(on)}`);
            return settle();
          },
          detach: (id: string): Promise<void> => {
            wire.calls.push(`detach ${id}`);
            return settle();
          },
        } satisfies Partial<Record<keyof AdminCompanyHierarchyService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(FollowGrid);
  fixture.componentRef.setInput('subAccounts', [CHALET]);
  fixture.componentRef.setInput('parentName', 'Alpes Chalets');
  fixture.componentInstance.changed.subscribe(() => (wire.changed += 1));
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, wire };
}

function button(
  fixture: ComponentFixture<FollowGrid>,
  aspect: CompanyFollowAspect,
): HTMLButtonElement {
  const found = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
    `[data-follow-cell="c1:${aspect}"] [data-follow-toggle]`,
  );
  if (found === null) {
    throw new Error(`bouton ${aspect} introuvable`);
  }
  return found;
}

async function click(fixture: ComponentFixture<FollowGrid>, target: HTMLElement): Promise<void> {
  target.click();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('FollowGrid', () => {
  it('dit l’état de chaque suivi et propose le geste inverse', async () => {
    const { fixture } = await boot();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-follow-cell="c1:billing"]')?.textContent).toContain(
      'Actif depuis le 10/09/2026',
    );
    expect(button(fixture, 'billing').textContent).toContain('Désactiver');
    expect(button(fixture, 'contacts').textContent).toContain('Activer');
  });

  it('écrit sous la ligne ce que fait le sous-compte, aspect par aspect', async () => {
    const { fixture } = await boot();
    const summary = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-capabilities="c1"]',
    );
    expect(summary?.textContent).toContain(
      'les commandes de ce sous-compte sont facturées et prélevées au compte principal Alpes Chalets',
    );
    expect(summary?.textContent).toContain('ses commandes suivent ses propres prix');
  });

  it('confirme en disant les conséquences, puis règle par la route du sous-compte', async () => {
    const { fixture, wire } = await boot();
    await click(fixture, button(fixture, 'billing'));
    expect(wire.calls).toEqual([]);
    const pending = fixture.componentInstance['pending']();
    expect(pending).not.toBeNull();
    if (pending !== null) {
      expect(fixture.componentInstance['pendingMessage'](pending)).toContain(
        'redevient son propre payeur',
      );
    }

    await fixture.componentInstance['confirmPending']();
    expect(wire.calls).toEqual(['follow c1 billing false']);
    expect(wire.changed).toBe(1);
  });

  it('dit honnêtement que les contacts ne sont encore combinés nulle part', async () => {
    const { fixture } = await boot();
    await click(fixture, button(fixture, 'contacts'));
    const pending = fixture.componentInstance['pending']();
    expect(pending === null ? '' : fixture.componentInstance['pendingMessage'](pending)).toContain(
      'aucun écran ne combine encore',
    );
  });

  it('laisse le Tarif en lecture sans le droit de tarification', async () => {
    const { fixture } = await boot();
    expect(button(fixture, 'pricing').disabled).toBe(true);
    const { fixture: priced } = await boot(['b2b_pricing:write']);
    expect(button(priced, 'pricing').disabled).toBe(false);
  });

  it('dit le refus du serveur en nommant le site', async () => {
    const { fixture, wire } = await boot();
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'Le compte principal est en attente.' },
    });
    await click(fixture, button(fixture, 'contacts'));
    await fixture.componentInstance['confirmPending']();
    fixture.detectChanges();
    const refusal = (fixture.nativeElement as HTMLElement).querySelector('[data-follow-refusal]');
    expect(refusal?.textContent).toContain('Chalet Edelweiss');
  });

  it('détache après confirmation, en disant les suivis qui se ferment', async () => {
    const { fixture, wire } = await boot();
    const host = fixture.nativeElement as HTMLElement;
    const button = host.querySelector<HTMLButtonElement>('[data-detach="c1"]');
    if (button === null) {
      throw new Error('bouton Détacher introuvable');
    }
    await click(fixture, button);
    expect(wire.calls).toEqual([]);
    expect(host.querySelector('[data-detach-confirm]')).not.toBeNull();
    expect(fixture.componentInstance['confirmMessage'](CHALET)).toContain('facturation');

    await fixture.componentInstance['detach'](CHALET);
    expect(wire.calls).toEqual(['detach c1']);
    expect(wire.changed).toBe(1);
  });
});
