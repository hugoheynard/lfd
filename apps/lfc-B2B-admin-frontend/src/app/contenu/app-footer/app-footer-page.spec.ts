import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { FooterContent, FooterContentView } from '@lfd/contracts';
import { DEFAULT_FOOTER_CONTENT } from '@lfd/contracts/content-values';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../notify.service';
import { PlatformContentService } from '../platform-content.service';
import { AppFooterPage } from './app-footer-page';

/**
 * Ce que ces cas tiennent, et que ni `tsc` ni le build AOT ne peuvent dire :
 *
 * - **une mention décochée part à `false`** — le bandeau se règle en base, pas
 *   dans un rendu qui devinerait ;
 * - **les mentions ne se SAISISSENT plus** : le retour des libellés libres
 *   rouvrirait la porte à une mention qui n'existe pas, orthographiée
 *   autrement d'une langue à l'autre ;
 * - **`legal.links` repart tel quel**. Il est déprécié mais toujours SERVI et
 *   toujours `min(1)` : un écran qui cesserait de le renvoyer verrait chaque
 *   enregistrement refusé, et rien dans le formulaire ne le montrerait.
 */

function view(content: FooterContent = DEFAULT_FOOTER_CONTENT): FooterContentView {
  return {
    content,
    revision: 4,
    updatedAt: '2026-09-13T09:00:00.000Z',
    updatedBy: 'Hugo',
  };
}

class FakeContent {
  readonly saved: FooterContent[] = [];
  read: FooterContentView = view();

  footer(): Promise<FooterContentView> {
    return Promise.resolve(this.read);
  }

  saveFooter(content: FooterContent): Promise<FooterContentView> {
    this.saved.push(content);
    return Promise.resolve(view(content));
  }

  /**
   * L'écran lit AUSSI le titre des CGV — pour que l'aperçu nomme cette ligne
   * comme le client la verra, et non avec le mot de secours.
   *
   * Le double le refuse ici : la lecture est délibérément tolérante, et c'est
   * ce qu'il faut éprouver — un titre illisible ne doit pas empêcher d'éditer
   * le pied de page.
   */
  salesTerms(): Promise<never> {
    return Promise.reject(new Error('titre des CGV indisponible'));
  }
}

class FakeNotify {
  readonly errors: unknown[] = [];
  readonly successes: string[] = [];
  success(message: string): void {
    this.successes.push(message);
  }
  error(error: unknown): void {
    this.errors.push(error);
  }
}

async function render(api: FakeContent = new FakeContent()) {
  TestBed.configureTestingModule({
    imports: [AppFooterPage],
    providers: [
      { provide: PlatformContentService, useValue: api },
      { provide: NotifyService, useValue: new FakeNotify() },
    ],
  });
  const fixture: ComponentFixture<AppFooterPage> = TestBed.createComponent(AppFooterPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, api };
}

/** On passe par le DOM : les membres sont `protected`, et c'est le gabarit qui
 *  câble les cases — ce que `tsc` ne lit pas. */
function checkboxNamed(fixture: ComponentFixture<AppFooterPage>, label: string): HTMLInputElement {
  const host = [...fixture.nativeElement.querySelectorAll('fold-checkbox')].find(
    (node): node is HTMLElement =>
      node instanceof HTMLElement && (node.textContent ?? '').includes(label),
  );
  const input = host?.querySelector('input');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Case « ${label} » introuvable.`);
  }
  return input;
}

async function save(fixture: ComponentFixture<AppFooterPage>): Promise<void> {
  const button = [...fixture.nativeElement.querySelectorAll('button')].find(
    (node): node is HTMLButtonElement =>
      node instanceof HTMLButtonElement && (node.textContent ?? '').includes('Enregistrer'),
  );
  button?.click();
  await fixture.whenStable();
  fixture.detectChanges();
}

const labels = (fixture: ComponentFixture<AppFooterPage>): readonly string[] =>
  [...fixture.nativeElement.querySelectorAll('fold-checkbox')].map((node) =>
    node instanceof HTMLElement ? (node.textContent ?? '').trim() : '',
  );

describe('AppFooterPage — les mentions légales', () => {
  it('propose une case par mention du vocabulaire, dans son ordre', async () => {
    const { fixture } = await render();

    const shown = labels(fixture);
    expect(shown).toHaveLength(5);
    expect(shown[0]).toContain('Mentions légales');
    expect(shown[1]).toContain('Conditions générales de vente');
    expect(shown[2]).toContain('Confidentialité');
    expect(shown[3]).toContain('Cookies');
    expect(shown[4]).toContain('Accessibilité');
  });

  it('dit que le libellé des CGV se change dans l’écran CGV', async () => {
    const { fixture } = await render();

    expect(fixture.nativeElement.textContent).toContain('écran CGV');
  });

  it('enregistre à false la mention décochée, et elle seule', async () => {
    const { fixture, api } = await render();

    checkboxNamed(fixture, 'Cookies').click();
    fixture.detectChanges();
    await save(fixture);

    expect(api.saved).toHaveLength(1);
    expect(api.saved[0]?.legalMentions).toEqual({
      legalNotice: true,
      salesTerms: true,
      privacy: true,
      cookies: false,
      accessibility: true,
    });
  });

  /**
   * Régression à venir : `legal.links` est déprécié, plus rendu ni édité — mais
   * toujours servi et toujours `min(1)`. Le laisser tomber du brouillon ferait
   * refuser TOUT enregistrement, sans qu'aucun champ à l'écran ne le dise.
   */
  it('renvoie `legal.links` tel quel bien qu’il ne soit plus édité', async () => {
    const { fixture, api } = await render();

    await save(fixture);

    expect(api.saved[0]?.fr.legal.links).toEqual(DEFAULT_FOOTER_CONTENT.fr.legal.links);
    expect(api.saved[0]?.en.legal.links).toEqual(DEFAULT_FOOTER_CONTENT.en.legal.links);
    expect(api.saved[0]?.it.legal.links).toEqual(DEFAULT_FOOTER_CONTENT.it.legal.links);
  });

  it('n’offre plus aucun champ de libellé de mention', async () => {
    const { fixture } = await render();

    const fieldLabels = [...fixture.nativeElement.querySelectorAll('fold-input')].map((node) =>
      node instanceof HTMLElement ? (node.textContent ?? '') : '',
    );
    expect(fieldLabels.some((text) => text.includes('Mention '))).toBe(false);
  });
});
