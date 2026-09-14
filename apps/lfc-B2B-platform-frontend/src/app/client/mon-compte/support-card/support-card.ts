import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldCardComponent, FoldElementTitleComponent, FoldIconComponent } from 'fold-ng';

import { ClientContent } from '../../client-content.service';
import { ClientCopyService } from '../../copy/client-copy.service';

/** Un moyen de joindre le service : ce qu'on lit, et où le lien mène. */
interface Channel {
  readonly label: string;
  readonly href: string;
}

/**
 * « Un problème ? » — sous les cartes de `/mon-compte`, de quoi joindre le
 * service commercial.
 *
 * Le numéro et l'adresse ne sont **pas** écrits ici : ce sont ceux de
 * l'identité publiée de la plateforme (`ClientContent.identity`), les mêmes que
 * le pied de page affiche au bureau. Ils se corrigent au back-office, sans
 * déploiement — et en pile, où le pied de page n'existe pas, cette carte est
 * le seul endroit où on les trouve.
 *
 * Un canal non renseigné disparaît ; sans aucun des deux, la carte entière se
 * tait plutôt que de promettre un contact qu'elle ne donne pas.
 */
@Component({
  selector: 'app-support-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldElementTitleComponent, FoldIconComponent],
  templateUrl: './support-card.html',
  styleUrl: './support-card.scss',
})
export class SupportCard {
  protected readonly t = inject(ClientCopyService).t;
  private readonly identity = inject(ClientContent).identity;

  /** Le numéro tel qu'il se lit ; le lien composable s'il est saisi, dérivé sinon. */
  protected readonly phone = computed<Channel | null>(() => {
    const { phone, phoneHref } = this.identity();
    const label = phone.trim();
    if (label === '') {
      return null;
    }
    const href = phoneHref.trim();
    return { label, href: href === '' ? `tel:${label.replace(/\s/gu, '')}` : href };
  });

  protected readonly email = computed<Channel | null>(() => {
    const label = this.identity().email.trim();
    return label === '' ? null : { label, href: `mailto:${label}` };
  });

  protected readonly reachable = computed(() => this.phone() !== null || this.email() !== null);
}
