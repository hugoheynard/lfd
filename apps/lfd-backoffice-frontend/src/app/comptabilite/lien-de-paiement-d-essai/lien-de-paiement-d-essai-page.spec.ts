import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { PayLinkTestRecipient, PayLinkTestView, StaffPermission } from '@lfd/contracts';
import { FoldListboxComponent } from 'fold-ng';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { LienDePaiementDEssaiPage } from './lien-de-paiement-d-essai-page';

/**
 * Ce que ces cas tiennent : les essais se lisent avec leur état en français,
 * « Copier le lien » n'existe que tant que le lien est ouvert, le destinataire
 * se choisit parmi les membres que le serveur propose, l'envoi porte l'identifiant du
 * membre et une clé d'intention, et sans le droit d'écriture rien ne s'envoie.
 */

const TESTS_URL = `${B2B_API_BASE}/admin/payment/link-tests`;
const MEMBERS_URL = `${TESTS_URL}/recipients`;

const SENT: PayLinkTestView = {
  id: 'plt_1',
  state: 'sent',
  createdAt: '2026-11-24T09:00:00.000Z',
  createdByLabel: 'Alice Martin',
  paidAt: null,
  refundedAt: null,
  url: 'https://pay.example/plt_1',
};
const REFUNDED: PayLinkTestView = {
  ...SENT,
  id: 'plt_2',
  state: 'refunded',
  paidAt: '2026-11-24T09:05:00.000Z',
  refundedAt: '2026-11-24T09:06:00.000Z',
  url: null,
};

const RECIPIENTS: readonly PayLinkTestRecipient[] = [
  { staffUserId: 'st_alice', label: 'Alice Martin' },
];

const READER: readonly StaffPermission[] = ['pay_link_test:read'];
const WRITER: readonly StaffPermission[] = ['pay_link_test:read', 'pay_link_test:write'];

interface Harness {
  readonly fixture: ComponentFixture<LienDePaiementDEssaiPage>;
  readonly http: HttpTestingController;
  readonly success: ReturnType<typeof vi.fn>;
}

async function render(
  tests: readonly PayLinkTestView[],
  permissions: readonly StaffPermission[],
): Promise<Harness> {
  const success = vi.fn();
  const store: Pick<PermissionsStore, 'can'> = {
    can: (permission: StaffPermission): boolean => permissions.includes(permission),
  };
  TestBed.configureTestingModule({
    imports: [LienDePaiementDEssaiPage],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PermissionsStore, useValue: store },
      { provide: NotifyService, useValue: { success, error: () => undefined } },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(LienDePaiementDEssaiPage);
  fixture.detectChanges();
  http.expectOne(TESTS_URL).flush(tests);
  if (permissions.includes('pay_link_test:write')) {
    http.expectOne(MEMBERS_URL).flush(RECIPIENTS);
  }
  await settle(fixture);
  return { fixture, http, success };
}

async function settle(fixture: ComponentFixture<LienDePaiementDEssaiPage>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

const host = (fixture: ComponentFixture<LienDePaiementDEssaiPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const text = (fixture: ComponentFixture<LienDePaiementDEssaiPage>): string =>
  host(fixture).textContent ?? '';

function listbox(
  fixture: ComponentFixture<LienDePaiementDEssaiPage>,
): FoldListboxComponent<string> {
  const instance: unknown = fixture.debugElement.query(
    By.directive(FoldListboxComponent),
  ).componentInstance;
  if (!(instance instanceof FoldListboxComponent)) {
    throw new Error('choix du destinataire introuvable');
  }
  return instance as FoldListboxComponent<string>;
}

function sendButton(fixture: ComponentFixture<LienDePaiementDEssaiPage>): HTMLButtonElement {
  const button = host(fixture).querySelector('[data-send-button]');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('bouton d’envoi introuvable');
  }
  return button;
}

describe('LienDePaiementDEssaiPage', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('montre les essais, leur état en français, et ne copie qu’un lien ouvert', async () => {
    const { fixture } = await render([SENT, REFUNDED], READER);

    expect(text(fixture)).toContain('Envoyé');
    expect(text(fixture)).toContain('Remboursé');
    expect(text(fixture)).toContain('par Alice Martin');
    expect(host(fixture).querySelectorAll('[data-copy]')).toHaveLength(1);
  });

  it('dit qu’il n’y a encore aucun essai', async () => {
    const { fixture } = await render([], READER);

    expect(text(fixture)).toContain('Aucun essai');
  });

  it('sans le droit d’écriture, n’offre pas d’envoi et ne lit pas les membres', async () => {
    const { fixture } = await render([SENT], READER);

    expect(host(fixture).querySelector('[data-send]')).toBeNull();
  });

  it('propose les membres servis par le serveur, et n’envoie rien sans choix', async () => {
    const { fixture } = await render([], WRITER);

    expect(
      listbox(fixture)
        .options()
        ?.map((option) => option.label),
    ).toEqual(['Alice Martin']);
    expect(sendButton(fixture).disabled).toBe(true);
  });

  it('envoie l’identifiant du membre choisi, sous une clé d’intention, puis relit', async () => {
    const { fixture, http, success } = await render([], WRITER);

    listbox(fixture).value.set('st_alice');
    await settle(fixture);
    expect(sendButton(fixture).disabled).toBe(false);
    sendButton(fixture).click();

    const post = http.expectOne({ method: 'POST', url: TESTS_URL });
    expect(post.request.body).toEqual({ staffUserId: 'st_alice' });
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    post.flush({ id: 'plt_1', url: SENT.url });
    await settle(fixture);
    http.expectOne({ method: 'GET', url: TESTS_URL }).flush([SENT]);
    await settle(fixture);

    expect(success).toHaveBeenCalled();
    expect(text(fixture)).toContain('Envoyé');
  });

  it('montre le refus du serveur', async () => {
    const { fixture, http } = await render([], WRITER);

    listbox(fixture).value.set('st_alice');
    await settle(fixture);
    sendButton(fixture).click();
    http
      .expectOne({ method: 'POST', url: TESTS_URL })
      .flush({ message: 'Cinq essais par jour au plus.' }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);

    expect(text(fixture)).toContain('Cinq essais par jour au plus.');
  });
});
