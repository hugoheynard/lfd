import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { AlertThresholdTier } from '@lfd/contracts';

import { ThresholdTiersField } from '../threshold-tiers-field/threshold-tiers-field';

const TIERS: AlertThresholdTier[] = [
  { upToQuantity: 2, thresholdPercent: 200 },
  { upToQuantity: 10, thresholdPercent: 100 },
  { upToQuantity: null, thresholdPercent: 25 },
];

/** Hôte minimal : le champ est piloté par son parent, comme en vrai. */
@Component({
  imports: [ThresholdTiersField],
  template: `<app-threshold-tiers-field [tiers]="tiers()" (tiersChange)="emitted.set($event)" />`,
})
class Host {
  readonly tiers = signal<AlertThresholdTier[]>(TIERS);
  readonly emitted = signal<AlertThresholdTier[] | null>(null);
}

function render() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  return { fixture, host, component: fixture.componentInstance };
}

/**
 * Le champ « jusqu'à » de chaque ligne bornée — le PREMIER de la ligne. Chaque
 * ligne en porte deux (la borne et le pourcentage) : les prendre à plat
 * compterait deux fois chaque palier.
 */
function boundInputs(host: HTMLElement): HTMLInputElement[] {
  return [...host.querySelectorAll('.tt-row:not(.tt-row--open)')]
    .map((row) => row.querySelector('input'))
    .filter((input): input is HTMLInputElement => input !== null);
}

/**
 * Saisit une valeur **et laisse Angular rendre**.
 *
 * Le rendu n'est pas cosmétique ici : `fold-number-input` propage sa valeur
 * pendant la détection de changements. Enchaîner frappe et sortie de champ sans
 * ce temps testerait une séquence qui n'arrive dans aucun navigateur — l'humain
 * ne quitte pas un champ dans la même microtâche qu'il le remplit.
 */
function type(fixture: ComponentFixture<Host>, input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  fixture.detectChanges();
}

function blur(fixture: ComponentFixture<Host>, input: HTMLInputElement): void {
  input.dispatchEvent(new Event('focusout', { bubbles: true }));
  fixture.detectChanges();
}

describe('ThresholdTiersField', () => {
  it('rend une ligne par palier borné, plus la ligne « au-delà »', () => {
    const { host } = render();

    expect(boundInputs(host)).toHaveLength(2);
    expect(host.querySelectorAll('.tt-row--open')).toHaveLength(1);
  });

  /**
   * Régression : le tri s'exécutait à chaque frappe. En effaçant « 10 » pour
   * taper « 15 », le « 1 » passait sous le seuil du voisin et la ligne sautait
   * sous le curseur.
   */
  it('ne réordonne PAS pendant la frappe', () => {
    const { fixture, host } = render();
    const [first, second] = boundInputs(host);

    type(fixture, second as HTMLInputElement, '1');

    // La deuxième ligne reste la deuxième, même avec une valeur plus petite.
    expect((first as HTMLInputElement).value).toBe('2');
    expect((second as HTMLInputElement).value).toBe('1');
  });

  /**
   * Régression : un champ vidé se remplissait instantanément (null → 1), donc
   * effacer puis retaper était impossible.
   */
  it('laisse vider un champ le temps de la saisie', () => {
    const { fixture, host } = render();
    const [, second] = boundInputs(host);

    type(fixture, second as HTMLInputElement, '');

    expect((second as HTMLInputElement).value).toBe('');
  });

  it('range et émet à la sortie du champ', () => {
    const { fixture, host, component } = render();
    const [, second] = boundInputs(host);

    type(fixture, second as HTMLInputElement, '1');
    blur(fixture, second as HTMLInputElement);

    // 1 collision avec le palier à 2 : la croissance stricte est rétablie ici
    // plutôt que découverte par un 400 du serveur.
    const emitted = component.emitted();
    expect(emitted).not.toBeNull();
    expect(emitted?.map((tier) => tier.upToQuantity)).toEqual([1, 2, null]);
  });

  it('reprend la valeur précédente quand on quitte un champ vide', () => {
    const { fixture, host, component } = render();
    const [, second] = boundInputs(host);

    type(fixture, second as HTMLInputElement, '');
    blur(fixture, second as HTMLInputElement);

    // Effacer puis quitter est une hésitation, pas une intention.
    expect(component.emitted()).toBeNull();
    expect((boundInputs(host)[1] as HTMLInputElement).value).toBe('10');
  });

  it("n'émet rien quand on traverse un champ sans rien changer", () => {
    const { fixture, host, component } = render();

    blur(fixture, boundInputs(host)[0] as HTMLInputElement);

    // Un simple passage ne doit pas marquer la règle comme modifiée.
    expect(component.emitted()).toBeNull();
  });

  it('garde toujours le palier ouvert en dernier après un ajout', () => {
    const { fixture, host, component } = render();

    const add = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Ajouter'),
    );
    add?.click();
    fixture.detectChanges();

    const emitted = component.emitted();
    expect(emitted?.[emitted.length - 1]?.upToQuantity).toBeNull();
  });
});
