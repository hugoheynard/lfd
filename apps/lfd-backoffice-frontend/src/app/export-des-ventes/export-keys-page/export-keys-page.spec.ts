import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { ExportReaderKeyView, StaffPermission } from '@lfd/contracts';
import { FoldPanelHostService, provideFoldInlineConfirmLabels } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { ExportKeysService } from '../export-keys.service';
import { ExportKeysPage } from './export-keys-page';

const DAY = 86_400_000;
const iso = (offsetDays: number): string => new Date(Date.now() + offsetDays * DAY).toISOString();

function key(overrides: Partial<ExportReaderKeyView>): ExportReaderKeyView {
  return {
    id: 'k1',
    label: 'Direction',
    createdAt: iso(-10),
    createdByStaffId: 'staff_1',
    expiresAt: iso(300),
    revokedAt: null,
    revokedByStaffId: null,
    allowedIps: [],
    ...overrides,
  };
}

interface Wire {
  keys: readonly ExportReaderKeyView[];
  failList: boolean;
  revokes: string[];
}

let wire: Wire;

async function boot(
  keys: readonly ExportReaderKeyView[],
  granted: readonly StaffPermission[] = ['exports:read', 'exports:write'],
  failList = false,
): Promise<ComponentFixture<ExportKeysPage>> {
  wire = { keys, failList, revokes: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ExportKeysPage],
    providers: [
      {
        provide: ExportKeysService,
        useValue: {
          list: () =>
            wire.failList
              ? Promise.reject(new HttpErrorResponse({ status: 500 }))
              : Promise.resolve(wire.keys),
          revoke: (id: string) => {
            wire.revokes.push(id);
            wire.keys = wire.keys.map((k) => (k.id === id ? { ...k, revokedAt: iso(0) } : k));
            return Promise.resolve();
          },
        } satisfies Pick<ExportKeysService, 'list' | 'revoke'>,
      },
      {
        provide: PermissionsStore,
        useValue: {
          can: (permission: StaffPermission) => granted.includes(permission),
          loaded: signal(true),
        },
      },
      { provide: NotifyService, useValue: { success: () => undefined } },
      provideFoldInlineConfirmLabels({ confirm: 'Confirmer', cancel: 'Annuler' }),
      { provide: FoldPanelHostService, useValue: { open: () => ({ closed: Promise.resolve() }) } },
    ],
  });
  const fixture = TestBed.createComponent(ExportKeysPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<ExportKeysPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('ExportKeysPage', () => {
  it('liste chaque clé avec ses adresses et son état', async () => {
    const fixture = await boot([
      key({ id: 'active', allowedIps: ['203.0.113.7'] }),
      key({ id: 'expired', label: 'Ancienne', expiresAt: iso(-1) }),
      key({ id: 'revoked', label: 'Fuite', revokedAt: iso(-2), revokedByStaffId: 'staff_2' }),
    ]);
    const text = host(fixture).textContent ?? '';
    expect(text).toContain('203.0.113.7');
    expect(text).toContain('Toute adresse');
    expect(text).toContain('Active');
    expect(text).toContain('Expirée');
    expect(text).toContain('Révoquée le');
    // Les auteurs ne sont pas servis : seul leur identifiant l'est, et il ne s'affiche pas.
    expect(text).not.toContain('staff_');
  });

  it('ne propose la révocation que sur une clé active, et à qui peut écrire', async () => {
    const fixture = await boot([key({ id: 'a' }), key({ id: 'b', expiresAt: iso(-1) })]);
    expect(host(fixture).querySelector('[data-revoke="a"]')).not.toBeNull();
    expect(host(fixture).querySelector('[data-revoke="b"]')).toBeNull();
    expect(host(fixture).querySelector('[data-issue]')).not.toBeNull();

    const reader = await boot([key({ id: 'a' })], ['exports:read']);
    expect(host(reader).querySelector('[data-revoke]')).toBeNull();
    expect(host(reader).querySelector('[data-issue]')).toBeNull();
  });

  it('révoque après confirmation, qui dit que l’effet est immédiat', async () => {
    const fixture = await boot([key({ id: 'a' })]);
    const confirm = host(fixture).querySelector('[data-revoke="a"]');
    confirm?.querySelector<HTMLButtonElement>('button')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(wire.revokes).toEqual([]);
    expect(confirm?.textContent).toContain('L’effet est immédiat');

    const buttons = [...(confirm?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    buttons.find((button) => button.textContent?.trim() === 'Confirmer')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(wire.revokes).toEqual(['a']);
    expect(host(fixture).textContent).toContain('Révoquée le');
  });

  it('dit l’échec de chargement plutôt qu’une liste vide', async () => {
    const fixture = await boot([], ['exports:read'], true);
    expect(host(fixture).textContent).toContain('Impossible de charger les clés d’export');
    expect(host(fixture).querySelector('[data-empty]')).toBeNull();
  });
});
