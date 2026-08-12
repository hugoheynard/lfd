import { inject, Injectable, signal } from '@angular/core';
import type {
  CompanyMemberInvitedView,
  DeferredTerm,
  DeliveryAddressView,
  FulfillmentPreferenceView,
} from '@lfd/contracts';
import type { CompanyIdentityDraft } from '@lfd/b2b-ui/company';

import type { AdminCompanyDetail, CompanyOpened } from '../../comptes-clients/admin-company';
import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { NotifyService } from '../../notify.service';
import type { HolderChoice } from '../holder-picker/holder-picker';

/**
 * Ce que la fiche **écrit**.
 *
 * Chaque geste suit le même trio : muter, annoncer, laisser l'appelant
 * recharger. Le rechargement n'est pas fait ici — ces actions ne connaissent pas
 * l'état de l'écran ; c'est la façade qui recoud les deux.
 *
 * Aucune ne décide du droit d'agir : le mur est côté serveur (auth staff), et le
 * doubler ici donnerait deux vérités à tenir d'accord.
 */
@Injectable()
export class FicheClientActions {
  private readonly service = inject(AdminCompaniesService);
  private readonly notify = inject(NotifyService);

  /** Une ouverture d'accès est en cours — empêche le double envoi. */
  readonly granting = signal(false);
  /** Une ouverture de compte est en cours. */
  readonly creating = signal(false);

  /**
   * Ouvre le compte. Rend l'identifiant créé, ou `null` si rien n'a été écrit —
   * l'appelant en tire la navigation, cette classe ne navigue pas.
   */
  async openAccount(identity: CompanyIdentityDraft, holder: HolderChoice): Promise<string | null> {
    this.creating.set(true);
    try {
      const created = await this.service.create({
        identity: trimIdentity(identity),
        // Le détenteur EST le contact principal de la société : celui qu'on
        // rappelle est celui qui commande.
        contact: {
          firstName: holder.firstName,
          lastName: holder.lastName,
          fonction: '',
          email: holder.email,
          phone: holder.phone,
          // Le détenteur ne choisit pas son rôle, il l'EST — le serveur pose
          // `owner` à l'ouverture.
          role: '',
        },
      });
      this.notify.success(openingMessage(created));
      return created.id;
    } catch (error) {
      this.notify.error(error);
      return null;
    } finally {
      this.creating.set(false);
    }
  }

  /** Active le compte — le geste qui clôt le dossier. */
  activate(company: AdminCompanyDetail): Promise<boolean> {
    return this.run(() => this.service.activate(company.id), 'Compte activé.');
  }

  /** Dépose le KBIS. */
  uploadKbis(company: AdminCompanyDetail, file: File): Promise<boolean> {
    return this.run(() => this.service.uploadKbis(company.id, file), 'KBIS déposé.');
  }

  /**
   * **Certifie** le KBIS déposé. Ce n'est pas une case qu'on coche : c'est la
   * garantie que l'identité du compte a été confrontée à un document officiel.
   */
  certifyKbis(company: AdminCompanyDetail): Promise<boolean> {
    return this.run(() => this.service.certifyKbis(company.id), 'KBIS certifié.');
  }

  /** Retire la certification (erreur de manipulation, extrait périmé). */
  revokeKbisCertification(company: AdminCompanyDetail): Promise<boolean> {
    return this.run(
      () => this.service.revokeKbisCertification(company.id),
      'Certification retirée.',
    );
  }

  /** Rend l'accès à un compte suspendu par décision humaine. */
  reactivate(company: AdminCompanyDetail): Promise<boolean> {
    return this.run(() => this.service.reactivate(company.id), 'Compte réactivé.');
  }

  /** Accorde (ou retire) les crédits de règlement — l'ensemble complet part. */
  grantTerms(company: AdminCompanyDetail, terms: readonly DeferredTerm[]): Promise<boolean> {
    return this.run(
      () => this.service.grantTerms(company.id, terms),
      'Moyens de paiement mis à jour.',
    );
  }

  /** Pose (ou retire) la préférence d'acheminement. */
  preferFulfillment(
    company: AdminCompanyDetail,
    preference: FulfillmentPreferenceView,
  ): Promise<boolean> {
    return this.run(
      () => this.service.preferFulfillment(company.id, preference),
      "Préférence d'acheminement enregistrée.",
    );
  }

