import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  CustomerRequestStatus,
  CustomerRequestView,
  RequestKind,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { CustomerRequestsInbox } from '../customer-requests-inbox.store';
import { CustomerRequestsService } from '../customer-requests.service';
import { DemandesPage } from './demandes-page';

/**
 * La boîte des demandes : état et type au serveur, priorité filtrée à
 * l'écran sans retrier, compteur du menu, refus du serveur dit tel quel, et
 * `?demande=` cherché jusque dans les traitées.
 */

function request(
  id: string,
  over: Partial<Pick<CustomerRequestView, 'priority' | 'kind' | 'handledAt'>> = {},
): CustomerRequestView {
  const kind = over.kind ?? 'contact';
  return {
    id,
    kind,
    reasonId: 'rr_1',
    reasonLabel: 'Une question',
    priority: over.priority ?? 'medium',
    audience: 'b2b',
    authorName: 'Jeanne Martin',
    authorEmail: 'jeanne@example.fr',
    authorPhone: '',
    message: 'Bonjour',
    userId: 'u_1',
    companyId: null,
    receivedAt: '2026-10-09T08:00:00.000Z',
    handledAt: over.handledAt ?? null,
    handledBy: null,
    anonymizedAt: null,
    details:
      kind === 'contact'
        ? { kind: 'contact' }
        : { kind: 'order_problem', orderId: 'o_1', orderNumber: 'C-0001', photos: [] },
  };
}

class FakeRequests {
  readonly reads: { status: CustomerRequestStatus; kind: RequestKind | undefined }[] = [];
  readonly handled: string[] = [];
  refusal: unknown = null;
  pending: CustomerRequestView[] = [request('r1')];
  done: CustomerRequestView[] = [];

  list(status: CustomerRequestStatus, kind?: RequestKind): Promise<CustomerRequestView[]> {
    this.reads.push({ status, kind });
    const all = status === 'pending' ? this.pending : this.done;
    return Promise.resolve(kind === undefined ? all : all.filter((r) => r.kind === kind));
  }

  markHandled(id: string): Promise<void> {
    this.handled.push(id);
    if (this.refusal !== null) return Promise.reject(this.refusal);
    this.pending = this.pending.filter((r) => r.id !== id);
    return Promise.resolve();
  }

  photo(): Promise<Blob> {
    return Promise.resolve(new Blob());
  }
}

async function mount(
  api: FakeRequests,
  demande?: string,
  grants: readonly StaffPermission[] = ['b2b_contact:read', 'b2b_contact:write'],
): Promise<ComponentFixture<DemandesPage>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DemandesPage],
    providers: [
      provideRouter([]),
      { provide: CustomerRequestsService, useValue: api },
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => grants.includes(p) } },
      { provide: NotifyService, useValue: { success: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(DemandesPage);
  if (demande !== undefined) fixture.componentRef.setInput('demande', demande);
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<DemandesPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;
const ids = (fixture: ComponentFixture<DemandesPage>): string[] =>
  fixture.componentInstance['shown']().map((r) => r.id);

describe('DemandesPage', () => {
  it('à traiter, tous types : la liste donne le compteur du menu', async () => {
    const api = new FakeRequests();
    api.pending = [request('r1'), request('r2', { kind: 'order_problem' })];
    await mount(api);

    expect(api.reads).toEqual([{ status: 'pending', kind: undefined }]);
    expect(TestBed.inject(CustomerRequestsInbox).pendingCount()).toBe(2);
  });

  it('le type part au serveur, et une liste filtrée ne touche pas au compteur', async () => {
    const api = new FakeRequests();
    api.pending = [request('r1'), request('r2', { kind: 'order_problem' })];
    const fixture = await mount(api);
    fixture.componentInstance['selectKind']('order_problem');
    await fixture.whenStable();

    expect(api.reads.at(-1)).toEqual({ status: 'pending', kind: 'order_problem' });
    expect(ids(fixture)).toEqual(['r2']);
    expect(TestBed.inject(CustomerRequestsInbox).pendingCount()).toBe(2);
  });

  it('la priorité filtre à l’écran, dans l’ordre de l’API ; vide à part', async () => {
    const api = new FakeRequests();
    api.pending = [
      request('u1', { priority: 'urgent' }),
      request('m1'),
      request('u2', { priority: 'urgent' }),
    ];
    const fixture = await mount(api);
    fixture.componentInstance['selectPriority']('urgent');
    expect(ids(fixture)).toEqual(['u1', 'u2']);

    fixture.componentInstance['selectPriority']('low');
    fixture.detectChanges();
    expect(host(fixture).querySelector('[data-filtered-empty]')).not.toBeNull();
    expect(host(fixture).querySelector('[data-empty]')).toBeNull();
  });

  it('« Marquer traité » écrit, relit, et le compteur suit', async () => {
    const api = new FakeRequests();
    const fixture = await mount(api);
    host(fixture).querySelector<HTMLButtonElement>('button[data-handle]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.handled).toEqual(['r1']);
    expect(TestBed.inject(CustomerRequestsInbox).pendingCount()).toBe(0);
    expect(host(fixture).querySelector('[data-empty]')).not.toBeNull();
  });

  it('🔴 un second traitement refusé (409) affiche le message du serveur', async () => {
    const api = new FakeRequests();
    api.refusal = new HttpErrorResponse({
      status: 409,
      error: { message: 'Déjà traitée par Colette.' },
    });
    const fixture = await mount(api);
    await fixture.componentInstance['markHandled'](request('r1'));
    fixture.detectChanges();

    expect(host(fixture).querySelector('[data-refusal]')?.textContent).toContain(
      'Déjà traitée par Colette.',
    );
  });

  it('?demande= absente des demandes à traiter : on la cherche dans les traitées', async () => {
    const api = new FakeRequests();
    api.done = [request('old', { handledAt: '2026-10-09T09:00:00.000Z' })];
    const fixture = await mount(api, 'old');

    expect(fixture.componentInstance['status']()).toBe('handled');
    expect(host(fixture).querySelector('[data-request="old"]')).not.toBeNull();
  });

  it('sans le droit d’écrire : pas de « Marquer traité »', async () => {
    const fixture = await mount(new FakeRequests(), undefined, ['b2b_contact:read']);
    expect(host(fixture).querySelector('button[data-handle]')).toBeNull();
  });
});
