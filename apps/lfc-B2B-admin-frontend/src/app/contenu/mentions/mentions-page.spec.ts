import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideFoldInlineConfirmLabels } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import type {
  LegalDocumentHeading,
  LegalDocumentParagraph,
  LegalDocumentParagraphCreated,
  LegalDocumentParagraphPayload,
  LegalDocumentView,
  LegalMention,
} from '@lfd/contracts';

import { NotifyService } from '../../notify.service';
import { PlatformContentService } from '../platform-content.service';
import { MentionsPage } from './mentions-page';

/**
 * Ce que ces cas tiennent, et que ni `tsc` ni le build AOT ne peuvent dire :
 *
 * - **les écritures ne rendent rien**, donc l'écran doit RELIRE derrière chaque
 *   geste. Un écran qui recoudrait sa vue de son côté paraîtrait juste jusqu'au
 *   jour où un autre rédacteur enregistre en même temps ;
 * - **un article naît dans les trois langues** : le bouton d'ajout ne s'arme
 *   qu'une fois les trois écrites, et le formulaire les montre ensemble AVANT
 *   la saisie — c'est le seul endroit où la règle est apprise sans refus ;
 * - **la suppression est gardée sur place** : la corbeille seule n'écrit rien ;
 * - 🔴 **l'écran sert SA mention** — celle de son segment de route. Un écran
 *   qui l'ignorerait servirait le même document sous les cinq entrées de menu,
 *   et une mention inventée dans l'URL n'ouvre aucun appel.
 */

function prose(mark: string): LegalDocumentParagraphPayload {
  return {
    fr: { title: `Titre ${mark} FR`, body: `Corps ${mark} FR` },
    en: { title: `Titre ${mark} EN`, body: `Corps ${mark} EN` },
    it: { title: `Titre ${mark} IT`, body: `Corps ${mark} IT` },
  };
}

function paragraph(id: string, mark: string): LegalDocumentParagraph {
  return { id, ...prose(mark) };
}

/** Un document dont le titre ET les articles nomment leur mention. */
function legalView(name: string, mark: string): LegalDocumentView {
  return {
    content: {
      title: { fr: `${name} FR`, en: `${name} EN`, it: `${name} IT` },
      paragraphs: [paragraph('p1', `${mark} un`), paragraph('p2', `${mark} deux`)],
    },
    revision: 3,
    updatedAt: '2026-09-13T09:00:00.000Z',
    updatedBy: 'Hugo',
  };
}

class FakeContent {
  reads: LegalMention[] = [];
  moved: readonly [LegalMention, string, number][] = [];
  removed: readonly [LegalMention, string][] = [];
  added: readonly [LegalMention, LegalDocumentParagraphPayload][] = [];
  renamed: readonly [LegalMention, LegalDocumentHeading][] = [];
  edited: readonly [LegalMention, string, LegalDocumentParagraphPayload][] = [];
  failRead = false;

  /**
   * Un document PAR mention, et c'est tout le sujet du lot : deux entrées de
   * menu ne doivent pas éditer le même document. Un double à un seul document
   * aurait laissé passer un écran qui ignore son segment de route.
   */
  readonly views: Readonly<Record<LegalMention, LegalDocumentView>> = {
    legalNotice: legalView('Mentions', 'ml'),
    salesTerms: legalView('Conditions', 'cgv'),
    privacy: legalView('Confidentialité', 'conf'),
    cookies: legalView('Cookies', 'ck'),
    accessibility: legalView('Accessibilité', 'acc'),
  };

  async legalDocument(mention: LegalMention): Promise<LegalDocumentView> {
    this.reads = [...this.reads, mention];
    if (this.failRead) {
      throw new Error('lecture refusée');
    }
    return this.views[mention];
  }

  async renameLegalDocument(mention: LegalMention, title: LegalDocumentHeading): Promise<void> {
    this.renamed = [...this.renamed, [mention, title]];
  }

  async addLegalParagraph(
    mention: LegalMention,
    payload: LegalDocumentParagraphPayload,
  ): Promise<LegalDocumentParagraphCreated> {
    this.added = [...this.added, [mention, payload]];
    return { id: 'p3' };
  }

