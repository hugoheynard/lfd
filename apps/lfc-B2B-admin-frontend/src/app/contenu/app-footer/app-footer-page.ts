import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type {
  ContentLocale,
  SalesTermsHeading,
  FooterContent,
  FooterLocaleContent,
  LegalIdentity,
  LegalMention,
  LegalMentionDisplay,
  SocialChannel,
} from '@lfd/contracts';
// Les VALEURS par `content-values`, qui ne tire pas zod (cf. le front client).
import {
  contentLocales,
  DEFAULT_FOOTER_CONTENT,
  legalMentionOrder,
  socialChannelLabels,
  socialChannels,
} from '@lfd/contracts/content-values';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
  FoldFieldsetComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldSelectComponent,
  FoldTextareaComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { legalMentionLabel } from '../legal-mention-label';
import { PlatformContentService } from '../platform-content.service';
import { FooterPreview } from './footer-preview/footer-preview';

/** Les trois langues en segments — le libellé court, la valeur canonique. */
const LOCALE_OPTIONS: readonly FoldViewToggleOption[] = contentLocales.map((code) => ({
  value: code,
  label: code.toUpperCase(),
}));

/** Les canaux, avec leur mot — l'ordre du contrat est celui du menu déroulant. */
const CHANNEL_OPTIONS = socialChannels.map((channel) => ({
  value: channel,
  label: socialChannelLabels[channel],
}));

/** Les champs d'identité qui sont du TEXTE — `socials` est une liste, pas une ligne. */
type IdentityTextField = Exclude<keyof LegalIdentity, 'socials'>;

/** Gardes de type : évitent un `as` là où une vérification suffit. */
function isLocale(value: string): value is ContentLocale {
  return (contentLocales as readonly string[]).includes(value);
}

function isChannel(value: string): value is SocialChannel {
  return (socialChannels as readonly string[]).includes(value);
}

/**
 * **App footer** — les textes du pied de page de l'app cliente.
 *
 * Deux natures sur le même écran, et elles sont séparées à dessein :
 *
 * - la **copie**, sous le sélecteur de langue — quatre sections verticales puis
 *   le bandeau légal, dans l'ordre où la vitrine les empile ;
 * - l'**identité légale** et les **mentions affichées**, au-dessus et HORS du
 *   sélecteur — un SIRET ne se traduit pas, et afficher une mention est une
 *   décision unique ; les ranger sous le switch inviterait à les reprendre
 *   trois fois.
 *
 * Les mentions légales ne se SAISISSENT plus : ce sont des prérequis, pas des
 * textes de vitrine. L'écran choisit celles qui s'affichent dans un vocabulaire
 * fermé, et leur mot vient du contrat.
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
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
    FoldFieldsetComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldSelectComponent,
    FoldTextareaComponent,
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
  protected readonly channelOptions = CHANNEL_OPTIONS;
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
  protected readonly legalMentions = computed<LegalMentionDisplay>(
    () => this.draft().legalMentions,
  );
  protected readonly current = computed<FooterLocaleContent>(() => this.draft()[this.locale()]);

  constructor() {
    void this.load();
  }

  /**
   * Le titre du document des CGV, dans ses trois langues — `null` tant qu'il
   * n'a pas pu être lu.
   *
   * Il suit le sélecteur de langue comme le reste de l'aperçu : un titre figé
   * sur une langue aurait montré un bandeau français sous un onglet italien.
   */
  private readonly salesTermsHeading = signal<SalesTermsHeading | null>(null);

  protected readonly salesTermsTitle = computed<string | null>(
    () => this.salesTermsHeading()?.[this.locale()] ?? null,
  );

  private async load(): Promise<void> {
    // Le titre des CGV part À CÔTÉ et non dans le même `await` : il ne sert
    // qu'à nommer une ligne de l'aperçu, et son échec ne doit pas empêcher
    // d'éditer le pied de page. Il se replie alors sur le mot de secours.
    void this.api
      .salesTerms()
      .then((view) => this.salesTermsHeading.set(view.content.title))
      .catch(() => undefined);
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

  /**
   * Le premier canal encore libre, ou `null` s'ils y sont tous.
   *
   * C'est lui qui pré-remplit une ligne ajoutée : un canal ne peut figurer
   * qu'une fois, et proposer un doublon pour le faire refuser ensuite par le
   * serveur ferait perdre la saisie de l'URL au passage.
   */
  protected readonly freeChannel = computed<SocialChannel | null>(() => {
    const taken = new Set(this.identity().socials.map((social) => social.channel));
    return socialChannels.find((channel) => !taken.has(channel)) ?? null;
  });

  /**
   * Les mentions légales à cocher — le vocabulaire FERMÉ, dans son ordre.
   *
   * Les mots viennent du contrat et non de la saisie : une mention légale ne
   * s'invente pas, elle s'affiche ou non. Ils sont montrés en français parce
   * que la case, elle, est un réglage du back-office — l'anglais et l'italien
   * sont écrits dans le contrat et suivent tout seuls.
   */
  protected readonly legalMentionRows = computed(() =>
    legalMentionOrder.map((key) => ({
      key,
      label: legalMentionLabel('fr', key),
      hint:
        key === 'salesTerms'
          ? 'Le lien porte le TITRE du document, qui se renomme dans l’écran CGV.'
          : undefined,
      shown: this.draft().legalMentions[key],
    })),
  );

  /** Affiche ou masque une mention. Le mot, lui, ne se touche pas. */
  protected setLegalMention(mention: LegalMention, shown: boolean): void {
    this.draft.update((draft) => ({
      ...draft,
      legalMentions: { ...draft.legalMentions, [mention]: shown },
    }));
  }

  /** Écrit un champ d'identité, sans toucher au reste du brouillon. */
  protected setIdentity(field: IdentityTextField, value: string): void {
    this.draft.update((draft) => ({ ...draft, identity: { ...draft.identity, [field]: value } }));
  }

  /** Remplace la liste des réseaux — l'unique chemin d'écriture des trois gestes. */
  private setSocials(next: LegalIdentity['socials']): void {
    this.draft.update((draft) => ({ ...draft, identity: { ...draft.identity, socials: next } }));
  }

  protected addSocial(): void {
    const channel = this.freeChannel();
    if (channel !== null) {
      this.setSocials([...this.identity().socials, { channel, url: '' }]);
    }
  }

  protected removeSocial(index: number): void {
    this.setSocials(this.identity().socials.filter((_, i) => i !== index));
  }

  protected setSocialChannel(index: number, value: string): void {
    if (!isChannel(value)) {
      return;
    }
    // Le passage par une constante n'est pas décoratif : TypeScript ne retient
    // pas l'affinement d'un PARAMÈTRE à l'intérieur d'une closure.
    const channel = value;
    this.setSocials(
      this.identity().socials.map((social, i) => (i === index ? { ...social, channel } : social)),
    );
  }

  protected setSocialUrl(index: number, value: string): void {
    this.setSocials(
      this.identity().socials.map((social, i) =>
        i === index ? { ...social, url: value } : social,
      ),
    );
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
