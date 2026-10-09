import type { ContactAudience } from '@lfd/contracts';

/** Le nom d'un public d'objet, tel que l'écran le dit. */
export const CONTACT_AUDIENCE_LABELS: Readonly<Record<ContactAudience, string>> = {
  b2b: 'Pros',
  b2c: 'Particuliers',
  both: 'Pros et particuliers',
};

/** Les choix du public, dans l'ordre du contrat. */
export const CONTACT_AUDIENCE_OPTIONS: readonly {
  readonly value: ContactAudience;
  readonly label: string;
}[] = (['both', 'b2b', 'b2c'] as const).map((value) => ({
  value,
  label: CONTACT_AUDIENCE_LABELS[value],
}));