  async editLegalParagraph(
    mention: LegalMention,
    id: string,
    payload: LegalDocumentParagraphPayload,
  ): Promise<void> {
    this.edited = [...this.edited, [mention, id, payload]];
  }

  async removeLegalParagraph(mention: LegalMention, id: string): Promise<void> {
    this.removed = [...this.removed, [mention, id]];
  }

  async moveLegalParagraph(mention: LegalMention, id: string, position: number): Promise<void> {
    this.moved = [...this.moved, [mention, id, position]];
  }
}

/** Les toasts ne sont pas le sujet : on les tait pour lire l'écran. */
class SilentNotify {
  success(): void {}
  info(): void {}
  error(): void {}
  refused(): void {}
}

async function render(
  api: FakeContent,
  mention = 'salesTerms',
): Promise<ComponentFixture<MentionsPage>> {
  TestBed.configureTestingModule({
    imports: [MentionsPage],
    providers: [
      { provide: PlatformContentService, useValue: api },
      { provide: NotifyService, useClass: SilentNotify },
      // Les mêmes libellés qu'au démarrage de l'app : sans eux, fold demande
      // « Confirm » en anglais, et le test lirait un écran que personne n'a.
      provideFoldInlineConfirmLabels({ confirm: 'Confirmer', cancel: 'Annuler' }),
      provideRouter([]),
    ],
  });
  const fixture: ComponentFixture<MentionsPage> = TestBed.createComponent(MentionsPage);
  // Le segment de route arrive par `withComponentInputBinding` dans l'app ; ici
  // on le pose à la main, c'est la MÊME entrée.
  fixture.componentRef.setInput('mention', mention);
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}

/**
 * Laisse la lecture aboutir, puis rend.
 *
 * DEUX tours et non un : la lecture part d'un `effect` sur le segment de route,
 * et sa chaîne de promesses est d'un cran plus profonde que lorsqu'elle partait
 * du constructeur. Un seul `whenStable` rendait l'écran encore en `fold-loading`
 * — un test vert-puis-rouge pour une raison qui ne se lit pas dans l'assertion.
 */
async function settle(fixture: ComponentFixture<MentionsPage>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

const host = (fixture: ComponentFixture<MentionsPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const text = (fixture: ComponentFixture<MentionsPage>): string => host(fixture).textContent ?? '';

/** Un bouton désigné par son libellé OU par son nom accessible. */
function button(fixture: ComponentFixture<MentionsPage>, label: string): HTMLButtonElement {
  const found = [...host(fixture).querySelectorAll('button')].find((candidate) => {
    const aria = candidate.getAttribute('aria-label') ?? '';
    return (candidate.textContent ?? '').includes(label) || aria.includes(label);
  });
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`Bouton « ${label} » introuvable.`);
  }
  return found;
}

async function click(fixture: ComponentFixture<MentionsPage>, label: string): Promise<void> {
  button(fixture, label).click();
  await settle(fixture);
}

function fill(control: Element | null, value: string): void {
  if (!(control instanceof HTMLInputElement) && !(control instanceof HTMLTextAreaElement)) {
    throw new Error('Champ introuvable.');
  }
  control.value = value;
  control.dispatchEvent(new Event('input'));
}

