/**
 * **3 messages par 10 minutes et par IP** (`plan-nous-ecrire.md`, §5.2), sur
 * les deux routes d'écriture — visiteur et client connecté. `getTracker` clé
 * sur l'IP cliente (`security.module.ts`) : ce débit borne la maladresse et la
 * rafale, pas l'acharnement.
 */
export const CONTACT_MESSAGE_THROTTLE = { default: { limit: 3, ttl: 600_000 } } as const;
