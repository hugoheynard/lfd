import { inject, Injectable } from '@angular/core';
import type {
  CompanyContactView,
  DeliveryAddressView,
  DeliveryContact,
  WindowMode,
} from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import {
  BillingAddressPanel,
  DeliveryAddressPanel,
  EMPTY_COMPANY_CONTACT_DRAFT,
  type CompanyContactDraft,
  type DeliveryAddressPanelData,
} from '@lfd/b2b-ui/company';

import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import { adminDeliveryProcedureGateway } from '../../comptes-clients/admin-delivery-procedure.gateway';
import { AdminContactPanel, type AdminContactTarget } from '../panels/contact-panel/contact-panel';
import { AdminDeliveryProcedurePanel } from '../panels/delivery-procedure-panel/delivery-procedure-panel';
import { AdminDetenteurPanel } from '../panels/detenteur-panel/detenteur-panel';
import { AdminIdentitePanel } from '../panels/identite-panel/identite-panel';
import type { HolderChoice } from '../holder-picker/holder-picker';

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
/**
 * **Un panneau de saisie ne se ferme pas tout seul.** fold ferme un panneau au
 * clic sur le fond et à Échap. Or sélectionner le texte d'un champ et relâcher
 * la souris hors du panneau envoie le clic au fond, et Échap sert aussi à
 * refermer une liste déroulante : le panneau partait avec la saisie (signalé
 * par Hugo le 2026-10-05, en corrigeant plusieurs champs de l'identité
 * légale). Le bouton de fermeture et « Annuler » restent les deux sorties.
 */
export const FORM_PANEL = { disableClose: true } as const;

@Injectable()
export class FicheClientPanels {
  private readonly panels = inject(FoldPanelHostService);

  /**
   * Le panneau d'une étape d'activation, ou `null` si l'étape n'en a pas
   * (le KBIS est un dépôt de fichier, le règlement se règle sur la fiche).
   */
  openStep(
    key: string,
    company: AdminCompanyDetail,
    globalWindowMode: WindowMode = 'deadline',
  ): Promise<unknown> | null {
    if (key === 'vat' || key === 'legal') {
      return this.panels.open(AdminIdentitePanel, {
        ...FORM_PANEL,
        data: {
          companyId: company.id,
          enseigne: company.enseigne,
          vatNumber: company.vatNumber,
          raisonSociale: company.raisonSociale,
          formeJuridique: company.formeJuridique,
          siret: company.siret,
          siren: company.siren,
        },
      }).closed;
    }
    if (key === 'billing') {
      return this.panels.open(BillingAddressPanel, {
        ...FORM_PANEL,
        // La même entrée sert à poser l'adresse et à la corriger : sans ce
        // préremplissage, « Modifier » s'ouvrait vide et faisait retaper six
        // champs pour en changer un.
        data: { companyId: company.id, address: company.addresses.billing },
      }).closed;
    }
    if (key === 'delivery') {
      return this.openNewDelivery(company, globalWindowMode);
    }
    // Le numéro manquant se saisit sur le DÉTENTEUR : c'est lui qu'on appelle,
    // et l'étape ne se propose que lorsqu'il est déjà rattaché. Ouvrir « nouvel
    // interlocuteur » ferait créer une personne pour porter un téléphone.
    if (key === 'telephone') {
      return this.openContact(company, null, false);
    }
    return null;
  }

  /**
   * Le **détenteur** d'un compte ouvert sans lui. Rend la saisie retenue, ou
   * `null` si le panneau a été fermé sans rien poser.
   */
  async openHolder(company: AdminCompanyDetail): Promise<HolderChoice | null> {
    const closed: unknown = await this.panels.open(AdminDetenteurPanel, {
      ...FORM_PANEL,
      data: { companyId: company.id },
    }).closed;
    return isHolderChoice(closed) ? closed : null;
  }

  /**
   * Une adresse de livraison à créer. `globalWindowMode` : le réglage
   * « créneau ou échéance » dont elle hérite (CA-D2), montré dans le panneau.
   */
  openNewDelivery(company: AdminCompanyDetail, globalWindowMode: WindowMode): Promise<unknown> {
    return this.panels.open(DeliveryAddressPanel, {
      ...FORM_PANEL,
      data: deliveryData(company, null, globalWindowMode),
    }).closed;
  }

  /** Une adresse de livraison à corriger — le même panneau, prérempli. */
  openDelivery(
    company: AdminCompanyDetail,
    address: DeliveryAddressView,
    globalWindowMode: WindowMode,
  ): Promise<unknown> {
    return this.panels.open(DeliveryAddressPanel, {
      ...FORM_PANEL,
      data: deliveryData(company, address, globalWindowMode),
    }).closed;
  }

  /**
   * La procédure de livraison d'une adresse. Rend `true` si son nombre
   * d'étapes ou « dépôt autorisé » a changé pendant l'ouverture : ce sont les
   * seules raisons de relire la fiche.
   *
   * La passerelle est fournie au panneau, liée à cette société — pas à la
   * racine, où elle tirerait l'éditeur dans le bundle initial.
   */
  async openProcedure(company: AdminCompanyDetail, address: DeliveryAddressView): Promise<boolean> {
    let changed = false;
    await this.panels.open(AdminDeliveryProcedurePanel, {
      ...FORM_PANEL,
      data: {
        companyId: company.id,
        address,
        onStepCountChange: () => (changed = true),
        onDepositChange: () => (changed = true),
      },
      providers: [adminDeliveryProcedureGateway(company.id)],
    }).closed;
    return changed;
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
      ...FORM_PANEL,
      data: { companyId: company.id, ...contactTargetOf(company, contactId, isNew) },
    }).closed;
  }
}

/**
 * Ce qu'un panneau a rendu est-il un détenteur ?
 *
 * `closed` porte `unknown` — un panneau peut se fermer sur n'importe quoi, y
 * compris sur rien. On regarde donc la forme plutôt que de l'affirmer : une
 * assertion ferait passer une fermeture par la croix pour une saisie.
 */
function isHolderChoice(value: unknown): value is HolderChoice {
  return typeof value === 'object' && value !== null && 'email' in value;
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
/**
 * La charge d'un panneau de livraison, montée une fois pour les deux entrées.
 *
 * Le **socle de signature** en fait partie et n'est pas facultatif : il dit ce
 * que vaut « comme la société » dans le sélecteur. Tant qu'il l'était, aucune
 * des deux entrées ne le passait, et le panneau annonçait donc « non exigée »
 * même aux sociétés qui l'exigent.
 */
function deliveryData(
  company: AdminCompanyDetail,
  address: DeliveryAddressView | null,
  globalWindowMode: WindowMode,
): DeliveryAddressPanelData {
  return {
    companyId: company.id,
    address,
    knownContacts: knownContactsOf(company),
    signatureFloor: company.fulfillmentPreference.signatureRequired,
    // Réglage d'organisation (L7b-C4) : le staff le voit, le client jamais.
    showStopMinutes: true,
    globalWindowMode,
  };
}

export function knownContactsOf(company: AdminCompanyDetail): readonly DeliveryContact[] {
  const contact = company.primaryContact;
  if (contact.firstName === '' && contact.lastName === '') {
    return [];
  }
  return [{ prenom: contact.firstName, nom: contact.lastName, telephone: contact.phone }];
}
