import type { VitrineContent } from "@lfd/contracts";

import {
  VitrineSubscriberDescriptionTooLongError,
  VitrineSubscriberInactiveError,
  VitrineSubscriberNameInvalidError,
} from "./errors/vitrine-errors.js";
import { EmailAddress } from "../../account/domain/value-objects/email-address.js";
import { VitrineContents } from "./vitrine-contents.js";
import { VitrineEndpoint } from "./vitrine-endpoint.js";

/** Le nom de l'agence, pas une description. */
export const VITRINE_SUBSCRIBER_NAME_MAX = 120;

/** À quoi sert l'abonné, pour le staff : quelques phrases, pas un dossier. */
export const VITRINE_SUBSCRIBER_DESCRIPTION_MAX = 500;

/**
 * Ce qu'on range d'un secret et d'une clé : le secret SCELLÉ (il faut le
 * relire pour signer), la clé HACHÉE (elle n'est que comparée).
 */
export interface StoredVitrineCredentials {
  readonly signingSecretSealed: string;
  readonly readKeyHash: string;
}

export interface VitrineSubscriberState extends StoredVitrineCredentials {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly contactEmail: EmailAddress | null;
  readonly endpoint: VitrineEndpoint;
  readonly contents: VitrineContents;
  readonly active: boolean;
  readonly failedAt: Date | null;
  readonly lastSequence: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** L'état tel que la base le rend : URL et cases en clair, revalidées. */
export type VitrineSubscriberRow = Omit<
  VitrineSubscriberState,
  "endpoint" | "contents" | "contactEmail"
> & {
  readonly contactEmail: string | null;
  readonly endpointUrl: string;
  readonly contents: readonly string[];
};

export interface DeclareVitrineSubscriber {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly contactEmail: string | null;
  readonly endpointUrl: string;
  readonly contents: readonly string[];
  readonly credentials: StoredVitrineCredentials;
  readonly at: Date;
}

/**
 * **Un abonné du webhook de la vitrine** (plan vitrine, W2 et B3).
 *
 * Ses invariants : une adresse `https` sans requête, un nom, des cases
 * connues ; une séquence qui ne fait que croître ; et l'état « en échec »,
 * posé quand une livraison a épuisé ses essais, que seul « tout renvoyer »
 * lève — jamais un simple rallumage, qui laisserait diverger l'agence sans
 * resynchronisation. Jamais supprimé : on le coupe.
 */
export class VitrineSubscriber {
  private constructor(private state: VitrineSubscriberState) {}

  /**
   * @throws {VitrineSubscriberNameInvalidError} {VitrineContentUnknownError}
   * @throws {VitrineEndpointInvalidError} {VitrineEndpointNotHttpsError} {VitrineEndpointCarriesSecretError}
   */
  static declare(input: DeclareVitrineSubscriber): VitrineSubscriber {
    return new VitrineSubscriber({
      id: input.id,
      name: validName(input.name),
      description: validDescription(input.description),
      contactEmail: validContact(input.contactEmail),
      endpoint: VitrineEndpoint.of(input.endpointUrl),
      contents: VitrineContents.of(input.contents),
      signingSecretSealed: input.credentials.signingSecretSealed,
      readKeyHash: input.credentials.readKeyHash,
      active: true,
      failedAt: null,
      lastSequence: 0,
      createdAt: input.at,
      updatedAt: input.at,
    });
  }

  /** Réhydrate depuis la base : l'adresse et les cases revalident. */
  static rehydrate(row: VitrineSubscriberRow): VitrineSubscriber {
    return new VitrineSubscriber({
      ...row,
      contactEmail: validContact(row.contactEmail),
      endpoint: VitrineEndpoint.of(row.endpointUrl),
      contents: VitrineContents.of(row.contents),
    });
  }

  /** @throws {VitrineSubscriberNameInvalidError} */
  rename(name: string, at: Date): void {
    this.state = { ...this.state, name: validName(name), updatedAt: at };
  }

  /**
   * Une description vide vaut « aucune » : l'effacer est un geste admis.
   *
   * @throws {VitrineSubscriberDescriptionTooLongError}
   */
  describe(description: string | null, at: Date): void {
    this.state = { ...this.state, description: validDescription(description), updatedAt: at };
  }

