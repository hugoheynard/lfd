import {
  allowedSides,
  CAROUSEL_NAVS,
  type CarouselNav,
  describeFormat,
  FIRST_SECONDS,
  INTERVAL_SECONDS,
  MEDIA_FITS,
  MEDIA_SIDES,
  type MediaFit,
  type MediaSide,
  SAMPLE_COUNT,
  STOREFRONT_SHAPES,
  STOREFRONT_TONES,
  type StorefrontShape,
  type StorefrontTone,
} from "@lfd/storefront-layout";

import { InvalidStorefrontError } from "./storefront-errors.js";

/** Le défilement, en primitives. */
export interface CarouselState {
  readonly nav: CarouselNav;
  readonly autoplay: boolean;
  readonly intervalSeconds: number;
  readonly firstSeconds: number;
  readonly sampleCount: number;
}

/** Les réglages d'un objet, en primitives validées. */
export interface ObjectSettingsState {
  readonly shape: StorefrontShape;
  readonly applyOnMobile: boolean;
  readonly mediaFit: MediaFit;
  readonly mediaSide: MediaSide;
  readonly multiple: boolean;
  readonly carousel: CarouselState;
  readonly tone: StorefrontTone;
}

/**
 * Les réglages tels qu'ils ARRIVENT : du contrat, ou d'une ligne en base. Les
 * listes fermées y sont des chaînes, que {@link ObjectSettings.of} confronte à
 * la table de `@lfd/storefront-layout` — la même que l'éditeur et la boutique.
 */
export interface ObjectSettingsInput {
  readonly shape: string;
  readonly applyOnMobile: boolean;
  readonly mediaFit: string;
  readonly mediaSide: string;
  readonly multiple: boolean;
  readonly carousel: Omit<CarouselState, "nav"> & { readonly nav: string };
  readonly tone: string;
}

/**
 * **Les réglages d'un objet** — forme, image, mobile, défilement, ton. Ce
 * qu'un gabarit garde d'un objet : ni position, ni rayons, ni contenus.
 *
 * Il refuse ce qui ne dépend que de lui : un côté d'image que sa forme ne
 * permet pas, une durée hors bornes. Le défilement est validé MÊME quand
 * l'objet n'a qu'un contenu : il est conservé, inactif, et redeviendra actif
 * sans être revérifié.
 *
 * Le ton est accepté sur TOUTE forme (plan, D3) : un produit en carte 1×1
 * l'ignore au rendu (`toneApplies`), il ne le refuse pas.
 */
export class ObjectSettings {
  private constructor(readonly state: ObjectSettingsState) {}

  /** @throws {InvalidStorefrontError} une valeur hors liste, un côté interdit, une durée hors bornes. */
  static of(input: ObjectSettingsInput): ObjectSettings {
    const shape = member(STOREFRONT_SHAPES, input.shape, "une forme");
    const mediaSide = member(MEDIA_SIDES, input.mediaSide, "un côté d'image");
    if (!allowedSides(shape).includes(mediaSide)) {
      throw new InvalidStorefrontError(
        "settings",
        `« ${describeFormat(shape)} » ne place pas son image « ${mediaSide} » : choisissez parmi ${allowedSides(shape).join(", ")}.`,
      );
    }
    return new ObjectSettings({
      shape,
      applyOnMobile: input.applyOnMobile,
      mediaFit: member(MEDIA_FITS, input.mediaFit, "un cadrage"),
      mediaSide,
      multiple: input.multiple,
      carousel: carouselOf(input.carousel),
      tone: member(STOREFRONT_TONES, input.tone, "un ton"),
    });
  }
}

function carouselOf(input: ObjectSettingsInput["carousel"]): CarouselState {
  within(input.intervalSeconds, INTERVAL_SECONDS, "Chaque contenu s'affiche", "secondes");
  within(input.firstSeconds, FIRST_SECONDS, "Le premier contenu s'affiche", "secondes");
  within(input.sampleCount, SAMPLE_COUNT, "L'aperçu simule", "contenus");
  return {
    nav: member(CAROUSEL_NAVS, input.nav, "une navigation"),
    autoplay: input.autoplay,
    intervalSeconds: input.intervalSeconds,
    firstSeconds: input.firstSeconds,
    sampleCount: input.sampleCount,
  };
}

function within(
  value: number,
  bounds: { readonly min: number; readonly max: number },
  subject: string,
  unit: string,
): void {
  if (!Number.isInteger(value) || value < bounds.min || value > bounds.max) {
    throw new InvalidStorefrontError(
      "settings",
      `${subject} de ${String(bounds.min)} à ${String(bounds.max)} ${unit}, en nombre entier.`,
    );
  }
}

/** La valeur, si elle est dans la liste fermée ; sinon le refus qui nomme la liste. */
function member<T extends string>(list: readonly T[], value: string, what: string): T {
  const found = list.find((candidate) => candidate === value);
  if (found === undefined) {
    throw new InvalidStorefrontError(
      "settings",
      `« ${value} » n'est pas ${what} de la vitrine : choisissez parmi ${list.join(", ")}.`,
    );
  }
  return found;
}
