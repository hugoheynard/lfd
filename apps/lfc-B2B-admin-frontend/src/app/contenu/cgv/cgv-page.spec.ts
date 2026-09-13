import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideFoldInlineConfirmLabels } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import type {
  SalesTermsHeading,
  SalesTermsParagraph,
  SalesTermsParagraphCreated,
  SalesTermsParagraphPayload,
  SalesTermsView,
} from '@lfd/contracts';

import { NotifyService } from '../../notify.service';
import { PlatformContentService } from '../platform-content.service';
import { CgvPage } from './cgv-page';

/**
 * Ce que ces cas tiennent, et que ni `tsc` ni le build AOT ne peuvent dire :
 *
 * - **les écritures ne rendent rien**, donc l'écran doit RELIRE derrière chaque
 *   geste. Un écran qui recoudrait sa vue de son côté paraîtrait juste jusqu'au
 *   jour où un autre rédacteur enregistre en même temps ;
 * - **un article naît dans les trois langues** : le bouton d'ajout ne s'arme
 *   qu'une fois les trois écrites, et le formulaire les montre ensemble AVANT
 *   la saisie — c'est le seul endroit où la règle est apprise sans refus ;
 * - **la suppression est gardée sur place** : la corbeille seule n'écrit rien.
 */

function prose(mark: string): SalesTermsParagraphPayload {
  return {
    fr: { title: `Titre ${mark} FR`, body: `Corps ${mark} FR` },
    en: { title: `Titre ${mark} EN`, body: `Corps ${mark} EN` },
    it: { title: `Titre ${mark} IT`, body: `Corps ${mark} IT` },
  };
}

function paragraph(id: string, mark: string): SalesTermsParagraph {
  return { id, ...prose(mark) };
}

class FakeContent {
  reads = 0;
  moved: readonly [string, number][] = [];
  removed: string[] = [];
  added: SalesTermsParagraphPayload[] = [];
  renamed: SalesTermsHeading[] = [];
  edited: readonly [string, SalesTermsParagraphPayload][] = [];
  failRead = false;

  view: SalesTermsView = {
    content: {
      title: { fr: 'Conditions FR', en: 'Conditions EN', it: 'Conditions IT' },
      paragraphs: [paragraph('p1', 'un'), paragraph('p2', 'deux')],
    },
    revision: 3,
    updatedAt: '2026-09-13T09:00:00.000Z',
    updatedBy: 'Hugo',
  };

  async salesTerms(): Promise<SalesTermsView> {
    this.reads += 1;
    if (this.failRead) {
      throw new Error('lecture refusée');
    }
    return this.view;
  }

  async renameSalesTerms(title: SalesTermsHeading): Promise<void> {
    this.renamed = [...this.renamed, title];
  }

  async addSalesTermsParagraph(
    payload: SalesTermsParagraphPayload,
  ): Promise<SalesTermsParagraphCreated> {
    this.added = [...this.added, payload];
    return { id: 'p3' };
  }

  async editSalesTermsParagraph(id: string, payload: SalesTermsParagraphPayload): Promise<void> {
    this.edited = [...this.edited, [id, payload]];
  }

  async removeSalesTermsParagraph(id: string): Promise<void> {
    this.removed = [...this.removed, id];
  }

  async moveSalesTermsParagraph(id: string, position: number): Promise<void> {
    this.moved = [...this.moved, [id, position]];
  }
}

/** Les toasts ne sont pas le sujet : on les tait pour lire l'écran. */
class SilentNotify {
  success(): void {}
  info(): void {}
  error(): void {}
  refused(): void {}
}

async function render(api: FakeContent): Promise<ComponentFixture<CgvPage>> {
  TestBed.configureTestingModule({
    imports: [CgvPage],
    providers: [
      { provide: PlatformContentService, useValue: api },
      { provide: NotifyService, useClass: SilentNotify },
      // Les mêmes libellés qu'au démarrage de l'app : sans eux, fold demande
      // « Confirm » en anglais, et le test lirait un écran que personne n'a.
      provideFoldInlineConfirmLabels({ confirm: 'Confirmer', cancel: 'Annuler' }),
      provideRouter([]),
    ],
  });
  const fixture: ComponentFixture<CgvPage> = TestBed.createComponent(CgvPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<CgvPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const text = (fixture: ComponentFixture<CgvPage>): string => host(fixture).textContent ?? '';

/** Un bouton désigné par son libellé OU par son nom accessible. */
function button(fixture: ComponentFixture<CgvPage>, label: string): HTMLButtonElement {
  const found = [...host(fixture).querySelectorAll('button')].find((candidate) => {
    const aria = candidate.getAttribute('aria-label') ?? '';
    return (candidate.textContent ?? '').includes(label) || aria.includes(label);
  });
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`Bouton « ${label} » introuvable.`);
  }
  return found;
}

async function click(fixture: ComponentFixture<CgvPage>, label: string): Promise<void> {
  button(fixture, label).click();
  await fixture.whenStable();
  fixture.detectChanges();
}

