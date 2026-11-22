import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  StaffNoticeAudienceView,
  StaffNoticeAudiencesView,
  StaffPermission,
} from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { B2B_API_BASE } from '../../../api/api-config';
import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { NoticeAudiencesPage } from './notice-audiences-page';

/**
 * Ce que ces cas tiennent : le réglage se lit, « rien de réglé » se dit en
 * toutes lettres, l'enregistrement envoie l'ENSEMBLE coché (le serveur pose,
 * il ne fusionne pas), un refus s'affiche avec le message du serveur, la
 * lecture seule n'offre aucune case, et un membre sans adresse est signalé.
 */

const URL = `${B2B_API_BASE}/admin/staff-notice-audiences`;
const TEMPLATE = 'staff.link-payment-received';

const ACCOUNTING = { key: 'comptable', label: 'Comptabilité', archived: false };
const SALES = { key: 'commercial', label: 'Commercial', archived: false };
const ALICE = { staffUserId: 'st_alice', firstName: 'Alice', lastName: 'Martin', reachable: true };
const BRUNO = { staffUserId: 'st_bruno', firstName: 'Bruno', lastName: 'Petit', reachable: false };

function board(notice: Partial<StaffNoticeAudienceView> = {}): StaffNoticeAudiencesView {
  return {
    notices: [
      { template: TEMPLATE, label: 'Paiement reçu par un lien', roles: [], members: [], ...notice },
    ],
    candidates: { roles: [ACCOUNTING, SALES], members: [ALICE, BRUNO] },
  };
}

interface Harness {
  readonly fixture: ComponentFixture<NoticeAudiencesPage>;
  readonly http: HttpTestingController;
  readonly success: ReturnType<typeof vi.fn>;
}

async function render(
  current: StaffNoticeAudiencesView,
  permissions: readonly StaffPermission[],
): Promise<Harness> {
  const success = vi.fn();
  const store: Pick<PermissionsStore, 'can'> = {
    can: (permission: StaffPermission): boolean => permissions.includes(permission),
  };
  TestBed.configureTestingModule({
    imports: [NoticeAudiencesPage],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PermissionsStore, useValue: store },
      { provide: NotifyService, useValue: { success, error: () => undefined } },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(NoticeAudiencesPage);
  fixture.detectChanges();
  http.expectOne(URL).flush(current);
  await settle(fixture);
  return { fixture, http, success };
}

async function settle(fixture: ComponentFixture<NoticeAudiencesPage>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

const host = (fixture: ComponentFixture<NoticeAudiencesPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const text = (fixture: ComponentFixture<NoticeAudiencesPage>): string =>
  host(fixture).textContent ?? '';

function box(fixture: ComponentFixture<NoticeAudiencesPage>, label: string): HTMLInputElement {
  const holder = [...host(fixture).querySelectorAll('fold-checkbox')].find((element) =>
    (element.textContent ?? '').includes(label),
  );
  const input = holder?.querySelector('input[type="checkbox"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`case introuvable : ${label}`);
  }
  return input;
}

function saveButton(fixture: ComponentFixture<NoticeAudiencesPage>): HTMLButtonElement {
  const button = [...host(fixture).querySelectorAll('button')].find((candidate) =>
    (candidate.textContent ?? '').includes('Enregistrer'),
  );
  if (button === undefined) {
    throw new Error('bouton Enregistrer introuvable');
  }
  return button;
}

const READER: readonly StaffPermission[] = ['staff_notice_audiences:read'];
const WRITER: readonly StaffPermission[] = [
  'staff_notice_audiences:read',
  'staff_notice_audiences:write',
];
const NOBODY = "Aucun destinataire : l'avis part à la boîte de l'équipe.";

describe('NoticeAudiencesPage', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('coche ce qui est réglé', async () => {
    const { fixture } = await render(board({ roles: [ACCOUNTING], members: [ALICE] }), WRITER);

    expect(text(fixture)).toContain('Paiement reçu par un lien');
    expect(box(fixture, 'Comptabilité').checked).toBe(true);
    expect(box(fixture, 'Commercial').checked).toBe(false);
    expect(box(fixture, 'Alice Martin').checked).toBe(true);
    expect(text(fixture)).not.toContain(NOBODY);
    expect(saveButton(fixture).disabled).toBe(true);
  });

  it('dit en toutes lettres que rien de réglé part à la boîte de l’équipe', async () => {
    const { fixture } = await render(board(), WRITER);

    expect(text(fixture)).toContain(NOBODY);
  });

  it('envoie l’ensemble coché, puis relit', async () => {
    const { fixture, http, success } = await render(board({ roles: [ACCOUNTING] }), WRITER);

    box(fixture, 'Alice Martin').click();
    await settle(fixture);
    expect(saveButton(fixture).disabled).toBe(false);

    saveButton(fixture).click();
    const put = http.expectOne(`${URL}/${encodeURIComponent(TEMPLATE)}`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ roleKeys: ['comptable'], staffUserIds: ['st_alice'] });
    put.flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);

    http.expectOne(URL).flush(board({ roles: [ACCOUNTING], members: [ALICE] }));
    await settle(fixture);

    expect(success).toHaveBeenCalledWith('Destinataires enregistrés.');
    expect(saveButton(fixture).disabled).toBe(true);
  });

  it('affiche le refus du serveur, et garde ce qui est coché', async () => {
    const { fixture, http } = await render(board(), WRITER);

    box(fixture, 'Commercial').click();
    await settle(fixture);
    saveButton(fixture).click();
    http
      .expectOne(`${URL}/${encodeURIComponent(TEMPLATE)}`)
      .flush(
        { code: 'STAFF_NOTICE_ROLE_ARCHIVED', message: 'Le rôle « Commercial » est archivé.' },
        { status: 409, statusText: 'Conflict' },
      );
    await settle(fixture);

    const alert = host(fixture).querySelector('fold-callout[variant="alert"]');
    expect(alert?.textContent).toContain('Le rôle « Commercial » est archivé.');
    expect(box(fixture, 'Commercial').checked).toBe(true);
  });

  it('sans le droit d’écrire, ne propose aucune case ni bouton', async () => {
    const { fixture } = await render(board({ roles: [ACCOUNTING] }), READER);

    expect(host(fixture).querySelector('fold-checkbox')).toBeNull();
    expect(text(fixture)).not.toContain('Enregistrer');
    expect(text(fixture)).toContain('Comptabilité');
    expect(text(fixture)).not.toContain('Commercial');
    expect(text(fixture)).toContain('Lecture seule');
  });

  it('signale un membre sans adresse joignable', async () => {
    const writer = await render(board(), WRITER);
    expect(box(writer.fixture, 'Bruno Petit')).toBeTruthy();
    const brunoRow = [...host(writer.fixture).querySelectorAll('fold-checkbox')].find((element) =>
      (element.textContent ?? '').includes('Bruno Petit'),
    );
    expect(brunoRow?.textContent).toContain('Sans adresse joignable');

    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
    const reader = await render(board({ members: [BRUNO] }), READER);
    expect(text(reader.fixture)).toContain('Sans adresse joignable');
  });
});
