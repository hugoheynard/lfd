import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { SendPanel, type SendPanelData } from './send-panel';

/**
 * Ce que ce panneau promet :
 *
 * - **rien ne part sans nom** — c'est lui qui rend une révision relisible, et
 *   son absence est la cause directe des ancres muettes ;
 * - **la note reste facultative** : un envoi de routine se nomme en cinq mots
 *   et n'a rien de plus à dire. La rendre obligatoire ferait écrire « RAS »
 *   quatre-vingt-dix fois ;
 * - **une note vide n'est pas une note** : elle remonte à `null`, faute de quoi
 *   la base porterait une chaîne vide qu'on ne distinguerait plus d'un silence.
 */
function render(data: SendPanelData = { entering: 2, changing: 1, removing: 0 }) {
  const close = vi.fn();
  TestBed.configureTestingModule({
    imports: [SendPanel],
    providers: [{ provide: FoldPanelRef, useValue: { close } }],
  });
  const fixture = TestBed.createComponent(SendPanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();

  const host = fixture.nativeElement as HTMLElement;

  const fill = (selector: string, value: string): void => {
    const field = host.querySelector(selector);
    if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLTextAreaElement)) {
      throw new Error(`Champ « ${selector} » absent du panneau.`);
    }
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  const button = (label: string): HTMLButtonElement => {
    const found = [...host.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    if (found === undefined) {
      throw new Error(`Bouton « ${label} » absent du panneau.`);
    }
    return found;
  };

  return { fixture, host, fill, button, close };
}

describe('SendPanel', () => {
  it("dit ce que l'envoi va faire, avant qu'on confirme", () => {
    const { host } = render({ entering: 2, changing: 1, removing: 3 });

    const shown = (host.textContent ?? '').replace(/\s+/gu, ' ');
    expect(shown).toContain('2 entrant(s)');
    expect(shown).toContain('1 modifié(s)');
    expect(shown).toContain('3 retiré(s)');
  });

  it("n'envoie rien tant que le nom n'est pas écrit", () => {
    const { button, close } = render();

    expect(button('Envoyer').disabled).toBe(true);
    button('Envoyer').click();

    expect(close).not.toHaveBeenCalled();
  });

  it("refuse un nom fait d'espaces", () => {
    const { fill, button } = render();

    fill('fold-input input', '   ');

    expect(button('Envoyer').disabled).toBe(true);
  });

  it('rend le nom seul quand la note est vide', () => {
    const { fill, button, close } = render();

    fill('fold-input input', '  hausse de la rentrée  ');
    button('Envoyer').click();

    // Le nom est ROGNÉ, et la note absente remonte à `null` : une chaîne vide
    // en base se distinguerait d'un silence, alors que c'en est un.
    expect(close).toHaveBeenCalledWith({ label: 'hausse de la rentrée', note: null });
  });

  it('rend le nom ET la note quand les deux sont écrits', () => {
    const { fill, button, close } = render();

    fill('fold-input input', 'hausse de la rentrée');
    fill('fold-textarea textarea', 'décidé avec Cécile le 8');
    button('Envoyer').click();

    expect(close).toHaveBeenCalledWith({
      label: 'hausse de la rentrée',
      note: 'décidé avec Cécile le 8',
    });
  });

  /** Renoncer est gratuit — sans quoi le panneau ne serait qu'une formalité. */
  it('referme sans rien envoyer quand on annule', () => {
    const { fill, button, close } = render();

    fill('fold-input input', 'peu importe');
    button('Annuler').click();

    expect(close).toHaveBeenCalledWith(null);
  });
});
