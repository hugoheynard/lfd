import type { DeliveryStepFields } from "@lfd/contracts";
import { Logger } from "@nestjs/common";

import type { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { IdGenerator } from "../../../../platform/id/id-generator.js";
import type { DocumentStore } from "../../../../platform/storage/document-store.js";
import { DeliveryProcedure } from "../../domain/entities/delivery-procedure.js";
import {
  DeliveryProcedureOrderStaleError,
  DeliveryStepNotFoundError,
} from "../../domain/errors/delivery-procedure-errors.js";
import type { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import type { DeliveryProcedureLock } from "../../domain/ports/delivery-procedure.lock.js";
import type { DeliveryProcedureRepository } from "../../domain/ports/delivery-procedure.repository.js";
import { DeliveryStepContent } from "../../domain/value-objects/delivery-step-content.js";
import {
  type DeliveryStepPhotoChange,
  deliveryStepPhotoChange,
} from "../../domain/value-objects/delivery-step-photo-change.js";
import {
  DeliveryStepPhoto,
  deliveryStepPhotoKey,
} from "../../domain/value-objects/delivery-step-photo.js";
import { ensureDeliveryAddress } from "../services/delivery-address-guard.js";

/**
 * **Les gestes sur une procédure de livraison, sans mur.** L'appelant — le
 * gestionnaire côté client, l'agent côté staff — a déjà décidé du droit d'agir ;
 * il fournit ce qui part dans la transaction avec l'écriture (la trace staff, ou
 * rien). Même découpe que `ingest-kbis.ts` : la séquence et son ordre ne
 * s'écrivent qu'une fois pour les deux portes.
 *
 * ## L'ordre des gestes est le sujet (plan §2.3)
 *
 * 1. **Valider** le contenu et la photo — rien de douteux ne part au stockage ;
 * 2. **ranger** la photo neuve sous une clé qui n'a jamais servi ;
 * 3. **verrouiller la procédure, puis charger, muter, sauver** en unité de
 *    travail — voir {@link serialized} ;
 * 4. **après** le commit seulement, supprimer l'ancienne photo.
 *
 * Si l'écriture échoue, la photo neuve est retirée (au mieux) : la base ne
 * pointe pas vers elle. Si la suppression de l'ancienne échoue, la requête
 * réussit quand même — un objet orphelin dans un bucket privé ne coûte rien,
 * une procédure refusée pour ça coûterait au client.
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

/** Ce qui s'écrit dans la même transaction que la procédure. */
export type InTransaction = () => Promise<void>;

/** Le chemin client n'inscrit rien : le gestionnaire agit sur son propre compte. */
export const NOTHING_TO_TRACE: InTransaction = () => Promise.resolve();

/** Une révision d'étape telle que la commande la porte. */
export interface StepRevision {
  readonly fields: DeliveryStepFields;
  readonly removePhoto: boolean;
  readonly photo: Buffer | null;
}

const logger = new Logger("DeliveryProcedureEditing");

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
  await ensureDeliveryAddress(ports.addresses, target.companyId, target.addressId);

  const stepId = ports.ids.next();
  const photoKey = photo === null ? null : await storePhoto(ports, target, stepId, photo);
  await writeOrDiscard(ports, target, photoKey, async () => {
    const procedure =
      (await ports.procedures.loadForAddress(target.companyId, target.addressId)) ??
      DeliveryProcedure.openFor({ id: ports.ids.next(), ...target });
    procedure.addStep(stepId, content, photoKey);
    await ports.procedures.save(procedure);
    await inTransaction();
  });
  return stepId;
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
  await ensureDeliveryAddress(ports.addresses, target.companyId, target.addressId);

  const freshKey =
    change.kind === "replace" ? await storePhoto(ports, target, stepId, change.photo) : null;
  const orphan = await writeOrDiscard(ports, target, freshKey, async () => {
    const procedure = await loadOrFail(ports, target, stepId);
    procedure.reviseStep(stepId, content);
    const previous = applyPhotoChange(procedure, stepId, change, freshKey);
    await ports.procedures.save(procedure);
    await inTransaction();
    return previous;
  });
  await discardQuietly(ports.store, orphan, "photo remplacée ou retirée");
}

/** Supprime définitivement une étape, puis sa photo du stockage. */
export async function removeDeliveryStep(
  ports: ProcedureEditingPorts,
  target: ProcedureTarget,
  stepId: string,
  inTransaction: InTransaction,
): Promise<void> {
  await ensureDeliveryAddress(ports.addresses, target.companyId, target.addressId);
  const orphan = await serialized(ports, target, async () => {
    const procedure = await loadOrFail(ports, target, stepId);
    const photoKey = procedure.removeStep(stepId);
    await ports.procedures.save(procedure);
    await inTransaction();
    return photoKey;
  });
  await discardQuietly(ports.store, orphan, "étape supprimée");
}

/** Range les étapes dans l'ordre donné — toutes, chacune une fois. */
export async function reorderDeliverySteps(
  ports: ProcedureEditingPorts,
  target: ProcedureTarget,
  stepIds: readonly string[],
  inTransaction: InTransaction,
): Promise<void> {
  await ensureDeliveryAddress(ports.addresses, target.companyId, target.addressId);
  await serialized(ports, target, async () => {
    const procedure = await ports.procedures.loadForAddress(target.companyId, target.addressId);
    // Aucune procédure : l'écran envoie l'ordre d'étapes qui n'existent plus.
    if (procedure === null) {
      throw new DeliveryProcedureOrderStaleError();
    }
    procedure.reorder(stepIds);
    await ports.procedures.save(procedure);
    await inTransaction();
  });
}

/**
 * Exécute `work` en unité de travail, **sous le verrou de la procédure**, pris en
 * première instruction de la transaction.
 *
 * Pourquoi : `save` supprime les étapes ABSENTES de l'agrégat chargé. Sans
 * sérialisation, deux ajouts simultanés chargent chacun la procédure d'avant,
 * et le second enregistrement efface l'étape du premier (sa photo reste alors
 * orpheline au stockage). Le verrou couvre aussi deux créations concurrentes de
 * la racine, que l'unique sur `address_id` refuserait en 500.
 *
 * Le chargement vient APRÈS le verrou, dans `work` : en READ COMMITTED, chaque
 * instruction voit ce que la transaction concurrente a commité pendant
 * l'attente.
 */
function serialized<T>(
  ports: ProcedureEditingPorts,
  target: ProcedureTarget,
  work: () => Promise<T>,
): Promise<T> {
  return ports.uow.run(async () => {
    await ports.lock.acquire(target.companyId, target.addressId);
    return work();
  });
}

/** Range la photo sous une clé neuve — la révision change à chaque dépôt. */
async function storePhoto(
  ports: ProcedureEditingPorts,
  target: ProcedureTarget,
  stepId: string,
  photo: DeliveryStepPhoto,
): Promise<string> {
  const key = deliveryStepPhotoKey(target.companyId, target.addressId, stepId, ports.ids.next());
  return ports.store.save(key, { bytes: photo.bytes, contentType: photo.contentType });
}

/** La procédure qui porte l'étape ; sans procédure, l'étape est introuvable. */
async function loadOrFail(
  ports: ProcedureEditingPorts,
  target: ProcedureTarget,
  stepId: string,
): Promise<DeliveryProcedure> {
  const procedure = await ports.procedures.loadForAddress(target.companyId, target.addressId);
  if (procedure === null) {
    throw new DeliveryStepNotFoundError(stepId);
  }
  return procedure;
}

/** Applique le changement de photo et rend la clé devenue orpheline. */
function applyPhotoChange(
  procedure: DeliveryProcedure,
  stepId: string,
  change: DeliveryStepPhotoChange,
  freshKey: string | null,
): string | null {
  if (change.kind === "remove") {
    return procedure.detachPhoto(stepId);
  }
  return freshKey === null ? null : procedure.attachPhoto(stepId, freshKey);
}

/** Écrit en unité de travail ; en cas d'échec, retire la photo qu'on venait de ranger. */
async function writeOrDiscard<T>(
  ports: ProcedureEditingPorts,
  target: ProcedureTarget,
  freshKey: string | null,
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await serialized(ports, target, work);
  } catch (error) {
    await discardQuietly(ports.store, freshKey, "écriture de la procédure en échec");
    throw error;
  }
}

/**
 * Supprime un objet du stockage **sans faire échouer la requête**. L'échec se
 * journalise : un objet orphelin dans un bucket privé ne fuit rien, et le geste
 * du client a déjà réussi en base.
 */
async function discardQuietly(
  store: DocumentStore,
  key: string | null,
  why: string,
): Promise<void> {
  if (key === null) {
    return;
  }
  try {
    await store.delete(key);
  } catch (error) {
    logger.error(
      `Photo de procédure de livraison restée au stockage (${why}) : ${key}`,
      error instanceof Error ? error.stack : String(error),
    );
  }
}
