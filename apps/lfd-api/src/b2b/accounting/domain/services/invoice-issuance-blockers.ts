import { legalFormRequiresVat, toLegalForm } from "@lfd/contracts";

import { addressCountryCode } from "./facturx-parties.js";
import type { InvoicePaymentTerms } from "../value-objects/invoice-payment-terms.js";

/**
 * Ce qu'il faut savoir du **vendeur** pour juger qu'une facture peut partir :
 * l'identité qui s'imprime, et les mentions de paiement. Une copie à plat,
 * rendue par `LegalEntity.invoiceSellerFacts()` — jamais l'agrégat.
 */
export interface InvoiceSellerFacts {
  readonly legalEntityId: string;
  readonly name: string;
  readonly legalForm: string;
  readonly rcs: string;
  readonly vatNumber: string;
  readonly archived: boolean;
  readonly paymentTerms: InvoicePaymentTerms;
}

/** Ce qu'il faut savoir de l'**acheteur** — le payeur légal (Q3). */
export interface InvoiceBuyerFacts {
  readonly name: string;
  readonly legalForm: string;
  readonly siren: string;
  readonly vatNumber: string;
  /**
   * L'adresse de facturation telle que la facture l'imprimera — les mêmes
   * lignes que le snapshot acheteur (`StatementBuyerReader`), jamais une
   * autre lecture.
   */
  readonly billingAddressLines: readonly string[];
}

export type InvoiceIssuanceBlockerCode =
  | "no_issuer"
  | "several_issuers"
  | "issuer_archived"
  | "seller_incomplete"
  | "payment_terms_missing"
  | "buyer_unknown"
  | "buyer_siren_missing"
  | "buyer_vat_missing"
  | "buyer_address_missing"
  | "buyer_country_unknown";

/** Un manque, nommé : le code pour l'écran, la phrase pour la personne. */
export interface InvoiceIssuanceBlocker {
  readonly code: InvoiceIssuanceBlockerCode;
  readonly message: string;
}

/**
 * **Pourquoi une facture ne pourrait pas être émise**, manque par manque
 * (plan `facture-emise.md`).
 *
 * Une liste et pas un booléen : le dossier et la fiche de l'entité l'affichent
 * telle quelle, et l'émission (E4) refusera en la citant. Écrite une fois ici,
 * elle ne peut pas dire à l'écran autre chose que ce que l'émission refusera.
 *
 * 🔴 Rien n'est comblé : un SIREN absent n'est pas déduit, un taux absent n'est
 * pas remplacé par le taux légal. Une facture qui imprime une valeur que
 * personne n'a saisie est pire qu'une facture qui ne part pas.
 *
 * Ne touche pas la porte d'activation (`activation-gate.ts`) : un compte actif
 * sans SIREN reste actif — il ne sera simplement pas facturable tant qu'on ne
 * l'a pas complété, et ce lot le rend visible au lieu de le bloquer.
 *
 * @param seller `null` quand aucune entité émettrice n'est en service.
 * @param buyer `null` quand le payeur est absent de l'annuaire.
 */
export function invoiceIssuanceBlockers(
  seller: InvoiceSellerFacts | null,
  buyer: InvoiceBuyerFacts | null,
): readonly InvoiceIssuanceBlocker[] {
  return [...sellerBlockers(seller), ...buyerBlockers(buyer)];
}

/**
 * Les manques pour un payeur, quand l'entité qui le facturera n'est pas encore
 * désignée : la seule entité en service, comme le mandat (`soleIssuer`). Aucune
 * → `no_issuer` ; plusieurs → `several_issuers`, plutôt qu'un choix au hasard.
 *
 * @param activeSellers les entités NON archivées.
 */
export function payerIssuanceBlockers(
  activeSellers: readonly InvoiceSellerFacts[],
  buyer: InvoiceBuyerFacts | null,
): readonly InvoiceIssuanceBlocker[] {
  const [sole, ...others] = activeSellers;
  if (sole !== undefined && others.length > 0) {
    return [severalIssuersBlocker(activeSellers.length), ...buyerBlockers(buyer)];
  }
  return invoiceIssuanceBlockers(sole ?? null, buyer);
}

