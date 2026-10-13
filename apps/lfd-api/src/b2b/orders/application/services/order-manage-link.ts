import { Injectable } from "@nestjs/common";

import { CancellationLinkSigner } from "../../domain/ports/cancellation-link-signer.js";
import { CustomerCancellationSubjectReader } from "../../domain/ports/customer-cancellation-subject.reader.js";

/**
 * **Le lien « gérer ou annuler ma commande » de l'accusé de réception** (doc
 * `documentation/commandes/annulation/annulation-par-le-client.md`, C6.4).
 *
 * - commande d'INVITÉ (personnelle, fiche sans compte connectable) : la page
 *   publique d'annulation, le jeton en FRAGMENT (`/annuler#<id>.<jeton>`, S7) —
 *   jamais envoyé au serveur par le navigateur ;
 * - toute autre : la liste `mes-commandes`, SANS secret. Un jeton pour un
 *   titulaire de compte contournerait le mur (un courriel transféré à un
 *   ancien membre annulerait au nom de la société) : c'est la session qui
 *   décide.
 *
 * Déterministe : un rejeu du courriel rend le même lien (B1). Vide sans
 * origine de l'app cliente.
 */
@Injectable()
export class OrderManageLink {
  constructor(
    private readonly subjects: CustomerCancellationSubjectReader,
    private readonly signer: CancellationLinkSigner,
  ) {}

  async urlFor(orderId: string, clientBaseUrl: string | null): Promise<string> {
    if (clientBaseUrl === null) {
      return "";
    }
    const subject = await this.subjects.find(orderId);
    if (subject !== null && subject.companyId === null && !subject.buyer.hasAccount) {
      return `${clientBaseUrl}/annuler#${orderId}.${this.signer.sign(orderId)}`;
    }
    return `${clientBaseUrl}/mes-commandes`;
  }
}