function fill(control: Element | null, value: string): void {
  if (!(control instanceof HTMLInputElement) && !(control instanceof HTMLTextAreaElement)) {
    throw new Error('Champ introuvable.');
  }
  control.value = value;
  control.dispatchEvent(new Event('input'));
}

describe('CgvPage', () => {
  it('numérote les articles dans l’ordre de lecture et suit la langue choisie', async () => {
    const api = new FakeContent();
    const fixture = await render(api);

    expect(text(fixture)).toContain('1. Titre un FR');
    expect(text(fixture)).toContain('2. Titre deux FR');
    expect(text(fixture)).toContain('Corps un FR');

    const toggle = host(fixture).querySelector('fold-view-toggle');
    const english = [...(toggle?.querySelectorAll('button') ?? [])].find(
      (candidate) => (candidate.textContent ?? '').trim() === 'EN',
    );
    english?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture)).toContain('1. Titre un EN');
    expect(text(fixture)).not.toContain('Corps un FR');
  });

  it('dit la règle des trois langues avant la saisie, et n’arme le bouton qu’une fois les trois écrites', async () => {
    const api = new FakeContent();
    const fixture = await render(api);

    // La règle est lisible AVANT d'ouvrir le formulaire.
    expect(text(fixture)).toContain('trois langues à la fois');

    await click(fixture, 'Écrire un article dans les trois langues');

    // Les trois blocs sont ouverts ensemble : la forme dit la contrainte.
    expect(text(fixture)).toContain('Français');
    expect(text(fixture)).toContain('English');
    expect(text(fixture)).toContain('Italiano');

    const fieldsets = [...host(fixture).querySelectorAll('.languages fold-fieldset')];
    expect(fieldsets).toHaveLength(3);

    expect(button(fixture, 'Ajouter l’article').disabled).toBe(true);

    // Deux langues sur trois : toujours désarmé, et l'écran NOMME ce qui manque.
    fieldsets.slice(0, 2).forEach((block, index) => {
      fill(block.querySelector('input'), `T${index}`);
      fill(block.querySelector('textarea'), `C${index}`);
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture)).toContain('Encore à écrire : Italiano');
    expect(button(fixture, 'Ajouter l’article').disabled).toBe(true);

    fill(fieldsets[2]?.querySelector('input') ?? null, 'T2');
    fill(fieldsets[2]?.querySelector('textarea') ?? null, 'C2');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(button(fixture, 'Ajouter l’article').disabled).toBe(false);

    const readsBefore = api.reads;
    await click(fixture, 'Ajouter l’article');

    expect(api.added).toHaveLength(1);
    expect(api.added[0]?.it).toEqual({ title: 'T2', body: 'C2' });
    // L'écriture ne rend rien : l'écran relit.
    expect(api.reads).toBe(readsBefore + 1);
  });

  it('déplace un article par son rang, puis relit', async () => {
    const api = new FakeContent();
    const fixture = await render(api);
    const readsBefore = api.reads;

    await click(fixture, 'Descendre d’un rang');

    expect(api.moved).toEqual([['p1', 1]]);
    expect(api.reads).toBe(readsBefore + 1);
  });

  it('la corbeille seule ne supprime rien — il faut confirmer sur place', async () => {
    const api = new FakeContent();
    const fixture = await render(api);

    await click(fixture, 'Supprimer');
    expect(api.removed).toEqual([]);

    await click(fixture, 'Confirmer');
    expect(api.removed).toEqual(['p1']);
  });

  it('ne réécrit que la langue affichée, et rend les deux autres intactes', async () => {
    const api = new FakeContent();
    const fixture = await render(api);

    await click(fixture, 'Modifier cet article');
    // Le seul champ long ouvert : la saisie d'ajout est fermée.
    fill(host(fixture).querySelector('fold-textarea textarea'), 'Corps corrigé');
    await fixture.whenStable();
    fixture.detectChanges();

    await click(fixture, 'Enregistrer cette langue');

    expect(api.edited).toHaveLength(1);
    const [id, payload] = api.edited[0] ?? ['', prose('x')];
    expect(id).toBe('p1');
    expect(payload.fr.body).toBe('Corps corrigé');
    expect(payload.en).toEqual({ title: 'Titre un EN', body: 'Corps un EN' });
  });

  it('une lecture en échec ouvre l’état d’alerte, avec le seul geste qui reste', async () => {
    const api = new FakeContent();
    api.failRead = true;

    const fixture = await render(api);

    expect(host(fixture).querySelector('fold-empty-state')).not.toBeNull();
    expect(text(fixture)).toContain('Conditions illisibles');

    api.failRead = false;
    await click(fixture, 'Réessayer');

    expect(text(fixture)).toContain('1. Titre un FR');
  });

  it('une écriture passée dont la relecture échoue laisse le document et le dit', async () => {
    const api = new FakeContent();
    const fixture = await render(api);

    api.failRead = true;
    await click(fixture, 'Descendre d’un rang');

    expect(api.moved).toHaveLength(1);
    expect(text(fixture)).toContain('peut dater');
    // Le contenu reste à l'écran : c'est un échec PARTIEL.
    expect(text(fixture)).toContain('1. Titre un FR');
  });
});
