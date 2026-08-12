import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CompanyStatus } from '@lfd/contracts';

import { ActivationAside } from '../activation-aside/activation-aside';
import type { ActivationTrace, SuspensionCause } from '../../comptes-clients/admin-company';

interface Rendered {
  readonly host: HTMLElement;
  readonly button: HTMLButtonElement;
  readonly activations: number[];
  readonly reactivations: number[];
}

function render(options: {
  readonly status: CompanyStatus;
  readonly canActivate?: boolean;
  readonly blockedReason?: string;
  readonly remaining?: number;
  readonly activation?: ActivationTrace | null;
  readonly suspensionCause?: SuspensionCause | null;
}): Rendered {
  const fixture = TestBed.createComponent(ActivationAside);
  fixture.componentRef.setInput('status', options.status);
  fixture.componentRef.setInput('canActivate', options.canActivate ?? false);
  fixture.componentRef.setInput('blockedReason', options.blockedReason ?? '');
  fixture.componentRef.setInput('remaining', options.remaining ?? 0);
  fixture.componentRef.setInput('activation', options.activation ?? null);
  fixture.componentRef.setInput('suspensionCause', options.suspensionCause ?? null);
  const activations: number[] = [];
  const reactivations: number[] = [];
  fixture.componentInstance.activate.subscribe(() => activations.push(1));
  fixture.componentInstance.reactivate.subscribe(() => reactivations.push(1));
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  return {
    host,
    button: host.querySelector('button') as HTMLButtonElement,
    activations,
    reactivations,
  };
}

describe('rail Activation du compte', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('DIT pourquoi il refuse, au lieu de griser en silence', () => {
    // Un bouton grisé muet est une impasse : on ne sait pas quoi corriger.
    const { host, button } = render({
      status: 'pending',
      blockedReason: 'Aucun interlocuteur joignable : renseignez au moins un numéro de téléphone.',
      remaining: 2,
    });

    expect(button.disabled).toBe(true);
    expect(host.textContent).toContain('Aucun interlocuteur joignable');
    expect(host.textContent).toContain('2 points à régler');
  });

  it('accorde le singulier quand il ne reste qu’un point', () => {
    const { host } = render({ status: 'pending', remaining: 1 });

    expect(host.textContent).toContain('1 point à régler');
    expect(host.textContent).not.toContain('1 points');
  });

  it('active en un clic quand le dossier est complet', () => {
    const { button, activations } = render({ status: 'pending', canActivate: true });

    expect(button.disabled).toBe(false);
    button.click();

    expect(activations).toHaveLength(1);
  });

  it("n'offre AUCUNE activation sur un compte déjà actif", () => {
    // Le geste n'a plus de sens : le montrer grisé ferait douter du statut.
    const { host } = render({ status: 'active' });

    expect(host.querySelector('button')).toBeNull();
    expect(host.textContent).toContain('Compte actif');
  });

  it('NOMME qui a ouvert le compte, et quand', () => {
    // Ouvrir la commande à un client est un engagement : « un membre du staff »
    // n'engage personne. La trace dit qui, à quel titre, ce jour-là.
    const { host } = render({
      status: 'active',
      activation: {
        at: '2026-08-12T09:50:00.000Z',
        by: { sub: 'auth0|x', name: 'Camille Rousseau', role: 'commercial' },
      },
    });

    expect(host.textContent).toContain('Ouvert par Camille Rousseau (commercial), le 12/08/2026');
  });

  it("se contente de la date quand l'annuaire ne connaissait pas l'agent", () => {
    // Une trace incomplète vaut mieux qu'une trace inventée — et un `sub`
    // technique au milieu d'une phrase n'apprend rien à personne.
    const { host } = render({
      status: 'active',
      activation: { at: '2026-08-12T09:50:00.000Z', by: null },
    });

    expect(host.textContent).toContain('Ouvert le 12/08/2026');
  });

  it('ne dit PAS « actif » d’un compte suspendu, et rend l’accès en un clic', () => {
    // Le rail affichait « Compte actif » à un compte suspendu : il contredisait
    // le badge d'en-tête, et rien n'offrait de rouvrir.
    const { host, button, reactivations } = render({
      status: 'suspended',
      suspensionCause: 'staff',
    });

    expect(host.textContent).toContain('Compte suspendu');
    expect(host.textContent).not.toContain('Compte actif');
    button.click();

    expect(reactivations).toHaveLength(1);
  });

  it("n'offre pas « Réactiver » quand la reprise est AUTOMATIQUE", () => {
    // Suspension née du retrait de vérification : re-vérifier l'extrait suffit.
    // Un bouton ici laisserait croire qu'un chemin contourne la vérification.
    const { host } = render({ status: 'suspended', suspensionCause: 'kbis_revoked' });

    expect(host.querySelector('button')).toBeNull();
    expect(host.textContent).toContain('vérification du KBIS a été retirée');
  });

  it('dit la fin de la relation sur un compte résilié', () => {
    const { host } = render({ status: 'terminated' });

    expect(host.querySelector('button')).toBeNull();
    expect(host.textContent).toContain('Compte résilié');
  });
});
