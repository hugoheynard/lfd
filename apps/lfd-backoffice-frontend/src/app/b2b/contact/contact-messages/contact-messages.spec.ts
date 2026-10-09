import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ContactMessageStatus, ContactMessageView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { ContactService } from '../contact.service';
import { ContactInbox } from '../contact-inbox.store';
import { ContactMessages } from './contact-messages';

/** Les messages reçus : deux onglets, « Marquer traité », et le refus du serveur dit tel quel. */

const PENDING: ContactMessageView = {
  id: 'cm_1',
  subjectId: 'cs_1',
  subjectLabel: 'Ma commande',
  audience: 'b2b',
  priority: 'medium',
  authorName: 'Jeanne Martin',
  authorEmail: 'jeanne@example.fr',
  authorPhone: '',
  message: 'Bonjour,\nma commande est-elle partie ?',
  userId: 'u_1',
  companyId: 'co_1',
  receivedAt: '2026-10-09T08:00:00.000Z',
  handledAt: null,
  handledBy: null,
  anonymizedAt: null,
};

class FakeContact {
  readonly reads: ContactMessageStatus[] = [];
  readonly handled: string[] = [];
  refusal: unknown = null;
  pending: ContactMessageView[] = [PENDING];

  messages(status: ContactMessageStatus): Promise<ContactMessageView[]> {
    this.reads.push(status);
    return Promise.resolve(status === 'pending' ? this.pending : []);
  }

  markHandled(id: string): Promise<void> {
    this.handled.push(id);
    if (this.refusal !== null) return Promise.reject(this.refusal);
    this.pending = [];
    return Promise.resolve();
  }
}

async function mount(
  api: FakeContact,
  grants: readonly StaffPermission[] = ['b2b_contact:read', 'b2b_contact:write'],
): Promise<ComponentFixture<ContactMessages>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ContactMessages],
    providers: [
      provideRouter([]),
      { provide: ContactService, useValue: api },
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => grants.includes(p) } },
      { provide: NotifyService, useValue: { success: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(ContactMessages);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<ContactMessages>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('ContactMessages', () => {
  it('montre le détail d’un message à traiter', async () => {
    const fixture = await mount(new FakeContact());
    const card = host(fixture).querySelector('[data-message]');

    expect(card?.textContent).toContain('Ma commande');
    expect(card?.textContent).toContain('Jeanne Martin');
    expect(card?.querySelector('[data-priority]')?.textContent).toContain('Moyenne');
    expect(card?.querySelector('a[href="mailto:jeanne@example.fr"]')).not.toBeNull();
    expect(card?.querySelector('[data-text]')?.textContent).toContain(
      'ma commande est-elle partie',
    );
    expect(card?.querySelector('[data-company]')).not.toBeNull();
  });

  it('la liste à traiter donne le compteur de l’onglet', async () => {
    await mount(new FakeContact());
    expect(TestBed.inject(ContactInbox).pendingCount()).toBe(1);
  });

  it('« Marquer traité » écrit puis relit : le message quitte la liste', async () => {
    const api = new FakeContact();
    const fixture = await mount(api);
    host(fixture).querySelector<HTMLButtonElement>('button[data-handle]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.handled).toEqual(['cm_1']);
    // Le compteur de l'onglet suit : relu après le geste, et masqué à zéro.
    expect(TestBed.inject(ContactInbox).pendingCount()).toBe(0);
    expect(host(fixture).querySelector('[data-message]')).toBeNull();
    expect(host(fixture).querySelector('[data-empty]')).not.toBeNull();
  });

  it('🔴 un second traitement refusé (409) affiche le message du serveur', async () => {
    const api = new FakeContact();
    api.refusal = new HttpErrorResponse({
      status: 409,
      error: { code: 'contact.message.already_handled', message: 'Déjà traité par Colette.' },
    });
    const fixture = await mount(api);
    await fixture.componentInstance['markHandled'](PENDING);
    fixture.detectChanges();

    expect(host(fixture).querySelector('[data-refusal]')?.textContent).toContain(
      'Déjà traité par Colette.',
    );
  });

  it('l’onglet « Traités » relit les messages traités', async () => {
    const api = new FakeContact();
    const fixture = await mount(api);
    fixture.componentInstance['selectTab']('handled');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.reads).toEqual(['pending', 'handled']);
    expect(host(fixture).querySelector('[data-empty]')?.textContent).toContain(
      'Aucun message traité',
    );
  });

  it('sans le droit d’écrire : pas de « Marquer traité »', async () => {
    const fixture = await mount(new FakeContact(), ['b2b_contact:read']);
    expect(host(fixture).querySelector('button[data-handle]')).toBeNull();
  });
});
