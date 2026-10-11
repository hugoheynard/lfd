import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type { CapabilitiesReport } from '@lfd/ops-contract';

import { Capabilities, type CapabilitiesState } from './capabilities';

const REPORT: CapabilitiesReport = {
  revision: 'abc1234',
  missing: [
    {
      capability: 'Paiement',
      setting: 'STRIPE_SECRET_KEY',
      consequence: 'le paiement par carte au checkout est indisponible',
      severity: 'blocking',
    },
    {
      capability: 'Point de vente racine (plateforme B2B)',
      setting: '—',
      consequence: 'la plateforme professionnelle n’a pas pu être semée',
      severity: 'blocking',
    },
    {
      capability: 'Retour du courrier',
      setting: 'RESEND_WEBHOOK_SECRET',
      consequence: 'on n’apprend jamais lesquels ont rebondi',
      severity: 'degraded',
    },
  ],
};

function render(
  state: CapabilitiesState,
  report: CapabilitiesReport | null,
): ComponentFixture<Capabilities> {
  const fixture = TestBed.createComponent(Capabilities);
  fixture.componentRef.setInput('state', state);
  fixture.componentRef.setInput('report', report);
  fixture.detectChanges();
  return fixture;
}

const text = (f: ComponentFixture<Capabilities>): string =>
  (f.nativeElement as HTMLElement).textContent ?? '';

describe('Capabilities', () => {
  it('nomme la capacité, ce qu’elle empêche, la variable et où la poser', () => {
    const f = render('ready', REPORT);
    const content = text(f);

    expect(content).toContain('Paiement');
    expect(content).toContain('le paiement par carte au checkout est indisponible');
    expect(content).toContain('STRIPE_SECRET_KEY');
    expect(content).toContain('deploy_lfd_api.yml');
    expect(content).toContain('redéployer');
    expect(content).toContain('abc1234');
  });

  it('dit la gravité de chaque ligne', () => {
    const f = render('ready', REPORT);
    const host = f.nativeElement as HTMLElement;

    expect(host.querySelectorAll('[data-severity="blocking"]')).toHaveLength(2);
    expect(host.querySelector('[data-severity="degraded"]')?.textContent).toContain('Dégradée');
    expect(host.querySelector('[data-severity="blocking"]')?.textContent).toContain('Bloquante');
  });

  it('ne demande pas de poser « — » quand aucune variable n’est en cause', () => {
    const content = text(render('ready', REPORT));

    expect(content).not.toContain('À poser : —');
    expect(content).toContain('Aucune variable en cause');
  });

  it('dit « Tout est branché » quand la liste est vide', () => {
    const content = text(render('ready', { revision: 'abc1234', missing: [] }));

    expect(content).toContain('Tout est branché');
    expect(content).not.toContain('deploy_lfd_api.yml');
  });

  it('dit que la lecture a échoué, et propose de réessayer', () => {
    const f = render('error', null);
    let retried = 0;
    f.componentInstance.retry.subscribe(() => (retried += 1));

    expect(text(f)).toContain('Capacités illisibles');
    (f.nativeElement as HTMLElement).querySelector('button')?.click();
    expect(retried).toBe(1);
  });
});