  /**
   * L'adresse où écrire à l'agence ; vide ou `null` l'efface.
   *
   * @throws {InvalidEmailError}
   */
  setContact(contactEmail: string | null, at: Date): void {
    this.state = { ...this.state, contactEmail: validContact(contactEmail), updatedAt: at };
  }

  /** Un secret et une clé neufs : les anciens cessent de valoir à l'instant. */
  rotate(credentials: StoredVitrineCredentials, at: Date): void {
    this.state = { ...this.state, ...credentials, updatedAt: at };
  }

  /** @throws {VitrineContentUnknownError} */
  chooseContents(contents: readonly string[], at: Date): void {
    this.state = { ...this.state, contents: VitrineContents.of(contents), updatedAt: at };
  }

  /** Couper ou rallumer. Rallumer ne lève pas l'échec : « tout renvoyer » le fait. */
  setActive(active: boolean, at: Date): void {
    if (this.state.active === active) {
      return;
    }
    this.state = { ...this.state, active, updatedAt: at };
  }

  /** La séquence de la prochaine livraison de changements — strictement croissante. */
  takeSequence(at: Date): number {
    const sequence = this.state.lastSequence + 1;
    this.state = { ...this.state, lastSequence: sequence, updatedAt: at };
    return sequence;
  }

  /** Une livraison a épuisé ses essais : plus rien ne part. Idempotent. */
  markFailed(at: Date): void {
    if (this.state.failedAt !== null) {
      return;
    }
    this.state = { ...this.state, failedAt: at, updatedAt: at };
  }

  /**
   * « Tout renvoyer » : l'échec est levé, et l'appelant oublie les empreintes
   * émises pour que le prochain balayage renvoie tout.
   *
   * @throws {VitrineSubscriberInactiveError} l'abonné est coupé.
   */
  resynchronize(at: Date): void {
    this.assertActive();
    this.state = { ...this.state, failedAt: null, updatedAt: at };
  }

  /** @throws {VitrineSubscriberInactiveError} */
  assertActive(): void {
    if (!this.state.active) {
      throw new VitrineSubscriberInactiveError(this.state.name);
    }
  }

  /** Allumé et pas en échec : le balayage le compare, le relais lui livre. */
  get isDeliverable(): boolean {
    return this.state.active && this.state.failedAt === null;
  }

  receives(content: VitrineContent): boolean {
    return this.state.contents.has(content);
  }

  get id(): string {
    return this.state.id;
  }

  get name(): string {
    return this.state.name;
  }

  get description(): string | null {
    return this.state.description;
  }

  get contactEmail(): string | null {
    return this.state.contactEmail?.value ?? null;
  }

  get endpointUrl(): string {
    return this.state.endpoint.value;
  }

  get contents(): VitrineContents {
    return this.state.contents;
  }

  get signingSecretSealed(): string {
    return this.state.signingSecretSealed;
  }

  toPersistence(): VitrineSubscriberRow {
    const { endpoint, contents, contactEmail, ...rest } = this.state;
    return {
      ...rest,
      contactEmail: contactEmail?.value ?? null,
      endpointUrl: endpoint.value,
      contents: contents.list(),
    };
  }
}

function validName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "" || trimmed.length > VITRINE_SUBSCRIBER_NAME_MAX) {
    throw new VitrineSubscriberNameInvalidError(VITRINE_SUBSCRIBER_NAME_MAX);
  }
  return trimmed;
}

function validDescription(description: string | null): string | null {
  const trimmed = description?.trim() ?? "";
  if (trimmed === "") {
    return null;
  }
  if (trimmed.length > VITRINE_SUBSCRIBER_DESCRIPTION_MAX) {
    throw new VitrineSubscriberDescriptionTooLongError(VITRINE_SUBSCRIBER_DESCRIPTION_MAX);
  }
  return trimmed;
}

function validContact(contactEmail: string | null): EmailAddress | null {
  const trimmed = contactEmail?.trim() ?? "";
  return trimmed === "" ? null : EmailAddress.create(trimmed);
}
