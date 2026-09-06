import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { COMPANY_ROLE_LABELS, type ContactView } from '@lfd/contracts';
import { FoldIconComponent } from 'fold-ng';

import { ClientCompany } from '../../client-company.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { UserPanel } from '../user-panel/user-panel';

/**
 * La carte UTILISATEURS — les interlocuteurs de la société.
 *
 * Le détenteur est sorti de la liste : il occupe une carte en tête. La
 * hiérarchie est dans le FOND, pas dans une pastille de plus.
 *
 * ## 🔴 Elle listait cinq personnes qui n'existent pas
 *
 * Pierre, Hélène, Karim, le cabinet Ferrand, Léna — avec leurs droits, leurs
 * dates d'invitation et leurs états d'espace, tous écrits en dur. Elles viennent
 * de `GET /me` : le **contact principal** (le détenteur, `owner` par
 * construction) et les **contacts additionnels** de la société.
 *
 * ## Deux états, et non trois
 *
 * La maquette en portait trois : espace actif, invitation en cours, simple
 * contact. Le fil n'en distingue que **deux**, et c'est la distinction qui
 * compte : le détenteur a un espace — c'est celui qui lit l'écran —, un contact
 * additionnel n'en a pas, par construction du modèle (`CompanyContact` est une
 * ligne de coordonnées, pas un compte).
 *
 * `invited` a disparu faute de source : rien dans `/me` ne dit qu'une invitation
 * court. C'est un état RÉEL du domaine (`AccessState`), simplement absent de ce
 * fil-ci ; il reviendra avec l'invitation elle-même, qui n'est pas construite.
 *
 * ## Les droits sont devenus le RÔLE
 *
 * Trois cases à cocher — commander, voir les factures, administrer — n'existent
 * nulle part. Ce qui existe est un **rôle** par rattachement
 * (`owner | admin | orders | billing`), et sa traduction est partagée par les
 * deux frontends : trois booléens inventés disaient moins que ce mot-là.
 */
@Component({
  selector: 'app-users-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent, UserPanel],
  templateUrl: './users-card.html',
  styleUrl: './users-card.scss',
})
export class UsersCard {
  protected readonly t = inject(ClientCopyService).t;
  private readonly client = inject(ClientCompany);

  /** L'interlocuteur dont le panneau est ouvert — `null` le referme. */
  protected readonly opened = signal<ContactView | null>(null);

  /** Le contact PRINCIPAL : le détenteur, toujours présent quand la société l'est. */
  protected readonly holder = computed(() => this.client.company()?.primaryContact ?? null);

  protected readonly others = computed(() => this.client.company()?.contacts ?? []);

  protected readonly count = computed(() => this.others().length + (this.holder() ? 1 : 0));

  protected readonly rows = computed(() =>
    this.others().map((contact) => ({
      contact,
      initials: initialsOf(contact),
      /** La sous-ligne dit la fonction ET le rôle — « Comptabilité · Facturation ». */
      line: [contact.fonction, roleOf(contact)].filter((part) => part !== '').join(' · '),
    })),
  );

  protected readonly holderInitials = computed(() => {
    const holder = this.holder();
    return holder === null ? '' : initialsOf(holder);
  });

  protected readonly holderName = computed(() => nameOf(this.holder()));

  protected open(contact: ContactView): void {
    this.opened.set(contact);
  }

  protected nameOf(contact: ContactView): string {
    return nameOf(contact);
  }
}

/**
 * Le nom affichable d'un interlocuteur, ou son **e-mail** à défaut.
 *
 * Prénom et nom sont facultatifs au modèle : ce qui identifie un interlocuteur,
 * c'est son adresse — c'est par elle qu'on le joint. Un nom vide laisserait une
 * ligne muette dans la liste.
 */
function nameOf(contact: ContactView | null): string {
  if (contact === null) {
    return '';
  }
  const full = `${contact.firstName} ${contact.lastName}`.trim();
  return full === '' ? contact.email : full;
}

/** Les initiales, dérivées du nom affiché. Une lettre suffit quand il n'y en a qu'un. */
function initialsOf(contact: ContactView): string {
  return nameOf(contact)
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/** Le rôle en toutes lettres, ou rien — « à préciser » se lit mieux vide qu'inventé. */
function roleOf(contact: ContactView): string {
  return contact.role === null ? '' : COMPANY_ROLE_LABELS[contact.role];
}
