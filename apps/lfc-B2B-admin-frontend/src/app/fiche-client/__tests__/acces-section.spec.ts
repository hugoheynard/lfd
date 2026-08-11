import { TestBed } from '@angular/core/testing';
import type { CompanyMemberInvitedView, CompanyMemberView } from '@lfd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { NotifyService } from '../../notify.service';
import { AccesSection } from '../acces-section/acces-section';

const INVITED: CompanyMemberView = {
  userId: 'user_1',
  email: 'jean@exemple.fr',
  firstName: '',
  lastName: '',
  phone: '',
  role: 'company_admin',
  status: 'invited',
  joinedAt: '2026-08-11T10:00:00.000Z',
};

interface Harness {
  readonly section: AccesSection;
  readonly invite: ReturnType<typeof vi.fn>;
  readonly successes: string[];
}

async function setup(
  members: readonly CompanyMemberView[] | Error = [],
  invited: CompanyMemberInvitedView = { member: INVITED, mailSent: true },
): Promise<Harness> {
  const successes: string[] = [];
  const invite = vi.fn(() => Promise.resolve(invited));
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AdminCompaniesService,
        useValue: {
          listMembers: (): Promise<readonly CompanyMemberView[]> =>
            members instanceof Error ? Promise.reject(members) : Promise.resolve(members),
          inviteMember: invite,
        } satisfies Pick<AdminCompaniesService, 'listMembers' | 'inviteMember'>,
      },
      {
        provide: NotifyService,
        useValue: {
          success: (message: string): void => {
            successes.push(message);
          },
          info: (): void => undefined,
          error: (): void => undefined,
        } satisfies Pick<NotifyService, 'success' | 'info' | 'error'>,
      },
    ],
  });
  const fixture = TestBed.createComponent(AccesSection);
  fixture.componentRef.setInput('companyId', 'cmp_1');
  fixture.detectChanges();
  await Promise.resolve();
  await Promise.resolve();
  return { section: fixture.componentInstance, invite, successes };
}

describe('AccesSection', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('signale le compte où PERSONNE ne peut se connecter', async () => {
    // C'est l'état d'un compte ouvert sans que le fournisseur d'identité soit
    // joignable : le dossier existe, le client est dehors. Il doit sauter aux
    // yeux, pas se déduire d'une liste vide.
    const { section } = await setup([]);

    expect(section['empty']()).toBe(true);
  });

  it("renvoie le lien par le MÊME appel que l'invitation", async () => {
    // L'API est idempotente sur l'adresse : deux boutons pour un geste, ce
    // serait deux façons de se tromper.
    const { section, invite } = await setup([INVITED]);

    section['resend'](INVITED);
    await Promise.resolve();

    expect(invite).toHaveBeenCalledWith('cmp_1', {
      email: 'jean@exemple.fr',
      firstName: '',
      lastName: '',
      phone: '',
      role: 'company_admin',
    });
  });

  it("dit quand l'e-mail n'est PAS parti", async () => {
    // Un « c'est envoyé ! » de politesse ferait attendre au client un message
    // qui n'arrivera jamais.
    const { section, successes } = await setup([], { member: INVITED, mailSent: false });

    section['email'].set('jean@exemple.fr');
    section['inviteNew']();
    await Promise.resolve();
    await Promise.resolve();

    expect(successes.at(-1)).toContain("l'e-mail n'est pas parti");
  });

  it("n'invite personne sans adresse", async () => {
    const { section } = await setup([]);
    expect(section['canInvite']()).toBe(false);

    section['email'].set('jean@exemple.fr');
    expect(section['canInvite']()).toBe(true);
  });

  it('reste utilisable quand la lecture des accès échoue', async () => {
    // Le commercial doit pouvoir ouvrir un accès même si la liste n'a pas pu
    // être lue — c'est justement le moment où il en a besoin.
    const { section } = await setup(new Error('hors service'));

    expect(section['failed']()).toBe(true);
    section['email'].set('jean@exemple.fr');
    expect(section['canInvite']()).toBe(true);
  });
});
