import { TestBed } from '@angular/core/testing';
import type { LegalDocumentHeading } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { LegalTitleCard } from './legal-title-card';

const SAVED: LegalDocumentHeading = { fr: 'Titre', en: 'Title', it: 'Titolo' };

function setup() {
  const fixture = TestBed.createComponent(LegalTitleCard);
  fixture.componentRef.setInput('saved', SAVED);
  fixture.componentRef.setInput('locale', 'fr');
  fixture.detectChanges();
  const host: HTMLElement = fixture.nativeElement;
  const input = host.querySelector('input');
  const submitted: LegalDocumentHeading[] = [];
  fixture.componentInstance.submitted.subscribe((title) => submitted.push(title));
  const type = (value: string): void => {
    if (input instanceof HTMLInputElement) {
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    fixture.detectChanges();
  };
  const saveButton = (): HTMLButtonElement => {
    const found = [...host.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Enregistrer le titre'),
    );
    if (!(found instanceof HTMLButtonElement)) {
      throw new Error('Bouton introuvable.');
    }
    return found;
  };
  return { fixture, input, submitted, type, saveButton };
}

describe('LegalTitleCard', () => {
  it('n’arme l’enregistrement qu’une fois le titre changé et rend les trois langues', () => {
    const { submitted, type, saveButton } = setup();
    expect(saveButton().disabled).toBe(true);

    type('Nouveau titre');
    expect(saveButton().disabled).toBe(false);

    saveButton().click();
    expect(submitted).toEqual([{ ...SAVED, fr: 'Nouveau titre' }]);
  });

  /** Une relecture (après un refus pour révision périmée) ne perd pas la saisie. */
  it('garde la saisie quand le titre enregistré change sous elle', () => {
    const { fixture, input, type } = setup();
    type('En cours');

    fixture.componentRef.setInput('saved', { ...SAVED, en: 'Other' });
    fixture.detectChanges();

    expect(input instanceof HTMLInputElement ? input.value : '').toBe('En cours');
  });

  it('refuse un titre vidé dans une langue', () => {
    const { type, saveButton } = setup();
    type('   ');
    expect(saveButton().disabled).toBe(true);
  });
});
