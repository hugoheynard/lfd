import { Buffer } from "node:buffer";

import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { FieldCipher } from "../../../../platform/crypto/field-cipher.js";
import { ScannedDocument } from "../../../../platform/shared/documents/scanned-document.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { MandateNotFoundError } from "../../domain/errors/mandate-errors.js";
import { PaymentMandateRepository } from "../../domain/payment-mandate.repository.js";
import { GetMandateProofQuery } from "./get-mandate-proof.query.js";

/** La pièce, ouverte, et le nom sous lequel on la propose. */
export interface MandateProofFile {
  readonly bytes: Buffer;
  readonly fileName: string;
  readonly contentType: string;
}

/**
 * Rend le scan du mandat signé — **descellé**.
 *
 * ## Pourquoi cette lecture n'existait pas, et pourquoi c'était grave
 *
 * 🔴 Le dépôt existait depuis toujours ; la relecture, jamais. `proofStorageKey`
 * n'avait aucun appelant de production (constaté le 2026-09-12). En
 * contestation, la seule pièce qui prouve le consentement n'était donc PAS
 * productible par le produit : il fallait aller la chercher dans le bucket à la
 * main. Une preuve qu'on ne sait pas ressortir ne prouve rien au moment où l'on
 * en a besoin — et c'est le seul moment qui compte.
 *
 * ## `null` plutôt qu'une erreur quand rien n'est déposé
 *
 * Un mandat sans pièce est un état normal et fréquent : le papier met des jours
 * à revenir. C'est l'absence de MANDAT qui est une erreur, pas l'absence de
 * pièce — et la fiche affiche déjà « mandat sans filet » pour le dire.
 *
 * ## Le type est relu dans les octets
 *
 * Rien ne le porte en base, et depuis le scellement le stockage annonce
 * `application/octet-stream` — ce qui est rangé n'est pas un PDF. Le vrai type
 * se retrouve donc en redonnant les octets descellés au value object qui les a
 * validés à l'entrée : la même fonction, donc le même verdict, et aucune colonne
 * qui pourrait mentir sur ce qu'on sert.
 */
@QueryHandler(GetMandateProofQuery)
export class GetMandateProofHandler implements IQueryHandler<
  GetMandateProofQuery,
  MandateProofFile | null
> {
  constructor(
    private readonly mandates: PaymentMandateRepository,
    private readonly store: DocumentStore,
    private readonly cipher: FieldCipher,
  ) {}

  async execute(query: GetMandateProofQuery): Promise<MandateProofFile | null> {
    const mandate = await this.mandates.findCurrent(query.companyId);
    if (mandate === null) {
      throw new MandateNotFoundError(query.companyId);
    }

    const key = mandate.proofStorageKey();
    const fileName = mandate.toSnapshot().proofFileName;
    if (key === null || fileName === null) {
      return null;
    }

    // `readIfPresent` : la base annonce une pièce que le bucket pourrait ne pas
    // avoir — c'est exactement le couple qu'on a rencontré sur un logo le
    // 2026-09-12. On le sert comme une absence, le geste de sortie étant le
    // même (redéposer).
    const sealed = await this.store.readIfPresent(key);
    if (sealed === null) {
      return null;
    }

    const bytes = this.cipher.openBytes(sealed);
    return { bytes, fileName, contentType: ScannedDocument.create(fileName, bytes).contentType };
  }
}
