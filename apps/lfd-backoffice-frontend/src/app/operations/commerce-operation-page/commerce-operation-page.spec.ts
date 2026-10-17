import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CommerceOperationView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { CatalogueService } from '../../b2b/catalogue/catalogue.service';
import { NotifyService } from '../../notify.service';
import { commerceOperation } from '../commerce-operation.testing';
import { CommerceOperationsService } from '../commerce-operations.service';
import { CommerceOperationPage } from './commerce-operation-page';

const WRITER: readonly StaffPermission[] = ['lfc_operations:read', 'lfc_operations:write'];

class FakeOperations {
  row: CommerceOperationView = commerceOperation();
  failure: unknown = null;
  refusal: unknown = null;
  readonly writes: string[] = [];

  async get(): Promise<CommerceOperationView> {
    if (this.failure !== null) {
      throw this.failure;
    }
    return this.row;
  }

  async setVisibility(_key: string, hidden: boolean): Promise<unknown> {
    return this.write(`visibility:${String(hidden)}`, { hidden });
  }

  async setAudience(_key: string, audience: CommerceOperationView['audience']): Promise<unknown> {
    return this.write(`audience:${audience}`, { audience });
  }

  async archive(): Promise<unknown> {
    return this.write('archive', { archivedAt: '2026-10-16T10:00:00.000Z' });
  }

  private async write(what: string, patch: Partial<CommerceOperationView>): Promise<unknown> {
    if (this.refusal !== null) {
      throw this.refusal;
    }
    this.writes.push(what);
    this.row = { ...this.row, ...patch };
    return { key: this.row.key };
  }
}

async function render(api: FakeOperations, granted: readonly StaffPermission[] = WRITER) {
  const notified: string[] = [];
  TestBed.configureTestingModule({
    imports: [CommerceOperationPage],
    providers: [
      provideRouter([]),
      { provide: CommerceOperationsService, useValue: api },
      { provide: CatalogueService, useValue: { list: async () => [] } },
      {
        provide: NotifyService,
        useValue: { success: (message: string) => notified.push(message), error: () => undefined },
      },
      {
        provide: PermissionsStore,
        useValue: {
          can: (permission: StaffPermission) => granted.includes(permission),
          permissions: signal(granted),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CommerceOperationPage);
  fixture.componentRef.setInput('key', 'noel-2026');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return {
    fixture,
    page: fixture.componentInstance,
    root: fixture.nativeElement as HTMLElement,
    notified,
  };
}

describe('CommerceOperationPage', () => {
  it("dit le refus du serveur quand l'opération est illisible", async () => {
    const api = new FakeOperations();
    api.failure = { status: 404, error: { code: 'operations.not_found', message: 'Introuvable.' } };
    const { root } = await render(api);
    expect(root.querySelector('fold-empty-state')?.textContent).toContain('Introuvable.');
  });

  it("pose une carte par sujet, et la zone d'archivage", async () => {
    const { root } = await render(new FakeOperations());
    expect(root.querySelector('app-commerce-presentation-card')).not.toBeNull();
    expect(root.querySelector('app-commerce-schedule-card')).not.toBeNull();
    expect(root.querySelector('app-commerce-selection-card')).not.toBeNull();
    expect(root.querySelector('fold-danger-zone')).not.toBeNull();
    expect(root.textContent).toContain('Masquer');
  });

  it('masque, annonce et relit', async () => {
    const api = new FakeOperations();
    const { page, notified } = await render(api);
    await page['toggleVisibility'](true);
    expect(api.writes).toEqual(['visibility:true']);
    expect(notified).toEqual(['Opération masquée.']);
    expect(page['operation']()?.hidden).toBe(true);
  });

  it('un refus reste sous son geste, tel que le serveur le dit', async () => {
    const api = new FakeOperations();
    const { page } = await render(api);
    api.refusal = { status: 409, error: { code: 'operations.archived', message: 'Archivée.' } };
    page['audience'].set('pro');
    await page['saveAudience']();
    expect(page['refusal']('audience')).toBe('Archivée.');
    expect(page['refusal']('archive')).toBeNull();
  });

  it("sans droit d'écrire, tout se lit et rien ne s'écrit", async () => {
    const api = new FakeOperations();
    const { page, root } = await render(api, ['lfc_operations:read']);
    expect(root.textContent).toContain('Lecture seule');
    expect(root.querySelector('fold-danger-zone')).toBeNull();
    await page['archive']();
    expect(api.writes).toEqual([]);
  });

  it('une copie pas encore reprise ne se modifie pas', async () => {
    const api = new FakeOperations();
    api.row = commerceOperation({ heldAtCommerce: false });
    const { page, root } = await render(api);
    expect(root.textContent).toContain('pas encore reprise');
    expect(page['locked']()).toBe(true);
  });

  it('archivée, elle se lit et la zone disparaît', async () => {
    const api = new FakeOperations();
    const { page, fixture, root } = await render(api);
    await page['archive']();
    fixture.detectChanges();
    expect(api.writes).toEqual(['archive']);
    expect(root.querySelector('fold-danger-zone')).toBeNull();
    expect(root.textContent).toContain('Archivée le');
  });
});
