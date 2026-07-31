/**
 * Registre des ports & URLs **de développement** (localhost) de la suite LFC.
 *
 * Source de vérité UNIQUE : un port n'est écrit qu'ici. Tout le reste en dérive
 * — le shell (`suite-config.dev.ts`) et les CORS dev des backends PIM/B2B
 * l'importent au lieu de recopier le nombre. C'est la Phase 1 du plan
 * `documentation/architecture-suite-gateway-scaling.md` : tuer le drift où le
 * même port vivait dans 2–3 fichiers.
 *
 * Périmètre = **dev uniquement**. Les URLs de prod (Pages, domaines réels) vivent
 * dans `suite-config.ts` et, à terme, les vars de la passerelle — pas ici.
 *
 * ⚠️ Les ports de serve dans les `angular.json` (JSON, non importable) doivent
 * rester alignés sur `DEV_PORTS` : shell→7300, pimFront→7315, b2bFront→7316.
 */

/** Bloc de ports alloué en dev. Le seul endroit où ces nombres sont écrits. */
export const DEV_PORTS = {
  /** Shell hôte de la suite (`lfc-suite-shell`). */
  suiteShell: 7300,
  /** Front PIM (`lfc-PIM-frontend`). */
  pimFront: 7315,
  /** Front B2B (`lfc-B2B-platform-frontend`). */
  b2bFront: 7316,
  /** Backend PIM (`lfc-PIM-backend`). */
  pimBack: 3100,
  /** Backend B2B (`lfc-B2B-platform-backend`). */
  b2bBack: 3200,
  /** Port Angular par défaut, gardé pour un éventuel 2ᵉ front local. */
  spareFront: 4200,
} as const;

const localhost = (port: number): string => `http://localhost:${port}`;

/** URLs dev des fronts (localhost), dérivées de `DEV_PORTS`. */
export const DEV_URLS = {
  suiteShell: localhost(DEV_PORTS.suiteShell),
  pimFront: localhost(DEV_PORTS.pimFront),
  b2bFront: localhost(DEV_PORTS.b2bFront),
} as const;

/**
 * Origines CORS autorisées **en dev** pour chaque backend : son front + le port
 * spare. Type `string[]` (mutable) pour rester assignable à l'option `origin`
 * de NestJS `enableCors`. En prod, les origines viennent de l'environnement
 * (Phase 3), pas de ce registre.
 */
export const DEV_CORS_ORIGINS: Readonly<Record<"pim" | "b2b", string[]>> = {
  pim: [DEV_URLS.pimFront, localhost(DEV_PORTS.spareFront)],
  b2b: [DEV_URLS.b2bFront, localhost(DEV_PORTS.spareFront)],
};
