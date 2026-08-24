import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { PricingJournalEntryView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { JournalPanel, type JournalPanelData } from '../journal-panel/journal-panel';
import { TarificationService } from '../tarification.service';

/**
 * **Le journal, tel qu'il se lit.**
 *
 * Ce que ces cas protègent : la phrase affichée est celle **figée à l'écriture**
 * (jamais un rendu de l'état courant), le motif est cité quand il existe, et un
 * journal vide se dit au lieu de laisser un blanc.
 */

const DATA: JournalPanelData = {
  subjectType: 'rule',
  subjectId: 'rule_1',
  target: 'Promo de rentrée',
};

function entry(overrides: Partial<PricingJournalEntryView> = {}): PricingJournalEntryView {
  return {
    id: 'evt_1',
    subjectType: 'rule',
    subjectId: 'rule_1',
    act: 'paused',
    actor: 'auth0|marc',
    occurredAt: '2026-08-12T14:05:00.000Z',
    reason: null,
    summary: 'Promotion « Promo de rentrée » · −10 % · tout le catalogue, tous clients',
    ...overrides,
  };
}

function mount(entries: PricingJournalEntryView[]): ComponentFixture<JournalPanel> {
  const service: Pick<TarificationService, 'journalFor'> = {
    journalFor: () => Promise.resolve(entries),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: TarificationService, useValue: service },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
      { provide: FoldPanelRef, useValue: { close: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(JournalPanel);
  fixture.componentRef.setInput('data', DATA);
  fixture.detectChanges();
  return fixture;
}

async function settled(fixture: ComponentFixture<JournalPanel>): Promise<string> {
  await fixture.whenStable();
  fixture.detectChanges();
  return String(fixture.nativeElement.textContent ?? '');
}

describe('lire le journal', () => {
  it('rend le verbe dans les mots de la maison', async () => {
    expect(await settled(mount([entry()]))).toContain('Suspendue');
  });

  /**
   * La phrase vient du journal, pas de l'état courant : c'est ce qui permet de
   * lire un acte dont la règle a été archivée depuis.
   */
  it("affiche la phrase figée au moment de l'acte", async () => {
    const text = await settled(mount([entry({ summary: 'Promotion « Vieux nom » · −25 %' })]));

    expect(text).toContain('Vieux nom');
  });

  it("cite le motif quand quelqu'un en a écrit un", async () => {
    const text = await settled(mount([entry({ reason: 'Four en panne' })]));

    expect(text).toContain('Four en panne');
  });

  it("nomme l'auteur de l'acte", async () => {
    expect(await settled(mount([entry()]))).toContain('auth0|marc');
  });

  /**
   * L'heure compte, à la différence d'une date de validité : « suspendue à
   * 16 h 05 » répond à « pourquoi la commande de 16 h 10 n'a pas eu la remise ».
   */
  it("donne le jour ET l'heure", async () => {
    expect(await settled(mount([entry()]))).toMatch(/\d{2}:\d{2}/);
  });

  /**
   * Un journal vide n'est pas une erreur : c'est une décision antérieure au
   * journal. Le dire vaut mieux qu'un blanc que le lecteur prendrait pour un bug.
   */
  it('explique un journal vide au lieu de laisser un blanc', async () => {
    expect(await settled(mount([]))).toContain('Aucun acte enregistré');
  });
});