  /** Désigne l'adresse de livraison par défaut. */
  setDefaultDelivery(company: AdminCompanyDetail, address: DeliveryAddressView): Promise<boolean> {
    return this.run(
      () => this.service.setDefaultDelivery(company.id, address.id),
      'Adresse par défaut mise à jour.',
    );
  }

  /** Archive une adresse de livraison. */
  removeDelivery(company: AdminCompanyDetail, address: DeliveryAddressView): Promise<boolean> {
    return this.run(
      () => this.service.removeDelivery(company.id, address.id),
      'Adresse de livraison retirée.',
    );
  }

  /** Retire un interlocuteur du carnet. */
  removeContact(company: AdminCompanyDetail, contactId: string): Promise<boolean> {
    return this.run(
      () => this.service.removeContact(company.id, contactId),
      'Interlocuteur retiré.',
    );
  }

  /**
   * Ouvre l'accès d'un interlocuteur — ou lui **renvoie** son lien : c'est le
   * même appel, l'API étant idempotente sur l'adresse. Deux boutons pour un
   * geste, ce serait deux façons de se tromper.
   */
  async openAccess(company: AdminCompanyDetail, contactId: string | null): Promise<boolean> {
    const contact = company.contacts.find((row) => row.contactId === contactId);
    if (contact === undefined || this.granting()) {
      return false;
    }
    if (contact.role === null) {
      // Sans rôle, on ne saurait pas quoi lui ouvrir. Le dire vaut mieux que
      // choisir à sa place un rôle qu'on ne saurait plus distinguer d'un vrai.
      this.notify.info("Précisez d'abord son rôle dans la société.");
      return false;
    }
    this.granting.set(true);
    try {
      const result = await this.service.inviteMember(company.id, {
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
        role: contact.role,
      });
      // Le sort de l'envoi n'est pas arrondi : un « c'est envoyé ! » de
      // politesse ferait attendre un e-mail qui n'arrivera jamais.
      this.notify.success(accessMessage(result));
      return true;
    } catch (error) {
      this.notify.error(error);
      return false;
    } finally {
      this.granting.set(false);
    }
  }

  /** Mute, annonce, et dit si ça a tenu — le trio commun à tous les gestes. */
  private async run(mutate: () => Promise<void>, done: string): Promise<boolean> {
    try {
      await mutate();
      this.notify.success(done);
      return true;
    } catch (error) {
      this.notify.error(error);
      return false;
    }
  }
}

/**
 * Ce qu'on annonce au commercial après l'ouverture — il a encore le client au
 * téléphone, et ce qu'il va lui dire dépend entièrement de ces trois faits.
 *
 * Le cas muet (`mailSent` faux) est le plus important à ne pas arrondir : le
 * compte existe, mais **personne n'a rien reçu**.
 */
export function openingMessage(opened: CompanyOpened): string {
  if (!opened.accessOpened) {
    return "Compte ouvert, mais l'accès du client n'a pas pu être créé — à reprendre depuis sa fiche.";
  }
  return opened.mailSent
    ? "Compte ouvert, l'accès du détenteur est en route."
    : "Compte ouvert, mais l'e-mail n'est pas parti — prévenez le client.";
}

/**
 * Ce qu'on annonce après avoir ouvert un accès.
 *
 * **Une seule phrase**, que la personne ait déjà un compte ou non. Distinguer
 * les deux cas apprendrait au commercial que l'adresse qu'il vient de saisir est
 * déjà connue de la plateforme — donc que cette personne travaille avec un autre
 * de nos clients. Le sort de l'envoi, en revanche, se dit toujours : il parle de
 * NOTRE canal, pas de la personne.
 */
export function accessMessage(result: CompanyMemberInvitedView): string {
  const who = result.member.email;
  return result.mailSent
    ? `C'est envoyé à ${who}.`
    : `Accès ouvert pour ${who}, mais l'e-mail n'est pas parti — prévenez le client.`;
}

/**
 * Rogne l'identité avant l'envoi : un espace de copier-coller ne doit pas
 * devenir une raison sociale qui ne ressort d'aucune recherche.
 */
export function trimIdentity(draft: CompanyIdentityDraft): CompanyIdentityDraft {
  return {
    raisonSociale: draft.raisonSociale.trim(),
    enseigne: draft.enseigne.trim(),
    formeJuridique: draft.formeJuridique.trim(),
    siret: draft.siret.trim(),
    tvaIntracom: draft.tvaIntracom.trim(),
  };
}
