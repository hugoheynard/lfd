import {
  TEMPLATE_DESCRIPTION_MAX,
  TEMPLATE_NAME_MAX,
  templateNameKey,
} from "@lfd/storefront-layout";

import {
  type ObjectSettingsInput,
  ObjectSettings,
  type ObjectSettingsState,
} from "./object-settings.js";
import { InvalidStorefrontError } from "./storefront-errors.js";

/** Un gabarit, en primitives validées. */
export interface StorefrontTemplateState {
  readonly id: string;
  readonly name: string;
  /** La clé d'unicité du nom : sans casse, sans accents (`templateNameKey`). */
  readonly nameKey: string;
  /** Absente plutôt que vide. */
  readonly description: string | null;
  readonly settings: ObjectSettingsState;
}

export interface StorefrontTemplateInput {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly settings: ObjectSettingsInput;
}

/**
 * **Un gabarit** : un objet réglé, enregistré sous un nom
 * (`boutique-rayon-layout.md`, « Les gabarits »). Ni position, ni rayons, ni
 * contenus. L'objet posé depuis un gabarit en est une COPIE : modifier le
 * gabarit ensuite ne touche pas les objets déjà posés.
 *
 * L'unicité du nom se juge sur l'ensemble des gabarits : c'est la vitrine qui
 * la tient, par la clé que celui-ci calcule.
 */
export class StorefrontTemplate {
  private constructor(readonly state: StorefrontTemplateState) {}

  /** @throws {InvalidStorefrontError} nom vide ou trop long, description trop longue, réglage refusé. */
  static of(input: StorefrontTemplateInput): StorefrontTemplate {
    const name = input.name.trim();
    if (name === "" || name.length > TEMPLATE_NAME_MAX) {
      throw new InvalidStorefrontError(
        "template",
        `Un gabarit porte un nom, en ${String(TEMPLATE_NAME_MAX)} caractères au plus.`,
      );
    }
    const description = input.description?.trim() ?? "";
    if (description.length > TEMPLATE_DESCRIPTION_MAX) {
      throw new InvalidStorefrontError(
        "template",
        `La description du gabarit « ${name} » tient en ${String(TEMPLATE_DESCRIPTION_MAX)} caractères.`,
      );
    }
    return new StorefrontTemplate({
      id: input.id,
      name,
      nameKey: templateNameKey(name),
      description: description === "" ? null : description,
      settings: ObjectSettings.of(input.settings).state,
    });
  }

  get id(): string {
    return this.state.id;
  }
}
