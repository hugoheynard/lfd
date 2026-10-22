import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  CompanyMemberInvitedView,
  CustomerAccessRowView,
  InviteCompanyMemberPayload,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { AdminCompaniesService } from '../../../comptes-clients/admin-companies.service';
import { NotifyService } from '../../../notify.service';
import { AccesClientsPage } from '../acces-clients-page';
import { CustomerAccessService } from '../customer-access.service';

function row(over: Partial<CustomerAccessRowView> = {}): CustomerAccessRowView {
  return {
    companyId: 'c1',
    companyName: 'Le Comptoir',
    parent: null,
    holder: { firstName: 'Camille', lastName: 'Durand', email: 'camille@test.fr', phone: '' },
    state: 'invited',
    activatedAt: null,
    lastInvitedAt: null,
    otherMembers: 0,
    otherMembersActive: 0,
    ...over,
  };
}

class FakeAccess {
  rows: readonly CustomerAccessRowView[] = [];
  fails = false;
  list(): Promise<readonly CustomerAccessRowView[]> {
    return this.fails ? Promise.reject(new Error('injoignable')) : Promise.resolve(this.rows);
  }
}

class FakeCompanies {
  readonly invited: { companyId: string; payload: InviteCompanyMemberPayload }[] = [];
  mailSent = true;
  inviteMember(
    companyId: string,
    payload: InviteCompanyMemberPayload,
  ): Promise<CompanyMemberInvitedView> {
    this.invited.push({ companyId, payload });
    return Promise.resolve({
      mailSent: this.mailSent,
      member: {
        userId: 'u1',
        email: payload.email,
        firstName: payload.firstName,
        lastName: payload.lastName,
        phone: payload.phone,
        role: payload.role,
        status: 'invited',
        joinedAt: '',
      },
    });
  }
}

class FakeNotify {
  readonly said: string[] = [];
  success(message: string): void {
    this.said.push(`ok:${message}`);
  }
  info(message: string): void {
    this.said.push(`info:${message}`);
  }
  error(): void {
    this.said.push('error');
  }
}

async function render(
  access: FakeAccess,
  companies = new FakeCompanies(),
  notify = new FakeNotify(),
): Promise<ComponentFixture<AccesClientsPage>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AccesClientsPage],
    providers: [
      provideRouter([]),
      { provide: CustomerAccessService, useValue: access },
      { provide: AdminCompaniesService, useValue: companies },
      { provide: NotifyService, useValue: notify },
    ],
  });
  const fixture = TestBed.createComponent(AccesClientsPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('page « Accès clients »', () => {
  it('rend chaque état, le sans-détenteur en tête', async () => {
    const access = new FakeAccess();
    access.rows = [
      row({ companyId: 'a', companyName: 'Alpha', state: 'active' }),
      row({ companyId: 'b', companyName: 'Bravo', state: 'no_holder', holder: null }),
    ];
    const host = (await render(access)).nativeElement as HTMLElement;

    const text = host.textContent ?? '';
    expect(text.indexOf('Bravo')).toBeLessThan(text.indexOf('Alpha'));
    expect(text).toContain('Sans détenteur');
    expect(text).toContain('Activé (date inconnue)');
  });

  it('propose la relance à un invité, et pas à un activé', async () => {
    const access = new FakeAccess();
    access.rows = [row({ state: 'active' })];
    const host = (await render(access)).nativeElement as HTMLElement;

    expect(host.textContent).not.toContain("Renvoyer l'e-mail d'accès");
  });

  it('relance par la confirmation, en `owner`, et dit que l’e-mail n’est pas parti', async () => {
    const access = new FakeAccess();
    access.rows = [row({ state: 'expired' })];
    const companies = new FakeCompanies();
    companies.mailSent = false;
    const notify = new FakeNotify();
    const fixture = await render(access, companies, notify);
    const host = fixture.nativeElement as HTMLElement;

    buttonNamed(host, "Renvoyer l'e-mail d'accès").click();
    fixture.detectChanges();
    buttonNamed(host, 'Renvoyer').click();
    await fixture.whenStable();

    expect(companies.invited).toEqual([
      {
        companyId: 'c1',
        payload: {
          email: 'camille@test.fr',
          firstName: 'Camille',
          lastName: 'Durand',
          phone: '',
          role: 'owner',
        },
      },
    ]);
    expect(notify.said[0]).toMatch(/^info:.*n'est pas parti/);
  });

  it('pagine à 25 comptes et compte ce que le filtre laisse passer', async () => {
    const access = new FakeAccess();
    access.rows = many(30, 'invited');
    const fixture = await render(access);
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).toContain('30 comptes');
    expect(host.querySelector('fold-paginator')).not.toBeNull();
    expect(host.textContent).toContain('Société 00');
    expect(host.textContent).not.toContain('Société 29');
  });

  it('n’affiche pas le paginator tenant en une page', async () => {
    const access = new FakeAccess();
    access.rows = many(3, 'invited');
    const host = (await render(access)).nativeElement as HTMLElement;

    expect(host.querySelector('fold-paginator')).toBeNull();
  });

  it('revient à la page 1 quand le filtre change', async () => {
    const access = new FakeAccess();
    access.rows = many(60, 'invited');
    const fixture = await render(access);
    const host = fixture.nativeElement as HTMLElement;

    labelled(host, 'Page suivante').click();
    fixture.detectChanges();
    expect(host.textContent).toContain('Société 25');
    expect(host.textContent).not.toContain('Société 00');

    buttonNamed(host, 'Invité').click();
    fixture.detectChanges();
    expect(host.textContent).toContain('Société 00');
    expect(host.textContent).not.toContain('Société 25');
  });

  it('dit l’échec de lecture au lieu d’une table vide', async () => {
    const access = new FakeAccess();
    access.fails = true;
    const host = (await render(access)).nativeElement as HTMLElement;

    expect(host.textContent).toContain('Impossible de lire les accès clients');
  });
});

function many(count: number, state: CustomerAccessRowView['state']): CustomerAccessRowView[] {
  return Array.from({ length: count }, (_, i) =>
    row({ companyId: `c${i}`, companyName: `Société ${String(i).padStart(2, '0')}`, state }),
  );
}

function labelled(host: HTMLElement, label: string): HTMLElement {
  const found = host.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  if (found === null) {
    throw new Error(`Aucun contrôle « ${label} »`);
  }
  return found;
}

function buttonNamed(host: HTMLElement, name: string): HTMLButtonElement {
  const found = Array.from(host.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === name,
  );
  if (found === undefined) {
    throw new Error(`Aucun bouton « ${name} »`);
  }
  return found;
}
