import { computed, linkedSignal, signal, type Signal, type WritableSignal } from '@angular/core';

import {
  SOURCE_LOCALE,
  missingLocales,
  writeLocalized,
  type Locale,
  type LocalizedText,
} from '@lfd/pim-contracts';

import { LOCALE_NAMES, missingSentence } from './locale-names';

/**
 * Un champ **traduisible** en cours de saisie : son texte, la langue qu'on
 * regarde, et tout ce dont {@link LangSwitch} a besoin pour le dire.
 *
 * Deux signaux et non un par langue : le texte est la donnée qu'on enregistre,
 * la langue n'est qu'un point de vue dessus. Un champ par langue remettrait
 * dans l'écran une liste que le contrat tient déjà, et il faudrait la rallonger
 * ici le jour où une quatrième langue s'ouvre.
 */
export interface LocalizedField {
  /** Le texte complet — c'est LUI qu'on enregistre, jamais la vue courante. */
  readonly text: WritableSignal<LocalizedText>;
  /** La langue affichée. Le sélecteur l'écrit, le champ la lit. */
  readonly locale: WritableSignal<Locale>;
  /** Le texte dans la langue affichée — vide tant qu'elle n'est pas traduite. */
  readonly value: Signal<string>;
  /** Les langues qui manquent — le point ambre du sélecteur. */
  readonly missing: Signal<readonly Locale[]>;
  /** Ce qui manque, en toutes lettres. Le point seul ne dit pas quoi. */
  readonly hint: Signal<string | undefined>;
  /** Le libellé, langue comprise : trois champs identiques se confondent. */
  readonly label: Signal<string>;
  /** Écrit dans la langue affichée, sans toucher aux autres. */
  set(value: string): void;
  /** La langue **source** est-elle renseignée ? La seule qui décide d'un envoi. */
  readonly filled: Signal<boolean>;
}

/**
 * Fabrique un {@link LocalizedField} **dérivé** d'une source.
 *
 * `linkedSignal` et non un `signal` amorcé : l'entrée d'un panneau n'est pas
 * posée à la construction, et l'amorcer dans une micro-tâche laisse une fenêtre
 * où le champ est vide — assez pour qu'un enregistrement précoce parte avec un
 * nom vide.
 *
 * À appeler depuis un contexte d'injection (initialisation de champ de classe).
 *
 * ⚠️ `ProductFormStore` porte le même motif, écrit avant celui-ci et non encore
 * converti — cf. `documentation/pim/todo.md`. Deux copies d'une règle de
 * saisie finissent par ne plus dire la même chose de « traduit ».
 */
export function localizedField(options: {
  /** Le texte de départ, relu à chaque fois que la source change. */
  readonly source: () => LocalizedText;
  /** Le nom du champ, sans la langue — « Nom », « Description ». */
  readonly label: string;
  /** Le sujet de la phrase d'explication — « Le nom manque ». */
  readonly subject: string;
}): LocalizedField {
  const text = linkedSignal<LocalizedText>(options.source);
  const locale = signal<Locale>(SOURCE_LOCALE);
  const missing = computed(() => missingLocales(text()));

  return {
    text,
    locale,
    missing,
    value: computed(() => text()[locale()] ?? ''),
    hint: computed(() => missingSentence(options.subject, missing())),
    label: computed(() => `${options.label} (${LOCALE_NAMES[locale()]})`),
    filled: computed(() => (text()[SOURCE_LOCALE] ?? '').trim() !== ''),
    set(value: string): void {
      text.update((current) => writeLocalized(current, locale(), value));
    },
  };
}
