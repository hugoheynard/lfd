import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { FoldLinkComponent, FoldPanelHostService } from 'fold-ng';

import {
  legalMentionLabels,
  legalMentionOrder,
  socialChannelLabels,
  type LegalMention,
} from '@lfd/contracts/content-values';

import { ClientContent } from '../client-content.service';
import { LegalDocumentPanel } from '../legal-document-panel/legal-document-panel';
import { LEGAL_YEAR } from './legal-identity';

/**
 * Le pied de page de l'app — quatre colonnes et une barre légale.
 *
 * Il peint la MÊME teinte que la barre (`--fold-color-bg-header`) : c'est la
 * règle de région du handoff `navi 2`, et c'est ce qui fait qu'il ferme la page
 * au lieu d'y ajouter un bloc. Il passe sous toute la largeur, rail compris —
 * ce n'est pas une colonne de plus.
 *
 * La colonne « Commander » double la navigation **par intention** et non par
 * rubrique : « Retrait au Labo », « Coursier dans la station » ne sont pas les
 * entrées du menu, ce sont les façons dont on arrive à la même commande.
 *
 * Il n'existe **qu'au bureau**. Sur un téléphone, la navigation pleine page et
 * la carte contact couvrent les mêmes besoins sans imposer 300 px de
 * défilement mort.
 */
@Component({
  selector: 'app-client-foot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldLinkComponent],
  templateUrl: './client-foot.html',
  styleUrl: './client-foot.scss',
})
export class ClientFoot {
  private readonly content = inject(ClientContent);
  private readonly panelHost = inject(FoldPanelHostService);

  /** Les textes, servis par l'API — le contenu de départ tant qu'elle n'a pas répondu. */
  protected readonly foot = this.content.footer;

  /** L'identité légale, saisie depuis le back-office. Ce qui est vide est OMIS. */
  protected readonly legal = this.content.identity;

  protected readonly year = LEGAL_YEAR;

  /**
   * Les réseaux enregistrés, avec le mot qui les nomme.
   *
   * C'étaient deux pastilles écrites en dur, Instagram et Facebook. Le nombre
   * de canaux bouge — il se lit dans la donnée. Le LIBELLÉ, lui, ne s'invente
   * pas ici : il vient du contrat, pour que le back-office et la vitrine
   * écrivent le même mot.
   */
  protected readonly socials = computed(() =>
    this.legal().socials.map((social) => ({
      channel: social.channel,
      url: social.url,
      label: socialChannelLabels[social.channel],
    })),
  );

  /**
   * Les mentions d'immatriculation RENSEIGNÉES, dans l'ordre de la barre.
   *
   * Elles étaient absentes du code parce qu'on n'invente pas un numéro
   * d'immatriculation. Elles ne le sont plus : elles se saisissent, et la barre
   * les montre dès qu'elles existent. Ce qui reste vide ne laisse pas de trou —
   * une barre courte se lit, un tiret qui traîne se remarque.
   */
  protected readonly mentions = computed(() => {
    const id = this.legal();
    return [id.company, id.capital, id.siret, id.rcs, id.vat].filter((value) => value !== '');
  });

  /**
   * Les mentions à afficher, dans l'ordre du contrat, avec leur mot.
   *
   * L'ORDRE vient du vocabulaire et non de la base : c'est l'ordre d'une barre
   * légale, pas une préférence — et le laisser en donnée aurait rendu possible
   * une barre qui commence par « Cookies ».
   *
   * 🔴 Le mot vient du CONTRAT pour les cinq, TITRE du document compris. Il a
   * été celui du document pour les CGV, du temps où elles étaient la seule
   * mention vivante ; à cinq documents, nommer la barre par leurs titres
   * obligerait à charger les cinq d'avance pour peindre un pied de page que
   * personne n'a encore ouvert — ce qui ruine le chargement paresseux. Et c'est
   * juste sur le fond : **la barre nomme l'obligation, le dialogue porte le nom
   * que le document se donne** (tranché le 2026-09-13).
   */
  protected readonly shownMentions = computed<readonly LegalMention[]>(() => {
    const shown = this.content.legalMentions();
    return legalMentionOrder.filter((key) => shown[key]);
  });

  /** Le mot de la mention, dans la langue de la vitrine. */
  protected label(mention: LegalMention): string {
    return legalMentionLabels[this.content.locale()][mention];
  }

  /**
   * Ouvre le dialogue de CETTE mention. C'est CE geste qui déclenche la lecture
   * du document : le panneau appelle le service, qui ne charge qu'à la première
   * ouverture de la mention demandée.
   */
  protected openMention(mention: LegalMention): void {
    this.panelHost.open(LegalDocumentPanel, { data: mention });
  }
}
