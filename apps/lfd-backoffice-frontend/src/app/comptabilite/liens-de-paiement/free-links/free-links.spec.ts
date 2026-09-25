import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import type { AccountingSettingsView, PaymentLinkView, StaffPermission } from '@lfd/contracts';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { PaymentLinksService } from '../../payment-links.service';
import { capOf, FreeLinks } from './free-links';

/**
 * Ce que ces cas tiennent : chaque colonne rend quelque chose, seul un lien
 * ouvert s'annule, sans `b2b_accounting:write` aucun geste, et le plafond vide
 * part en `null` — jamais en 0.
 */

function link(over: Partial<PaymentLinkView> = {}): PaymentLinkView {
  return {
    id: 'l1',
    companyId: 'c1',
    companyName: 'Le Lac',
    amountCents: 12_550,
    label: 'Régularisation août',
    status: 'open',
    url: 'https://checkout.stripe.com/c/pay/cs_1',
    createdAt: '2026-09-20T09:00:00.000Z',
    createdByName: 'Camille Martin',
    paidAt: null,
    cancelledAt: null,
    cancelledByName: null,
    ...over,
  };
}

const PAID = link({ id: 'l2', label: 'Avoir juillet', status: 'paid' });

class FakeApi {
  links: readonly PaymentLinkView[] = [link(), PAID];
  settings: AccountingSettingsView = { paymentLinkMaxCents: 50_000 };
  cancelled: string[] = [];
  saved: AccountingSettingsView[] = [];
  refuse: unknown = null;

  listLinks(): Promise<readonly PaymentLinkView[]> {
    return Promise.resolve(this.links);
  }

  readSettings(): Promise<AccountingSettingsView> {
    return Promise.resolve(this.settings);
  }

  cancelLink(id: string): Promise<void> {
    if (this.refuse !== null) {
      return Promise.reject(this.refuse);
    }
    this.cancelled.push(id);
    this.links = this.links.map((l) => (l.id === id ? { ...l, status: 'cancelled' } : l));
    return Promise.resolve();
  }

  saveSettings(settings: AccountingSettingsView): Promise<void> {
    this.saved.push(settings);
    return Promise.resolve();
  }
}

async function render(
  api: FakeApi,
  permissions: readonly StaffPermission[] = ['b2b_accounting:read', 'b2b_accounting:write'],
  opened: unknown[] = [],
): Promise<ComponentFixture<FreeLinks>> {
  TestBed.configureTestingModule({
    imports: [FreeLinks],
    providers: [
      { provide: PaymentLinksService, useValue: api },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (_c: unknown, config: { data: unknown }) => {
            opened.push(config.data);
            return { closed: Promise.resolve(undefined) };
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(FreeLinks);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<FreeLinks>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

const text = (fixture: ComponentFixture<FreeLinks>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

function buttons(fixture: ComponentFixture<FreeLinks>, label: string): HTMLButtonElement[] {
  const all = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button');
  return Array.from(all).filter((b) => b.textContent?.trim() === label);
}

function typeCap(fixture: ComponentFixture<FreeLinks>, value: string): void {
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
    'fold-input input',
  );
  if (input === null) {
    throw new Error('champ du plafond introuvable');
  }
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

describe('capOf', () => {
  it('vide = aucun plafond (null), jamais 0', () => {
    expect(capOf('')).toBeNull();
    expect(capOf('   ')).toBeNull();
  });

  it('des euros → des centimes entiers', () => {
    expect(capOf('500')).toBe(50_000);
    expect(capOf('19,99')).toBe(1_999);
  });

  it('une saisie illisible est distinguée du vide', () => {
    expect(capOf('abc')).toBeUndefined();
    expect(capOf('0')).toBeUndefined();
    expect(capOf('1,005')).toBeUndefined();
  });
});

describe('FreeLinks', () => {
  it('rend société, libellé, montant, état, auteur et plafond', async () => {
    const body = text(await render(new FakeApi()));

    expect(body).toContain('Le Lac');
    expect(body).toContain('Régularisation août');
    expect(body).toMatch(/125,50\s€/u);
    expect(body).toContain('Ouvert');
    expect(body).toContain('Réglé');
    expect(body).toContain('Camille Martin');
    expect(body).toMatch(/Au plus 500,00\s€ par lien/u);
  });

  it('seul le lien ouvert propose « Annuler »', async () => {
    const fixture = await render(new FakeApi());
    expect(buttons(fixture, 'Annuler')).toHaveLength(1);
  });

  it('sans droit d’écriture, ni annuler, ni créer, ni plafond à éditer', async () => {
    const fixture = await render(new FakeApi(), ['b2b_accounting:read']);

    expect(buttons(fixture, 'Annuler')).toHaveLength(0);
    expect(buttons(fixture, 'Nouveau lien')).toHaveLength(0);
    expect(buttons(fixture, 'Enregistrer le plafond')).toHaveLength(0);
    expect(buttons(fixture, 'Copier le lien')).toHaveLength(2);
  });

  it('« Annuler » confirme, écrit, puis relit la liste', async () => {
    const api = new FakeApi();
    const fixture = await render(api);

    buttons(fixture, 'Annuler')[0]?.click();
    await settle(fixture);
    expect(api.cancelled).toEqual([]);

    buttons(fixture, 'Annuler le lien').at(-1)?.click();
    await settle(fixture);

    expect(api.cancelled).toEqual(['l1']);
    expect(text(fixture)).toContain('Annulé');
  });

  it('un refus du serveur s’affiche avec ses mots, la liste reste', async () => {
    const api = new FakeApi();
    api.refuse = { status: 409, error: { message: 'Ce lien a déjà été réglé.' } };
    const fixture = await render(api);

    buttons(fixture, 'Annuler')[0]?.click();
    await settle(fixture);
    buttons(fixture, 'Annuler le lien').at(-1)?.click();
    await settle(fixture);

    expect(text(fixture)).toContain('Ce lien a déjà été réglé.');
    expect(text(fixture)).toContain('Régularisation août');
  });

  it('vider le plafond l’enregistre en null', async () => {
    const api = new FakeApi();
    const fixture = await render(api);

    typeCap(fixture, '');
    await settle(fixture);
    buttons(fixture, 'Enregistrer le plafond')[0]?.click();
    await settle(fixture);

    expect(api.saved).toEqual([{ paymentLinkMaxCents: null }]);
    expect(text(fixture)).toContain('Aucun plafond');
  });

  it('un plafond en euros part en centimes entiers', async () => {
    const api = new FakeApi();
    const fixture = await render(api);

    typeCap(fixture, '1250,40');
    await settle(fixture);
    buttons(fixture, 'Enregistrer le plafond')[0]?.click();
    await settle(fixture);

    expect(api.saved).toEqual([{ paymentLinkMaxCents: 125_040 }]);
  });

  it('un plafond illisible ne s’envoie pas', async () => {
    const api = new FakeApi();
    const fixture = await render(api);

    typeCap(fixture, '12,345');
    await settle(fixture);

    expect(buttons(fixture, 'Enregistrer le plafond')[0]?.disabled).toBe(true);
  });

  it('« Nouveau lien » ouvre le panneau avec le plafond en vigueur', async () => {
    const opened: unknown[] = [];
    const fixture = await render(new FakeApi(), undefined, opened);

    buttons(fixture, 'Nouveau lien')[0]?.click();
    await settle(fixture);

    expect(opened).toEqual([{ maxCents: 50_000 }]);
  });
});