describe('MentionsPage', () => {
  it('numérote les articles dans l’ordre de lecture et suit la langue choisie', async () => {
    const api = new FakeContent();
    const fixture = await render(api);

    expect(text(fixture)).toContain('1. Titre cgv un FR');
    expect(text(fixture)).toContain('2. Titre cgv deux FR');
    expect(text(fixture)).toContain('Corps cgv un FR');

    const toggle = host(fixture).querySelector('fold-view-toggle');
    const english = [...(toggle?.querySelectorAll('button') ?? [])].find(
      (candidate) => (candidate.textContent ?? '').trim() === 'EN',
    );
    english?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture)).toContain('1. Titre cgv un EN');
    expect(text(fixture)).not.toContain('Corps cgv un FR');
  });

  /**
   * 🔴 Le cœur du lot : un SEUL écran pour les cinq mentions. Un composant qui
   * ignorerait son segment de route servirait le même document sous cinq
   * entrées de menu, et rien dans le typecheck ni le build ne le dirait.
   */
  it('lit le document de SA mention, et son titre est celui du contrat', async () => {
    const api = new FakeContent();
    const fixture = await render(api, 'privacy');

    expect(api.reads).toEqual(['privacy']);
    expect(text(fixture)).toContain('Confidentialité');
    expect(text(fixture)).toContain('1. Titre conf un FR');
    expect(text(fixture)).not.toContain('Titre cgv un FR');
  });

  it('deux mentions n’éditent pas le même document', async () => {
    const first = await render(new FakeContent(), 'legalNotice');
    expect(text(first)).toContain('1. Titre ml un FR');

    TestBed.resetTestingModule();

    const other = new FakeContent();
    const second = await render(other, 'cookies');

    expect(text(second)).toContain('1. Titre ck un FR');
    expect(text(second)).not.toContain('Titre ml un FR');

    await click(second, 'Descendre d’un rang');
    expect(other.moved).toEqual([['cookies', 'p1', 1]]);
  });

  /**
   * Une mention hors vocabulaire n'appelle RIEN : une clé libre ouvrirait un
   * bloc de contenu que le pied de page ne peut pas cocher et que personne ne
   * saurait retrouver.
   */
  it('refuse une mention inventée sans rien demander au serveur', async () => {
    const api = new FakeContent();
    const fixture = await render(api, 'conditions-speciales');

    expect(api.reads).toEqual([]);
    expect(host(fixture).querySelector('fold-empty-state')).not.toBeNull();
    expect(text(fixture)).toContain('Mention inconnue');
  });

  it('dit la règle des trois langues avant la saisie, et n’arme le bouton qu’une fois les trois écrites', async () => {
    const api = new FakeContent();
    const fixture = await render(api, 'accessibility');

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

    const readsBefore = api.reads.length;
    await click(fixture, 'Ajouter l’article');

    expect(api.added).toHaveLength(1);
    // L'ajout porte la mention de l'écran, et elle seule.
    expect(api.added[0]?.[0]).toBe('accessibility');
    expect(api.added[0]?.[1].it).toEqual({ title: 'T2', body: 'C2' });
    // L'écriture ne rend rien : l'écran relit.
    expect(api.reads).toHaveLength(readsBefore + 1);
  });

  it('déplace un article par son rang, puis relit', async () => {
    const api = new FakeContent();
    const fixture = await render(api);
    const readsBefore = api.reads.length;

    await click(fixture, 'Descendre d’un rang');

    expect(api.moved).toEqual([['salesTerms', 'p1', 1]]);
    expect(api.reads).toHaveLength(readsBefore + 1);
  });

  it('la corbeille seule ne supprime rien — il faut confirmer sur place', async () => {
    const api = new FakeContent();
    const fixture = await render(api);

    await click(fixture, 'Supprimer');
    expect(api.removed).toEqual([]);

    await click(fixture, 'Confirmer');
    expect(api.removed).toEqual([['salesTerms', 'p1']]);
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
    const [mention, id, payload] = api.edited[0] ?? ['salesTerms', '', prose('x')];
    expect(mention).toBe('salesTerms');
    expect(id).toBe('p1');
    expect(payload.fr.body).toBe('Corps corrigé');
    expect(payload.en).toEqual({ title: 'Titre cgv un EN', body: 'Corps cgv un EN' });
  });

  it('une lecture en échec ouvre l’état d’alerte, avec le seul geste qui reste', async () => {
    const api = new FakeContent();
    api.failRead = true;

    const fixture = await render(api);

    expect(host(fixture).querySelector('fold-empty-state')).not.toBeNull();
    expect(text(fixture)).toContain('Document illisible');

    api.failRead = false;
    await click(fixture, 'Réessayer');

    expect(text(fixture)).toContain('1. Titre cgv un FR');
  });

  it('une écriture passée dont la relecture échoue laisse le document et le dit', async () => {
    const api = new FakeContent();
    const fixture = await render(api);

    api.failRead = true;
    await click(fixture, 'Descendre d’un rang');

    expect(api.moved).toHaveLength(1);
    expect(text(fixture)).toContain('peut dater');
    // Le contenu reste à l'écran : c'est un échec PARTIEL.
    expect(text(fixture)).toContain('1. Titre cgv un FR');
  });
});
