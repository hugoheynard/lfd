import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  CompanyMemberRole,
  SetSubAccountNoticeRulePayload,
  StaffPermission,
  SubAccountNoticeKind,
  SubAccountNoticeRuleView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { AdminCompanyHierarchyService } from '../../comptes-clients/admin-company-hierarchy.service';
import { SubAccountNoticesCard } from './sub-account-notices-card';

const ROLES: readonly CompanyMemberRole[] = ['owner', 'admin', 'orders', 'billing'];
const KINDS: readonly SubAccountNoticeKind[] = [
  'order_placed',
  'order_cancelled',
  'payment_failed',
  'subscription_changed',
  'delivery_address_changed',
  'contact_changed',
  'bank_account_changed',
  'order_problem_reported',
];

/** Le tableau tel que le serveur le rend : tout au défaut, `billing` ne reçoit pas les commandes. */
function defaults(): SubAccountNoticeRuleView[] {
  return KINDS.flatMap((kind) =>
    ROLES.map((role) => ({ kind, role, enabled: role !== 'billing', atDefault: true })),
  );
}

interface Wire {
  rules: SubAccountNoticeRuleView[];
  readonly calls: string[];
  refuse: HttpErrorResponse | null;
  failRead: boolean;
}

async function boot(
  granted: readonly StaffPermission[] = ['b2b_companies:write'],
  setup: (wire: Wire) => void = () => undefined,
): Promise<{ fixture: ComponentFixture<SubAccountNoticesCard>; wire: Wire }> {
  const wire: Wire = { rules: defaults(), calls: [], refuse: null, failRead: false };
  setup(wire);
  const settle = (): Promise<void> =>
    wire.refuse === null ? Promise.resolve() : Promise.reject(wire.refuse);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => granted.includes(p) } },
      {
        provide: AdminCompanyHierarchyService,
        useValue: {
          subAccountNotices: (id: string): Promise<readonly SubAccountNoticeRuleView[]> => {
            wire.calls.push(`get ${id}`);
            return wire.failRead
              ? Promise.reject(new HttpErrorResponse({ status: 500 }))
              : Promise.resolve(wire.rules);
          },
          setSubAccountNotice: (id: string, p: SetSubAccountNoticeRulePayload): Promise<void> => {
            wire.calls.push(`put ${id} ${p.kind} ${p.role} ${String(p.enabled)}`);
            return settle();
          },
          resetSubAccountNotices: (id: string): Promise<void> => {
            wire.calls.push(`reset ${id}`);
            return settle();
          },
        } satisfies Partial<Record<keyof AdminCompanyHierarchyService, unknown>>,
      },
    ],
  });
  const fixture = TestBed.createComponent(SubAccountNoticesCard);
  fixture.componentRef.setInput('companyId', 'p1');
  fixture.componentRef.setInput('principalName', 'Alpes Chalets');
  await stable(fixture);
  wire.calls.length = 0;
  return { fixture, wire };
}

async function stable(fixture: ComponentFixture<SubAccountNoticesCard>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function host(fixture: ComponentFixture<SubAccountNoticesCard>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function toggle(
  fixture: ComponentFixture<SubAccountNoticesCard>,
  kind: SubAccountNoticeKind,
  role: CompanyMemberRole,
): HTMLButtonElement {
  const found = host(fixture).querySelector<HTMLButtonElement>(
    `[data-notice-cell="${kind}:${role}"] [data-notice-toggle]`,
  );
  if (found === null) {
    throw new Error(`bouton ${kind}:${role} introuvable`);
  }
  return found;
}

describe('SubAccountNoticesCard', () => {
  it('dit l’état de chaque cellule et la marque du défaut', async () => {
    const { fixture } = await boot();
    const cell = host(fixture).querySelector('[data-notice-cell="order_placed:billing"]');
    expect(cell?.textContent).toContain('Ne reçoit pas');
    expect(cell?.querySelector('[data-notice-default]')).not.toBeNull();
    expect(toggle(fixture, 'order_placed', 'owner').textContent).toContain('Désactiver');
    expect(host(fixture).querySelector('[data-notices-reset]')).toBeNull();
  });

  it('n’affiche que les actions dont le mail existe, dans l’ordre du plan', async () => {
    const { fixture } = await boot();
    const kinds = new Set(
      Array.from(host(fixture).querySelectorAll('[data-notice-cell]')).map(
        (cell) => cell.getAttribute('data-notice-cell')?.split(':')[0],
      ),
    );
    expect([...kinds]).toEqual([
      'order_placed',
      'order_cancelled',
      'payment_failed',
      'delivery_address_changed',
      'contact_changed',
      'order_problem_reported',
    ]);
  });

  it('confirme en disant la conséquence, puis règle la cellule et relit', async () => {
    const { fixture, wire } = await boot();
    toggle(fixture, 'order_placed', 'billing').click();
    await stable(fixture);
    expect(wire.calls).toEqual([]);
    const pending = fixture.componentInstance['pending']();
    expect(pending === null ? '' : fixture.componentInstance['pendingMessage'](pending)).toBe(
      'Les membres Facturation de Alpes Chalets recevront un mail à chaque commande passée par ses sous-comptes.',
    );
    await fixture.componentInstance['confirmPending']();
    expect(wire.calls).toEqual(['put p1 order_placed billing true', 'get p1']);
  });

  it('propose « Revenir au défaut » dès qu’une dérogation existe, après confirmation', async () => {
    const { fixture, wire } = await boot(['b2b_companies:write'], (w) => {
      w.rules = w.rules.map((rule) =>
        rule.kind === 'payment_failed' && rule.role === 'admin'
          ? { ...rule, enabled: false, atDefault: false }
          : rule,
      );
    });
    const reset = host(fixture).querySelector<HTMLButtonElement>('[data-notices-reset]');
    expect(reset).not.toBeNull();
    reset?.click();
    await stable(fixture);
    expect(host(fixture).querySelector('[data-notices-reset-confirm]')).not.toBeNull();
    expect(wire.calls).toEqual([]);
    await fixture.componentInstance['confirmReset']();
    expect(wire.calls).toEqual(['reset p1', 'get p1']);
  });

  it('dit le refus en nommant l’action, et relit l’enregistré', async () => {
    const { fixture, wire } = await boot();
    wire.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'Ce compte n’est pas un principal.' },
    });
    toggle(fixture, 'order_cancelled', 'orders').click();
    await stable(fixture);
    await fixture.componentInstance['confirmPending']();
    await stable(fixture);
    const refusal = host(fixture).querySelector('[data-notice-refusal]');
    expect(refusal?.textContent).toContain('Commande annulée ou abandonnée');
    expect(wire.calls).toContain('get p1');
    expect(toggle(fixture, 'order_cancelled', 'orders').textContent).toContain('Désactiver');
  });

  it('laisse le tableau en lecture sans le droit d’écriture', async () => {
    const { fixture } = await boot([]);
    expect(toggle(fixture, 'order_placed', 'owner').disabled).toBe(true);
  });

  it('dit l’échec de lecture par un état d’erreur', async () => {
    const { fixture } = await boot(['b2b_companies:write'], (w) => {
      w.failRead = true;
    });
    expect(host(fixture).querySelector('fold-empty-state')?.textContent).toContain(
      'Impossible de lire',
    );
  });
});
