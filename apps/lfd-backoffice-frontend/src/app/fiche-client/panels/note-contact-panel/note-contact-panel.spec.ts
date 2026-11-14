import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { NoteCompanyContactPayload } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { AdminCompaniesService } from '../../../comptes-clients/admin-companies.service';
import { NotifyService } from '../../../notify.service';
import { parisToday } from '../../../shared/paris-today';
import { NOTE_MAX_LENGTH, NoteContactPanel } from './note-contact-panel';

class FakeCompanies {
  readonly calls: { companyId: string; payload: NoteCompanyContactPayload; key: string }[] = [];
  failures = 0;
  noteContact(companyId: string, payload: NoteCompanyContactPayload, key: string): Promise<void> {
    this.calls.push({ companyId, payload, key });
    if (this.failures > 0) {
      this.failures -= 1;
      return Promise.reject(
        new HttpErrorResponse({
          status: 400,
          error: { message: 'Un échange ne se note pas dans le futur.' },
        }),
      );
    }
    return Promise.resolve();
  }
}

class FakeNotify {
  readonly successes: string[] = [];
  success(message: string): void {
    this.successes.push(message);
  }
}

interface Rendered {
  readonly fixture: ComponentFixture<NoteContactPanel>;
  readonly companies: FakeCompanies;
  readonly closed: (boolean | undefined)[];
}

function render(): Rendered {
  const companies = new FakeCompanies();
  const closed: (boolean | undefined)[] = [];
  TestBed.configureTestingModule({
    imports: [NoteContactPanel],
    providers: [
      { provide: AdminCompaniesService, useValue: companies },
      { provide: NotifyService, useValue: new FakeNotify() },
      {
        provide: FoldPanelRef,
        useValue: new FoldPanelRef<boolean>(1, (result) => closed.push(result)),
      },
    ],
  });
  const fixture = TestBed.createComponent(NoteContactPanel);
  fixture.componentRef.setInput('data', { companyId: 'co_1', companyName: 'Café Y' });
  fixture.detectChanges();
  return { fixture, companies, closed };
}

describe('NoteContactPanel — noter un contact', () => {
  it('part sur aujourd’hui, et attend un mode avant de permettre l’envoi', () => {
    const { fixture } = render();
    const panel = fixture.componentInstance;
    expect(panel.date()).toBe(parisToday());
    expect(panel.payload()).toBeNull();
    panel.mode.set('phone');
    expect(panel.payload()).toEqual({ mode: 'phone', date: parisToday() });
  });

  it('refuse un jour dans le futur', () => {
    const { fixture } = render();
    const panel = fixture.componentInstance;
    panel.mode.set('visit');
    panel.date.set('2999-01-01');
    expect(panel.payload()).toBeNull();
  });

  it('refuse une note trop longue, et n’envoie pas une note vide', () => {
    const { fixture } = render();
    const panel = fixture.componentInstance;
    panel.mode.set('email');
    panel.note.set('   ');
    expect(panel.payload()).toEqual({ mode: 'email', date: parisToday() });
    panel.note.set('x'.repeat(NOTE_MAX_LENGTH + 1));
    expect(panel.payload()).toBeNull();
    panel.note.set('  Rappeler jeudi  ');
    expect(panel.payload()?.note).toBe('Rappeler jeudi');
  });

  it('envoie sous une clé d’intention, et ferme sur un succès', async () => {
    const { fixture, companies, closed } = render();
    const panel = fixture.componentInstance;
    panel.mode.set('phone');
    await panel.submit();
    expect(companies.calls).toHaveLength(1);
    expect(companies.calls[0]?.companyId).toBe('co_1');
    expect(companies.calls[0]?.key).not.toBe('');
    expect(closed).toEqual([true]);
  });

  it('un refus reste dans le dialogue, et le réessai repasse la même clé', async () => {
    const { fixture, companies, closed } = render();
    companies.failures = 1;
    const panel = fixture.componentInstance;
    panel.mode.set('phone');
    await panel.submit();
    expect(panel.refusal()).not.toBeNull();
    expect(closed).toEqual([]);
    await panel.submit();
    expect(companies.calls[1]?.key).toBe(companies.calls[0]?.key);
    expect(closed).toEqual([true]);
  });
});
