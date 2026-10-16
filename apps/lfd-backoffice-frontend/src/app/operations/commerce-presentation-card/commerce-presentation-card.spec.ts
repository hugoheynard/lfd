import { TestBed } from '@angular/core/testing';
import type { EditCommerceOperationPayload } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { commerceOperation } from '../commerce-operation.testing';
import { CommerceOperationsService } from '../commerce-operations.service';
import { CommercePresentationCard } from './commerce-presentation-card';

function setup(edit: (key: string, payload: EditCommerceOperationPayload) => Promise<unknown>) {
  const sent: EditCommerceOperationPayload[] = [];
  const opened: unknown[] = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: CommerceOperationsService,
        useValue: {
          editPresentation: (key: string, payload: EditCommerceOperationPayload) => {
            sent.push(payload);
            return edit(key, payload);
          },
        },
      },
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (_component: unknown, config: unknown) => {
            opened.push(config);
            return { closed: Promise.resolve('https://cdn.test/stollen.jpg') };
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CommercePresentationCard);
  fixture.componentRef.setInput('operation', commerceOperation());
  fixture.detectChanges();
  return { fixture, card: fixture.componentInstance, sent, opened };
}

describe('CommercePresentationCard', () => {
  it("rien à enregistrer tant que la saisie ne diffère pas de l'enregistré", () => {
    const { card } = setup(async () => ({}));
    expect(card['changed']()).toBe(false);
    card['setLede']('en', 'The yule log.');
    expect(card['changed']()).toBe(true);
  });

  it("une image choisie n'envoie que son adresse : le texte alternatif reste à la médiathèque", async () => {
    const { card, sent, opened } = setup(async () => ({}));
    card['chooseImage']();
    await Promise.resolve();
    expect(opened).toEqual([{ data: { currentUrl: 'https://cdn.test/noel.jpg' } }]);
    expect(card['imageUrl']()).toBe('https://cdn.test/stollen.jpg');
    await card['save']();
    expect(sent[0]).toEqual({
      name: { fr: 'Noël 2026' },
      lede: { fr: 'La bûche, le panettone et le stollen.' },
      image: { url: 'https://cdn.test/stollen.jpg' },
    });
  });

  it('retirer le nom français ferme Enregistrer', () => {
    const { card } = setup(async () => ({}));
    card['setName']('fr', '  ');
    expect(card['changed']()).toBe(false);
    expect(card['nameMissing']()).toBe(true);
  });

  it('dit le refus du serveur tel quel', async () => {
    const { card } = setup(async () => {
      throw { status: 409, error: { code: 'operations.archived', message: 'Archivée.' } };
    });
    card['removeImage']();
    await card['save']();
    expect(card['refusal']()).toBe('Archivée.');
  });

  it("verrouillée, elle n'offre ni Enregistrer ni le choix d'image", () => {
    const { fixture } = setup(async () => ({}));
    fixture.componentRef.setInput('locked', true);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).not.toContain('Enregistrer');
    expect(root.textContent).not.toContain('Changer d’image');
  });
});
