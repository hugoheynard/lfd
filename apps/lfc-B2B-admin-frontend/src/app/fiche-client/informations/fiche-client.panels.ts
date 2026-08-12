import { inject, Injectable } from '@angular/core';
import type { CompanyContactView, DeliveryAddressView, DeliveryContact } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { EMPTY_COMPANY_CONTACT_DRAFT, type CompanyContactDraft } from '@lfd/b2b-ui/company';

import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { AdminAdressePanel } from '../panels/adresse-panel/adresse-panel';
import { AdminContactPanel, type AdminContactTarget } from '../panels/contact-panel/contact-panel';
import { AdminIdentitePanel } from '../panels/identite-panel/identite-panel';

/**
 * Quel panneau ouvrir, et avec quelle charge.
 *
 * Cette connaissance-là — la correspondance entre une intention d'écran et le
 * panneau qui la sert, plus le préremplissage que celui-ci attend — est une
 * troisième raison de changer, distincte de « ce qui est à l'écran » et de « ce
 * qui mute ». Ajouter un panneau ne devrait toucher qu'ici.
 *
 * Chaque méthode rend la promesse de **fermeture** : l'appelant décide quoi en
 * faire (recharger, en général). Le service n'appelle pas le rechargement
 * lui-même — il ne connaît pas l'état de la page, et n'a pas à le connaître.
 */
@Injectable()
export class FicheClientPanels {
  private readonly panels = inject(FoldPanelHostService);

  /**
   * Le panneau d'une étape d'activation, ou `null` si l'étape n'en a pas
   * (le KBIS est un dépôt de fichier, le règlement se règle sur la fiche).
   */
  openStep(key: string, company: AdminCompanyDetail): Promise<unknown> | null {
    if (key === 'tva' || key === 'legal') {
      return this.panels.open(AdminIdentitePanel, {
        data: {
          companyId: company.id,
          enseigne: company.enseigne,
          tvaIntracom: company.tvaIntracom,
          raisonSociale: company.raisonSociale,
          formeJuridique: company.formeJuridique,
          siret: company.siret,
        },
        side: 'right',
      }).closed;
    }
    if (key === 'billing') {
      return this.panels.open(AdminAdressePanel, {
        data: { companyId: company.id, kind: 'facturation' },
        side: 'right',
      }).closed;
    }
    if (key === 'delivery') {
      return this.openNewDelivery(company);
    }
    return null;
  }

  /** Une adresse de livraison à créer. */
  openNewDelivery(company: AdminCompanyDetail): Promise<unknown> {
    return this.panels.open(AdminAdressePanel, {
      data: {
        companyId: company.id,
        kind: 'livraison',
        knownContacts: knownContactsOf(company),
      },
      side: 'right',
    }).closed;
  }

  /** Une adresse de livraison à corriger — le même panneau, prérempli. */
  openDelivery(company: AdminCompanyDetail, address: DeliveryAddressView): Promise<unknown> {
    return this.panels.open(AdminAdressePanel, {
      data: {
        companyId: company.id,
        kind: 'livraison',
        knownContacts: knownContactsOf(company),
        delivery: address,
      },
      side: 'right',
    }).closed;
  }

  /**
   * Le panneau d'un interlocuteur — le détenteur, un existant, ou un nouveau.
   *
   * `contactId: null` avec `isNew: false` désigne le **détenteur** : il n'a pas
   * d'identifiant de contact, il vit aplati sur la société. C'est ce qui
   * distingue les deux cas, pas un drapeau de plus.
   */
  openContact(
    company: AdminCompanyDetail,
    contactId: string | null,
    isNew: boolean,
  ): Promise<unknown> {
    return this.panels.open(AdminContactPanel, {
      data: { companyId: company.id, ...contactTargetOf(company, contactId, isNew) },
      side: 'right',
    }).closed;
  }
}

/** La cible du panneau de contact, et de quoi la préremplir. */
export function contactTargetOf(
  company: AdminCompanyDetail,
  contactId: string | null,
  isNew: boolean,
): { target: AdminContactTarget; initial: CompanyContactDraft } {
  const contact = isNew ? undefined : company.contacts.find((row) => row.contactId === contactId);
  if (contact === undefined) {
    return {
      target: { kind: 'additional', contactId: null },
      initial: EMPTY_COMPANY_CONTACT_DRAFT,
    };
  }
  return {
    target: contactId === null ? { kind: 'primary' } : { kind: 'additional', contactId },
    initial: toDraft(contact),
  };
}

/**
 * Coordonnées → brouillon de saisie.
 *
 * `owner` ne redescend pas dans le brouillon : c'est un rôle constaté, absent
 * des choix, et le formulaire du détenteur ne demande pas de rôle.
 */
function toDraft(contact: CompanyContactView): CompanyContactDraft {
  return {
    firstName: contact.firstName,
    lastName: contact.lastName,
    fonction: contact.fonction,
    email: contact.email,
    phone: contact.phone,
    role: contact.role === null || contact.role === 'owner' ? '' : contact.role,
  };
}

/** Le contact principal, projeté en contact de livraison connu (préremplissage). */
export function knownContactsOf(company: AdminCompanyDetail): readonly DeliveryContact[] {
  const contact = company.primaryContact;
  if (contact.firstName === '' && contact.lastName === '') {
    return [];
  }
  return [{ prenom: contact.firstName, nom: contact.lastName, telephone: contact.phone }];
}
