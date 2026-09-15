import type { DeliveryStepFields } from "@lfd/contracts";
import { Logger } from "@nestjs/common";

import type { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { IdGenerator } from "../../../../platform/id/id-generator.js";
import type { DocumentStore } from "../../../../platform/storage/document-store.js";
import {
  addPhotoCard,
  removePhotoCard,
  reorderPhotoCards,
  revisePhotoCard,
} from "../../../shared/photo-cards/application/photo-card-editing.js";
import type {
  InTransaction,
  OrphanPhotoReason,
  PhotoCardUsage,
} from "../../../shared/photo-cards/application/photo-card-usage.js";
import { DeliveryProcedure } from "../../domain/entities/delivery-procedure.js";
import {
  DeliveryProcedureOrderStaleError,
  DeliveryStepNotFoundError,
} from "../../domain/errors/delivery-procedure-errors.js";
import type { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import type { DeliveryProcedureLock } from "../../domain/ports/delivery-procedure.lock.js";
import type { DeliveryProcedureRepository } from "../../domain/ports/delivery-procedure.repository.js";
import { DeliveryStepContent } from "../../domain/value-objects/delivery-step-content.js";
import { deliveryStepPhotoChange } from "../../domain/value-objects/delivery-step-photo-change.js";
import {
  DeliveryStepPhoto,
  deliveryStepPhotoKey,
} from "../../domain/value-objects/delivery-step-photo.js";
import { ensureDeliveryAddress } from "../services/delivery-address-guard.js";

/**
 * **Les gestes sur une procédure de livraison, sans mur.** L'appelant — le
 * gestionnaire côté client, l'agent côté staff — a déjà décidé du droit d'agir ;
 * il fournit ce qui part dans la transaction avec l'écriture (la trace staff, ou
 * rien).
 *
 * Depuis le 2026-09-15, la séquence (vérifier → ranger → verrou/sauver →
 * nettoyer) et son ordre sont ceux du socle des cartes à photo
 * (`shared/photo-cards/application/photo-card-editing.ts`), que le carnet de
 * notes du commercial partage. Ce fichier ne garde que ce qui est à la
 * procédure : valider une ÉTAPE, l'adresse comme cible et sa vérification, la
 * clé du verrou et du stockage, les mots des refus et du journal.
 *
 * La validation reste AVANT l'appel au socle, et donc avant la vérification de
 * l'adresse : c'est l'ordre d'avant l'extraction, et un contenu refusé ne coûte
 * pas une lecture du carnet.
 */

/** Les ports dont les gestes ont besoin. */
export interface ProcedureEditingPorts {
  readonly addresses: CompanyAddressRepository;
  readonly procedures: DeliveryProcedureRepository;
  readonly lock: DeliveryProcedureLock;
  readonly store: DocumentStore;
  readonly ids: IdGenerator;
  readonly uow: UnitOfWork;
}

/** L'adresse visée, et la société à qui elle doit appartenir. */
export interface ProcedureTarget {
  readonly companyId: string;
  readonly addressId: string;
}

/** Une révision d'étape telle que la commande la porte. */
export interface StepRevision {
  readonly fields: DeliveryStepFields;
  readonly removePhoto: boolean;
  readonly photo: Buffer | null;
}

const logger = new Logger("DeliveryProcedureEditing");

/** Les mots du journal applicatif, inchangés depuis la procédure d'origine. */
const ORPHAN_WHY: Readonly<Record<OrphanPhotoReason, string>> = {
  replaced_or_removed: "photo remplacée ou retirée",
  card_removed: "étape supprimée",
  write_failed: "écriture de la procédure en échec",
};

/** Ajoute une étape en fin de procédure, avec sa photo s'il y en a une ; rend son id. */
export async function addDeliveryStep(
  ports: ProcedureEditingPorts,
  target: ProcedureTarget,
  fields: DeliveryStepFields,
  photoBytes: Buffer | null,
  inTransaction: InTransaction,
): Promise<string> {
  const content = DeliveryStepContent.create(fields);
  const photo = photoBytes === null ? null : DeliveryStepPhoto.create(photoBytes);
  return addPhotoCard(ports, usageOf(ports), target, { content, photo }, inTransaction);
}

/** Refait une étape : titre, texte, et photo gardée, retirée ou remplacée. */
export async function reviseDeliveryStep(
  ports: ProcedureEditingPorts,
  target: ProcedureTarget,
  stepId: string,
  revision: StepRevision,
  inTransaction: InTransaction,
): Promise<void> {
  const content = DeliveryStepContent.create(revision.fields);
  const change = deliveryStepPhotoChange(revision.removePhoto, revision.photo);
  await revisePhotoCard(ports, usageOf(ports), target, stepId, { content, change }, inTransaction);
}

/** Supprime définitivement une étape, puis sa photo du stockage. */
export async function removeDeliveryStep(
  ports: ProcedureEditingPorts,
  target: ProcedureTarget,
  stepId: string,
  inTransaction: InTransaction,
): Promise<void> {
  await removePhotoCard(ports, usageOf(ports), target, stepId, inTransaction);
}

/** Range les étapes dans l'ordre donné — toutes, chacune une fois. */
export async function reorderDeliverySteps(
  ports: ProcedureEditingPorts,
  target: ProcedureTarget,
  stepIds: readonly string[],
  inTransaction: InTransaction,
): Promise<void> {
  await reorderPhotoCards(ports, usageOf(ports), target, stepIds, inTransaction);
}

/**
 * Ce que la procédure branche sur le socle. Le verrou est celui de
 * {@link DeliveryProcedureLock} — clé société/adresse —, et le chargement vient
 * après lui : c'est le socle qui tient cet ordre.
 */
function usageOf(
  ports: ProcedureEditingPorts,
): PhotoCardUsage<ProcedureTarget, DeliveryProcedure, DeliveryStepContent> {
  return {
    identity: {
      ensure: (target) =>
        ensureDeliveryAddress(ports.addresses, target.companyId, target.addressId),
      lock: (target) => ports.lock.acquire(target.companyId, target.addressId),
      photoKey: (target, stepId, revision) =>
        deliveryStepPhotoKey(target.companyId, target.addressId, stepId, revision),
    },
    aggregates: {
      load: (target) => ports.procedures.loadForAddress(target.companyId, target.addressId),
      open: (target, id) => DeliveryProcedure.openFor({ id, ...target }),
      save: (procedure) => ports.procedures.save(procedure),
    },
    gestures: {
      add: (procedure, stepId, content, photoKey) => procedure.addStep(stepId, content, photoKey),
      revise: (procedure, stepId, content) => procedure.reviseStep(stepId, content),
      attachPhoto: (procedure, stepId, photoKey) => procedure.attachPhoto(stepId, photoKey),
      detachPhoto: (procedure, stepId) => procedure.detachPhoto(stepId),
      remove: (procedure, stepId) => procedure.removeStep(stepId),
      reorder: (procedure, stepIds) => procedure.reorder(stepIds),
    },
    missing: {
      cardNotFound: (stepId) => new DeliveryStepNotFoundError(stepId),
      orderStale: () => new DeliveryProcedureOrderStaleError(),
    },
    orphans: {
      remained: (reason, key, trace) =>
        logger.error(
          `Photo de procédure de livraison restée au stockage (${ORPHAN_WHY[reason]}) : ${key}`,
          trace,
        ),
    },
  };
}
