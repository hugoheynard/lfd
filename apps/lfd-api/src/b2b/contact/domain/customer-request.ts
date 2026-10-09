import {
  CONTACT_BOUNDS,
  REQUEST_PHOTO_BOUNDS,
  type CustomerAudience,
  type RequestKind,
  type RequestPriority,
} from "@lfd/contracts";

import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";
import { EmailAddress } from "../../account/domain/value-objects/email-address.js";
import { boundedText } from "./contact-text.js";
import {
  anonymizeDetails,
  bearsPhotos,
  requestPhotoKey,
  type CustomerRequestDetails,
  type ReportedOrderRef,
  type RequestPhotoRef,
} from "./customer-request-details.js";
import {
  CustomerRequestAlreadyHandledError,
  CustomerRequestIncompleteError,
  RequestClosedToPhotosError,
  RequestPhotosNotAllowedError,
  TooManyRequestPhotosError,
} from "./errors/contact-errors.js";
import type { RequestPhoto } from "./request-photo.js";

/** Qui écrit : saisi par le visiteur, pris au compte pour un client connecté. */
export interface RequestAuthor {
  readonly name: string;
  readonly email: string;
  /** Vide quand il ne l'a pas donné. */
  readonly phone: string;
}

/** Le motif figé à la réception : son libellé français et sa priorité. */
export interface FrozenReason {
  readonly id: string;
  readonly labelFr: string;
  readonly priority: RequestPriority;
}

/** Le traitement d'une demande : quand, et par qui (figé). */
export interface RequestHandling {
  readonly at: Date;
  readonly by: StaffTrace;
}

/** L'ENVELOPPE commune à tous les types, puis les détails du sien. */
export interface CustomerRequestState {
  readonly id: string;
  readonly reason: FrozenReason;
  readonly audience: CustomerAudience;
  readonly author: RequestAuthor;
  readonly body: string;
  readonly userId: string | null;
  readonly companyId: string | null;
  readonly receivedAt: Date;
  readonly handling: RequestHandling | null;
  readonly anonymizedAt: Date | null;
  readonly details: CustomerRequestDetails;
}

/** Ce qu'il faut pour recevoir une demande, quel que soit son type. */
export interface RequestReception {
  readonly id: string;
  readonly reason: FrozenReason;
  readonly audience: CustomerAudience;
  readonly author: RequestAuthor;
  readonly body: string;
  readonly userId: string | null;
  readonly companyId: string | null;
  readonly at: Date;
}

/**
 * **Une demande client** — l'agrégat (`demandes-clients.md`, §2, §6, §7) :
 * une enveloppe commune (motif figé, auteur, texte, traitement,
 * anonymisation) et les détails de son type.
 *
 * Ses invariants : reçue avec un auteur nommé et joignable (et un texte, pour
 * « Nous écrire ») ; des photos seulement sur un type qui en admet, trois au
 * plus, jamais après traitement ; traitée **une fois** ; anonymisée une fois,
 * en rendant les objets de stockage à purger.
 *
 * Une factory par type : c'est elle qui nomme ce qu'on reçoit.
 */
export class CustomerRequest {
  private constructor(private state: CustomerRequestState) {}

  /** Un message « Nous écrire ». @throws {CustomerRequestIncompleteError} sans nom ou sans texte. */
  static contact(input: RequestReception): CustomerRequest {
    return CustomerRequest.receive(input, { kind: "contact" }, true);
  }

  /** Un signalement sur une commande retirée ou livrée ; le mot est facultatif. */
  static orderProblem(
    input: RequestReception & { readonly order: ReportedOrderRef },
  ): CustomerRequest {
    return CustomerRequest.receive(
      input,
      { kind: "order_problem", order: input.order, photos: [] },
      false,
    );
  }

  /** Réhydrate depuis la base. Une demande anonymisée a ses champs vides : pas de revalidation. */
  static rehydrate(state: CustomerRequestState): CustomerRequest {
    return new CustomerRequest(state);
  }