/** La part du vendeur seule — ce que la fiche de l'entité affiche. */
export function sellerBlockers(
  seller: InvoiceSellerFacts | null,
): readonly InvoiceIssuanceBlocker[] {
  if (seller === null) {
    return [
      {
        code: "no_issuer",
        message:
          "Aucune entité émettrice n'est en service : en déclarer une (ou en remettre une en " +
          "service) dans Comptabilité › Entités juridiques.",
      },
    ];
  }
  const blockers: InvoiceIssuanceBlocker[] = [];
  if (seller.archived) {
    blockers.push({
      code: "issuer_archived",
      message: `L'entité « ${seller.name} » est archivée : une entité archivée n'émet plus rien.`,
    });
  }
  const identity = missingSellerIdentity(seller);
  if (identity.length > 0) {
    blockers.push({
      code: "seller_incomplete",
      message:
        `La fiche de l'entité « ${seller.name} » est incomplète (${identity.join(", ")}) : ` +
        "la compléter dans Comptabilité › Entités juridiques.",
    });
  }
  const terms = seller.paymentTerms.missing();
  if (terms.length > 0) {
    blockers.push({
      code: "payment_terms_missing",
      message:
        `Les mentions de paiement de l'entité « ${seller.name} » ne sont pas renseignées ` +
        `(${terms.join(", ")}) : les saisir sur sa fiche, carte « Mentions de la facture ».`,
    });
  }
  return blockers;
}

/**
 * Plusieurs entités en service : laquelle émet la facture d'un payeur n'est
 * pas encore décidé (le plan prévoit une séquence par entité, § 5). On le dit
 * plutôt que d'en choisir une au hasard — la même prudence que `soleIssuer`.
 */
export function severalIssuersBlocker(count: number): InvoiceIssuanceBlocker {
  return {
    code: "several_issuers",
    message:
      `${String(count)} entités émettrices sont en service : choisir celle qui facture ce ` +
      "client n'est pas encore possible. Archiver celles qui n'émettent pas.",
  };
}

function buyerBlockers(buyer: InvoiceBuyerFacts | null): readonly InvoiceIssuanceBlocker[] {
  if (buyer === null) {
    return [
      {
        code: "buyer_unknown",
        message:
          "Le client payeur est introuvable dans l'annuaire : la facture n'a pas d'acheteur.",
      },
    ];
  }
  const blockers: InvoiceIssuanceBlocker[] = [];
  if (buyer.siren.trim() === "") {
    blockers.push({
      code: "buyer_siren_missing",
      message:
        `Le client « ${buyer.name} » n'a pas de SIREN : le renseigner (ou son SIRET) sur sa ` +
        "fiche client, rubrique identité légale.",
    });
  }
  if (vatNumberRequired(buyer.legalForm) && buyer.vatNumber.trim() === "") {
    blockers.push({
      code: "buyer_vat_missing",
      message:
        `Le client « ${buyer.name} » est assujetti à la TVA mais n'a pas de numéro de TVA ` +
        "intracommunautaire : le renseigner sur sa fiche client.",
    });
  }
  blockers.push(...buyerAddressBlockers(buyer));
  return blockers;
}

/**
 * BR-10 / BR-11 (A43, Hugo, 2026-10-09) : sans adresse ou sans pays relisible,
 * le XML n'a pas de `ram:CountryID` acheteur et EN 16931 le refuse. Seul le
 * pays est exigé — ni le code postal ni la ville ne le sont pour l'acheteur.
 */
function buyerAddressBlockers(buyer: InvoiceBuyerFacts): readonly InvoiceIssuanceBlocker[] {
  if (buyer.billingAddressLines.every((line) => line.trim() === "")) {
    return [
      {
        code: "buyer_address_missing",
        message:
          `Le client « ${buyer.name} » n'a pas d'adresse de facturation : ajoutez l'adresse de ` +
          `facturation de « ${buyer.name} » sur sa fiche client, rubrique adresses.`,
      },
    ];
  }
  if (addressCountryCode(buyer.billingAddressLines) === null) {
    return [
      {
        code: "buyer_country_unknown",
        message:
          `Le pays de l'adresse de facturation de « ${buyer.name} » ne se relit pas : écrivez le ` +
          "pays en toutes lettres (France) ou en code à deux lettres (BE, IT…) sur sa fiche client.",
      },
    ];
  }
  return [];
}

function missingSellerIdentity(seller: InvoiceSellerFacts): readonly string[] {
  const missing: string[] = [];
  if (seller.rcs.trim() === "") {
    missing.push("le RCS");
  }
  if (vatNumberRequired(seller.legalForm) && seller.vatNumber.trim() === "") {
    missing.push("le numéro de TVA intracommunautaire");
  }
  return missing;
}

/**
 * La règle de `requiresVatNumber` du compte client (`account/domain/
 * value-objects/vat-liability.ts`, lue le 2026-10-08) : la table forme →
 * assujettissement de `@lfd/contracts`, et une forme hors catalogue réputée
 * assujettie. Redite ici parce que la comptabilité n'importe pas le contexte
 * `account` ; la table, elle, reste unique.
 */
function vatNumberRequired(legalForm: string): boolean {
  const form = toLegalForm(legalForm);
  return form === null ? true : legalFormRequiresVat(form);
}
