import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FoldDateComponent } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { parisToday } from '../../shared/paris-today';
import { FicheClientFacade } from '../informations/fiche-client.facade';
import { KbisCertification } from './kbis-certification';

/** Un jour relatif à aujourd'hui : `years` ans plus tôt, même mois, le 1er. */
function yearsAgo(years: number): string {
  const [year = '', month = ''] = parisToday().split('-');
  return `${Number(year) - years}-${month}-01`;
}

function setup(refusal: string | null = null) {
  const certifyKbis = vi.fn((_issuedOn: string) => Promise.resolve(refusal));
  const facade = { certifyingKbis: signal(true), certifyKbis };
  TestBed.configureTestingModule({
    providers: [{ provide: FicheClientFacade, useValue: facade }],
  });
  const fixture = TestBed.createComponent(KbisCertification);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const setDate = (day: string): void => {
    const date = fixture.debugElement.query(By.directive(FoldDateComponent))
      .componentInstance as FoldDateComponent;
    date.value.set(day);
    fixture.detectChanges();
  };
  const certifyButton = (): HTMLButtonElement | null =>
    host.querySelector<HTMLButtonElement>('[data-kbis-certify]');
  return { fixture, host, facade, certifyKbis, setDate, certifyButton };
}

describe('KbisCertification', () => {
  it('refuse d’envoyer sans date de délivrance', () => {
    const { certifyButton, certifyKbis } = setup();

    expect(certifyButton()?.disabled).toBe(true);
    certifyButton()?.click();

    expect(certifyKbis).not.toHaveBeenCalled();
  });

  it('envoie la date saisie', async () => {
    const { setDate, certifyButton, certifyKbis, fixture } = setup();
    const issuedOn = parisToday();

    setDate(issuedOn);
    certifyButton()?.click();
    await fixture.whenStable();

    expect(certifyKbis).toHaveBeenCalledWith(issuedOn);
  });

  it('n’avertit pas pour un extrait du jour', () => {
    const { setDate, host } = setup();

    setDate(parisToday());

    expect(host.querySelector('[data-kbis-aging]')).toBeNull();
  });

  it('avertit au-delà de 3 mois, sans bloquer', async () => {
    const { setDate, host, certifyButton, certifyKbis, fixture } = setup();

    setDate(yearsAgo(2));

    expect(host.querySelector('[data-kbis-aging]')?.textContent).toContain(
      'Vous pouvez certifier quand même',
    );
    expect(certifyButton()?.disabled).toBe(false);
    certifyButton()?.click();
    await fixture.whenStable();
    expect(certifyKbis).toHaveBeenCalledWith(yearsAgo(2));
  });

  it('affiche le refus du serveur dans le geste', async () => {
    const { setDate, host, certifyButton, fixture } = setup(
      'La date de délivrance ne peut pas être dans le futur.',
    );

    setDate(parisToday());
    certifyButton()?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector('[data-kbis-refusal]')?.textContent).toContain(
      'ne peut pas être dans le futur',
    );
  });

  it('Annuler referme le geste', () => {
    const { host, facade } = setup();

    host.querySelector<HTMLButtonElement>('button')?.click();

    expect(facade.certifyingKbis()).toBe(false);
  });
});
