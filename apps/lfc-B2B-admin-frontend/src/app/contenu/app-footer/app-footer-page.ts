import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type {
  ContentLocale,
  FooterContent,
  FooterLocaleContent,
  LegalIdentity,
} from '@lfd/contracts';
// Les VALEURS par `content-values`, qui ne tire pas zod (cf. le front client).
import { contentLocales, DEFAULT_FOOTER_CONTENT } from '@lfd/contracts/content-values';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { PlatformContentService } from '../platform-content.service';
import { FooterPreview } from './footer-preview/footer-preview';

/** Les trois langues en segments — le libellé court, la valeur canonique. */
const LOCALE_OPTIONS: readonly FoldViewToggleOption[] = contentLocales.map((code) => ({
  value: code,
  label: code.toUpperCase(),
}));

/** Garde de type : évite un `as` là où une vérification suffit. */
function isLocale(value: string): value is ContentLocale {
  return (contentLocales as readonly string[]).includes(value);
}

/**
 * **App footer** — les textes du pied de page de l'app cliente.
 *
 * Deux natures sur le même écran, et elles sont séparées à dessein :
 *
 * - la **copie**, sous le sélecteur de langue — quatre sections verticales puis
 *   le bandeau légal, dans l'ordre où la vitrine les empile ;
 * - l'**identité légale**, au-dessus et HORS du sélecteur — un SIRET ne se
 *   traduit pas, et le mettre sous le switch inviterait à le ressaisir trois
 *   fois.
 *
 * L'aperçu est en tête parce qu'on vient corriger un texte en le VOYANT à sa
 * place. Il montre la forme et pas la peau : ce qu'aucun formulaire ne dit,
 * c'est qu'une colonne est vide ou qu'un pitch écrase sa voisine.
 */
@Component({
  selector: 'app-app-footer-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldViewToggleComponent,
    FooterPreview,
  ],
  templateUrl: './app-footer-page.html',
  styleUrl: './app-footer-page.scss',
})
export class AppFooterPage {
  private readonly api = inject(PlatformContentService);
  private readonly notify = inject(NotifyService);

  protected readonly localeOptions = LOCALE_OPTIONS;
  protected readonly locale = signal<ContentLocale>('fr');

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);

  /**
   * La révision LUE au chargement.
   *
   * Zéro veut dire que personne n'a jamais enregistré : l'écran montre alors le
   * contenu de départ, et il faut le dire plutôt que de laisser croire que ces
   * textes ont été validés par quelqu'un.
   */
  protected readonly revision = signal(0);

  /** Le brouillon. Une seule copie mutable, dont tout le reste dérive. */
  private readonly draft = signal<FooterContent>(DEFAULT_FOOTER_CONTENT);

  protected readonly identity = computed<LegalIdentity>(() => this.draft().identity);
  protected readonly current = computed<FooterLocaleContent>(() => this.draft()[this.locale()]);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const view = await this.api.footer();
      this.draft.set(view.content);
      this.revision.set(view.revision);
    } catch (error) {
      // Le contenu de départ reste affiché : l'écran ouvre sur quelque chose
      // plutôt que sur du vide, et le message dit qu'on n'a pas lu la base.
      this.notify.error(error, 'Contenu illisible — les textes affichés sont ceux de départ.');
    } finally {
      this.loading.set(false);
    }
  }

  protected pickLocale(value: string): void {
    if (isLocale(value)) {
      this.locale.set(value);
    }
  }

  /** Écrit un champ d'identité, sans toucher au reste du brouillon. */
  protected setIdentity(field: keyof LegalIdentity, value: string): void {
    this.draft.update((draft) => ({ ...draft, identity: { ...draft.identity, [field]: value } }));
  }

  /**
   * Écrit dans la langue COURANTE.
   *
   * Le passage par une fonction plutôt que par des liaisons directes tient à
   * une chose : `draft` est la seule source, et une écriture partielle ailleurs
   * ferait diverger l'aperçu du formulaire — les deux lisent le même objet.
   */
  protected patchLocale(patch: (content: FooterLocaleContent) => FooterLocaleContent): void {
    const locale = this.locale();
    this.draft.update((draft) => ({ ...draft, [locale]: patch(draft[locale]) }));
  }

  protected setBrand(field: 'tagline' | 'pitch', value: string): void {
    this.patchLocale((content) => ({ ...content, brand: { ...content.brand, [field]: value } }));
  }

  protected setHead(section: 'houses' | 'order' | 'help', value: string): void {
    this.patchLocale((content) => ({
      ...content,
      [section]: { ...content[section], head: value },
    }));
  }

  protected setHouse(
    index: number,
    field: keyof FooterLocaleContent['houses']['items'][number],
    value: string,
  ): void {
    this.patchLocale((content) => ({
      ...content,
      houses: {
        ...content.houses,
        items: content.houses.items.map((house, i) =>
          i === index ? { ...house, [field]: value } : house,
        ),
      },
    }));
  }

  protected setLink(section: 'order' | 'help', index: number, value: string): void {
    this.patchLocale((content) => ({
      ...content,
      [section]: {
        ...content[section],
        links: content[section].links.map((link, i) => (i === index ? value : link)),
      },
    }));
  }

  protected setPhoneHours(value: string): void {
    this.patchLocale((content) => ({ ...content, help: { ...content.help, phoneHours: value } }));
  }

  protected setLegal(field: 'pay' | 'vat', value: string): void {
    this.patchLocale((content) => ({ ...content, legal: { ...content.legal, [field]: value } }));
  }

  protected setLegalLink(index: number, value: string): void {
    this.patchLocale((content) => ({
      ...content,
      legal: {
        ...content.legal,
        links: content.legal.links.map((link, i) => (i === index ? value : link)),
      },
    }));
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    try {
      const view = await this.api.saveFooter(this.draft());
      this.draft.set(view.content);
      this.revision.set(view.revision);
      this.notify.success('Pied de page enregistré, dans les trois langues.');
    } catch (error) {
      // Le message du serveur passe devant : c'est lui qui NOMME le champ
      // refusé, et le rédacteur n'a pas le schéma sous les yeux.
      this.notify.error(error, 'Enregistrement refusé — vérifiez les champs signalés.');
    } finally {
      this.saving.set(false);
    }
  }
}
