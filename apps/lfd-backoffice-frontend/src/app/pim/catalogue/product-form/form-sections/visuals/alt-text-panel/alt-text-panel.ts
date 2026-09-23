import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';

import { LOCALES, SOURCE_LOCALE, writeLocalized, type LocalizedText } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldCheckboxComponent,
  FoldInputComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { LOCALE_NAMES } from '../../../../../../shared/lang-switch/locale-names';

/** Charge d'ouverture : l'image qu'on décrit, et ce qui en est déjà écrit. */
export interface AltTextPanelData {
  readonly url: string;
  readonly name: string;
  readonly alt: LocalizedText | undefined;
  /**
   * Ce visuel est-il LE packshot ? **`undefined` = ce porteur n'a pas la
   * notion**, et le panneau ne propose alors rien.
   *
   * 🔴 La notion n'existe que là où quelqu'un la LIT. Une fiche produit en a
   * un consommateur — la vitrine du canal B2B cherche le `hero`. Une famille
   * n'en a aucun (vérifié le 2026-09-23 : rien sous `pim/channels/` ne consulte
   * le rôle d'un visuel de famille). Offrir la case là-bas ferait décider pour
   * rien, et cette décision-là finirait par se croire lue.
   */
  readonly isMain?: boolean | undefined;
}

/**
 * Ce que le panneau rend en se fermant. Une ENVELOPPE, et pas le texte nu :
 * `closed` rend `undefined` quand on annule, et « vidé » est aussi un texte
 * `undefined`. Sans l'enveloppe, annuler effacerait ce qu'on venait de renoncer
 * à changer.
 */
export interface AltTextPanelResult {
  readonly name: string;
  readonly alt: LocalizedText | undefined;
  /**
   * Ce visuel devient-il LE packshot ? `undefined` quand le porteur n'a pas la
   * notion (cf. {@link AltTextPanelData.isMain}).
   *
   * Le panneau ne voit qu'une image : il **déclare une intention**, il ne
   * range pas la liste. C'est le magasin qui rend les autres à `gallery`, en
   * une seule mise à jour — sans quoi deux principaux deviendraient
   * exprimables le temps d'un aller-retour.
   */
  readonly isMain?: boolean | undefined;
  /** Le visuel a-t-il été RETIRÉ ? Le retrait vit ici parce que c'est ici qu'on
   *  regarde l'image en grand — décider de la jeter demande de la voir. */
  readonly removed?: boolean;
}

/**
 * Panneau **Visuel** — son nom, ses trois textes alternatifs, et son retrait.
 *
 * Pourquoi un panneau et pas un champ dans la vignette : une tuile de galerie
 * fait onze rems de large, et un champ qui n'y montre qu'UNE langue à la fois
 * oblige à basculer trois fois pour vérifier une image. Or c'est précisément
 * quand on rédige une alternative qu'on veut voir les trois — une traduction se
 * juge à côté de sa source, pas de mémoire.
 *
 * L'image est là aussi, en grand. On ne décrit pas une image qu'on ne voit pas.
 */
@Component({
  selector: 'app-alt-text-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPanelHeaderComponent,
    FoldInputComponent,
    FoldCheckboxComponent,
    FoldButtonComponent,
  ],
  templateUrl: './alt-text-panel.html',
  styleUrl: './alt-text-panel.scss',
})
export class AltTextPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto' };

  private readonly ref = inject<FoldPanelRef<AltTextPanelResult>>(FoldPanelRef);

  readonly data = input.required<AltTextPanelData>();

  protected readonly locales = LOCALES;
  protected readonly names = LOCALE_NAMES;
  protected readonly sourceLocale = SOURCE_LOCALE;

  protected readonly draft = signal<LocalizedText>({ fr: '' });
  protected readonly name = signal('');
  /** `undefined` tant que le porteur n'a pas la notion — voir la donnée. */
  protected readonly isMain = signal<boolean | undefined>(undefined);

  constructor() {
    effect(() => {
      const data = this.data();
      this.draft.set(data.alt ?? { fr: '' });
      this.name.set(data.name);
      this.isMain.set(data.isMain);
    });
  }

  protected valueOf(locale: string): string {
    return this.draft()[locale as keyof LocalizedText] ?? '';
  }

  protected write(locale: (typeof LOCALES)[number], value: string): void {
    this.draft.update((text) => writeLocalized(text, locale, value));
  }

  /** Rend le texte, ou `undefined` quand la source est vide — « pas d'alternative »
   *  plutôt qu'une alternative vide, que tout ce qui compte les langues croirait. */
  protected submit(): void {
    const text = this.draft();
    this.ref.close({
      name: this.name().trim(),
      alt: text[SOURCE_LOCALE].trim() === '' ? undefined : text,
      ...(this.isMain() === undefined ? {} : { isMain: this.isMain() }),
    });
  }

  /** Retire le visuel du produit — pas de la bibliothèque. */
  protected remove(): void {
    this.ref.close({ name: this.name(), alt: this.draft(), removed: true });
  }

  /** Ferme SANS résultat — l'enveloppe absente veut dire « annulé ». */
  protected cancel(): void {
    this.ref.close();
  }
}
