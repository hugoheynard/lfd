import { Injectable } from "@nestjs/common";

import type { PaymentMandate as PaymentMandateRow } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  PaymentMandate,
  type MandateSnapshot,
  type MandateToCreate,
} from "../domain/entities/payment-mandate.js";
import {
  PaymentMandateRepository,
  type MandateHolder,
} from "../domain/payment-mandate.repository.js";

/**
 * Adaptateur Prisma des mandats.
 *
 * `findCurrent` rend l'**actif** s'il existe, sinon le plus récent : une fiche
 * doit pouvoir dire « révoqué le 3 mars » plutôt que « aucun mandat », qui
 * laisserait croire qu'on n'a jamais rien signé avec ce client. Le tri par
 * statut passe donc avant le tri par date.
 */
@Injectable()
export class PrismaPaymentMandateRepository extends PaymentMandateRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Le mandat qu'une FICHE doit montrer : l'actif, sinon le brouillon en cours,
   * sinon le plus récent.
   *
   * ⚠️ **Ce n'est pas la lecture dont un geste d'écriture a besoin.** Elle
   * répond à « que montrer de ce client », pas à « sur quel mandat agir » : en
   * rotation bancaire — un actif en cours et un brouillon frappé — elle rend
   * l'actif, et un dépôt de scan qui passerait par ici agraferait le papier du
   * mandat NEUF sur l'ANCIEN. La pièce produite en contestation ne porterait
   * alors pas la RUM opposée. Les gestes d'écriture visent un mandat par son
   * identifiant (`findById`) ; celui-ci ne sert qu'à afficher.
   */
  async findCurrent(companyId: string): Promise<PaymentMandate | null> {
    const active = await this.prisma.paymentMandate.findFirst({
      where: { companyId, status: "active" },
    });
    const shown =
      active ??
      (await this.prisma.paymentMandate.findFirst({ where: { companyId, status: "draft" } }));
    const row =
      shown ??
      (await this.prisma.paymentMandate.findFirst({
        where: { companyId },
        orderBy: { createdAt: "desc" },
      }));
    return row === null ? null : PaymentMandate.reconstitute(toSnapshot(row));
  }

  async findById(mandateId: string): Promise<PaymentMandate | null> {
    const row = await this.prisma.paymentMandate.findUnique({ where: { id: mandateId } });
    return row === null ? null : PaymentMandate.reconstitute(toSnapshot(row));
  }

  async create(snapshot: MandateToCreate): Promise<string> {
    const created = await this.prisma.paymentMandate.create({
      data: {
        companyId: snapshot.companyId,
        stripeCustomerId: snapshot.stripeCustomerId,
        paymentMethodId: snapshot.paymentMethodId,
        reference: snapshot.reference,
        last4: snapshot.last4,
        bankCode: snapshot.bankCode,
        country: snapshot.country,
        status: snapshot.status,
        acceptedAt: snapshot.acceptedAt,
        revokedAt: snapshot.revokedAt,
        creditorId: snapshot.creditorId,
        proofStorageKey: snapshot.proofStorageKey,
        proofFileName: snapshot.proofFileName,
      },
      select: { id: true },
    });
    return created.id;
  }

  /**
   * Écrit **tout ce qui peut bouger**.
   *
   * 🔴 Il n'écrivait que quatre colonnes jusqu'au 2026-09-12 — statut, date de
   * révocation, et les deux de la pièce. C'était suffisant tant qu'un mandat
   * naissait signé chez un tiers et ne faisait plus que mourir. Ça ne l'est
   * plus : signer un brouillon écrit `accepted_at`, et un `save()` partiel
   * l'aurait perdue **en silence** — le statut passé à `active`, la date du
   * consentement restée `null`, et l'écran affichant un mandat actif que
   * personne n'a jamais signé.
   *
   * L'identité — référence, émetteur, rattachement au prestataire — n'y est
   * pas : elle ne bouge pas, et une RUM qui se réécrirait invaliderait le
   * papier qui la porte.
   */
  async save(mandate: PaymentMandate): Promise<void> {
    const snapshot = mandate.toSnapshot();
    await this.prisma.paymentMandate.update({
      where: { id: snapshot.id },
      data: {
        status: snapshot.status,
        acceptedAt: snapshot.acceptedAt,
        revokedAt: snapshot.revokedAt,
        last4: snapshot.last4,
        bankCode: snapshot.bankCode,
        country: snapshot.country,
        proofStorageKey: snapshot.proofStorageKey,
        proofFileName: snapshot.proofFileName,
      },
    });
  }

  async findHolder(companyId: string): Promise<MandateHolder | null> {
    const row = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { raisonSociale: true, contactEmail: true },
    });
    return row === null ? null : { companyName: row.raisonSociale, email: row.contactEmail };
  }

  async findStripeCustomerId(companyId: string): Promise<string | null> {
    const row = await this.prisma.paymentMandate.findFirst({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      select: { stripeCustomerId: true },
    });
    return row?.stripeCustomerId ?? null;
  }
}

/** Ligne Prisma → état de domaine. Le type Prisma s'arrête ici. */
function toSnapshot(row: PaymentMandateRow): MandateSnapshot {
  return {
    id: row.id,
    companyId: row.companyId,
    stripeCustomerId: row.stripeCustomerId,
    paymentMethodId: row.paymentMethodId,
    reference: row.reference,
    last4: row.last4,
    bankCode: row.bankCode,
    country: row.country,
    status: row.status,
    acceptedAt: row.acceptedAt,
    revokedAt: row.revokedAt,
    proofStorageKey: row.proofStorageKey,
    proofFileName: row.proofFileName,
    creditorId: row.creditorId,
  };
}