  private static receive(
    input: RequestReception,
    details: CustomerRequestDetails,
    bodyRequired: boolean,
  ): CustomerRequest {
    const name = boundedText("Nom", input.author.name, CONTACT_BOUNDS.authorName);
    const body = boundedText("Message", input.body, CONTACT_BOUNDS.message);
    if (name === "") {
      throw new CustomerRequestIncompleteError("name");
    }
    if (bodyRequired && body === "") {
      throw new CustomerRequestIncompleteError("message");
    }
    return new CustomerRequest({
      id: input.id,
      reason: input.reason,
      audience: input.audience,
      author: {
        name,
        email: EmailAddress.create(input.author.email).value,
        phone: boundedText("Téléphone", input.author.phone, CONTACT_BOUNDS.authorPhone),
      },
      body,
      userId: input.userId,
      companyId: input.companyId,
      receivedAt: input.at,
      handling: null,
      anonymizedAt: null,
      details,
    });
  }

  /**
   * Joint une photo validée ; rend sa référence, dont la clé de stockage.
   *
   * @throws {RequestPhotosNotAllowedError} le type n'admet pas de photo.
   * @throws {RequestClosedToPhotosError} la demande est traitée ou anonymisée.
   * @throws {TooManyRequestPhotosError} il y en a déjà trois.
   */
  attachPhoto(photoId: string, photo: RequestPhoto, at: Date): RequestPhotoRef {
    const { details } = this.state;
    if (!bearsPhotos(details)) {
      throw new RequestPhotosNotAllowedError();
    }
    if (this.state.handling !== null || this.state.anonymizedAt !== null) {
      throw new RequestClosedToPhotosError(this.state.id);
    }
    if (details.photos.length >= REQUEST_PHOTO_BOUNDS.maxCount) {
      throw new TooManyRequestPhotosError(REQUEST_PHOTO_BOUNDS.maxCount);
    }
    const ref: RequestPhotoRef = {
      id: photoId,
      position: details.photos.length,
      storageKey: requestPhotoKey(this.state.id, photoId),
      contentType: photo.contentType,
      sizeBytes: photo.sizeBytes,
      createdAt: at,
      purgedAt: null,
    };
    this.state = { ...this.state, details: { ...details, photos: [...details.photos, ref] } };
    return ref;
  }

  /** @throws {CustomerRequestAlreadyHandledError} elle l'est déjà. */
  markHandled(by: StaffTrace, at: Date): void {
    if (this.state.handling !== null) {
      throw new CustomerRequestAlreadyHandledError(this.state.id, this.state.handling.by.name);
    }
    this.state = { ...this.state, handling: { at, by } };
  }

  /**
   * Vide ce qui relie la demande à une personne — auteur, texte,
   * rattachements, et les détails de son type (commande, photos). Rend les
   * clés de stockage à SUPPRIMER : une photo d'un colis ou d'un lieu peut
   * identifier. Idempotent : une demande déjà anonymisée rend `[]`.
   */
  anonymize(at: Date): readonly string[] {
    if (this.state.anonymizedAt !== null) {
      return [];
    }
    const { details, purge } = anonymizeDetails(this.state.details, at);
    this.state = {
      ...this.state,
      author: { name: "", email: "", phone: "" },
      body: "",
      userId: null,
      companyId: null,
      anonymizedAt: at,
      details,
    };
    return purge;
  }

  get id(): string {
    return this.state.id;
  }

  get kind(): RequestKind {
    return this.state.details.kind;
  }

  get reasonLabel(): string {
    return this.state.reason.labelFr;
  }

  get author(): RequestAuthor {
    return this.state.author;
  }

  get details(): CustomerRequestDetails {
    return this.state.details;
  }

  toPersistence(): CustomerRequestState {
    return this.state;
  }
}
