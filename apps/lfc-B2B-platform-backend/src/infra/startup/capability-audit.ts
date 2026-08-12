/**
 * L'inventaire des **canaux optionnels** : ce que l'app sait faire, et ce
 * qu'elle ne saura pas faire ce matin.
 *
 * Trois variables seulement font échouer le démarrage (base, domaine et
 * audience Auth0) : sans elles, rien ne fonctionne, et mourir tôt vaut mieux
 * que servir des erreurs. Tout le reste éteint **une** capacité — et rendre ces
 * réglages obligatoires mettrait la boutique hors ligne pour une invitation
 * cassée, ce qui serait un très mauvais échange.
 *
 * Le défaut n'était donc pas l'optionnalité : c'était le **silence**. Le système
 * savait, il l'écrivait dans un log que personne ne lit, et le symptôme
 * apparaissait des heures plus tard sous une forme qui n'orientait vers rien
 * (« Aucun accès », un bouton qui rend 500). C'est arrivé deux fois le même
 * jour — d'où ce module.
 *
 * **Pur et sans dépendance** : il prend un état, il rend une liste. Il ne lit ni
 * `process.env`, ni l'horloge, et ne journalise rien — c'est ce qui permet de le
 * tester en énumérant les cas plutôt qu'en fabriquant un environnement.
 */

/** L'état des réglages, réduit à ce qui décide d'une capacité. */
export interface CapabilitySnapshot {
  readonly hasManagementCredentials: boolean;
  readonly hasAdminAudience: boolean;
  readonly hasMailerKey: boolean;
  readonly hasStorage: boolean;
  readonly hasStripe: boolean;
  readonly hasClientBaseUrl: boolean;
  readonly hasAdminBaseUrl: boolean;
}

/**
 * Gravité d'une capacité manquante — elle décide du **niveau de journal**, donc
 * de ce qui réveille quelqu'un.
 *
 * - `blocking` : une porte du produit est fermée. En production, ça se répare
 *   aujourd'hui, pas cette semaine.
 * - `degraded` : quelque chose marche moins bien, sans empêcher d'opérer.
 */
export type CapabilitySeverity = "blocking" | "degraded";

/** Une capacité éteinte, dite dans les mots de la personne qui la subira. */
export interface MissingCapability {
  /** Le nom **métier** — pas celui de la variable. */
  readonly capability: string;
  /** La variable à poser. C'est l'action, elle doit être copiable telle quelle. */
  readonly setting: string;
  /** Ce qui ne marchera pas, du point de vue de qui s'en sert. */
  readonly consequence: string;
  readonly severity: CapabilitySeverity;
}

/**
 * @returns les capacités éteintes, **les bloquantes d'abord** — un journal se lit
 *   par le haut, et l'ordre de déclaration n'a aucune raison d'être l'ordre
 *   d'importance.
 */
export function auditCapabilities(snapshot: CapabilitySnapshot): readonly MissingCapability[] {
  const missing = CHECKS.filter((check) => !check.present(snapshot)).map(toMissing);
  return [...missing].sort(bySeverity);
}

interface Check extends MissingCapability {
  readonly present: (snapshot: CapabilitySnapshot) => boolean;
}

/**
 * Une ligne par capacité. Ajouter un réglage optionnel **et** sa ligne ici est
 * le geste complet ; l'ajouter sans sa ligne recrée exactement la panne
 * silencieuse qu'on vient de corriger.
 */
const CHECKS: readonly Check[] = [
  {
    capability: "Surface d'administration",
    setting: "AUTH0_ADMIN_AUDIENCE",
    consequence:
      "aucun jeton staff n'est accepté : tout /admin/* refuse, y compris à un administrateur",
    severity: "blocking",
    present: (s) => s.hasAdminAudience,
  },
  {
    capability: "Fournisseur d'identité (Auth0 Management)",
    setting: "AUTH0_M2M_CLIENT_ID / AUTH0_M2M_CLIENT_SECRET",
    consequence: "aucune invitation possible, ni pour l'équipe ni pour un client",
    severity: "blocking",
    present: (s) => s.hasManagementCredentials,
  },
  {
    capability: "Courrier transactionnel",
    setting: "RESEND_MAILER_B2B_API_KEY (ou RESEND_API_KEY)",
    consequence:
      "les e-mails sont rendus et journalisés, mais ne partent pas — une invitation ne parvient à personne",
    severity: "blocking",
    present: (s) => s.hasMailerKey,
  },
  {
    capability: "Paiement",
    setting: "STRIPE_SECRET_KEY",
    consequence: "le paiement par carte au checkout est indisponible",
    severity: "blocking",
    present: (s) => s.hasStripe,
  },
  {
    capability: "Stockage de documents",
    setting: "STORAGE_BUCKET / STORAGE_ACCESS_KEY_ID / …",
    consequence: "les KBIS ne peuvent être ni déposés ni téléchargés",
    severity: "degraded",
    present: (s) => s.hasStorage,
  },
  {
    capability: "Retour d'e-mail vers l'espace client",
    setting: "CLIENT_BASE_URL",
    consequence:
      "après avoir posé son mot de passe, un client atterrit sur une page Auth0 au lieu de la boutique",
    severity: "degraded",
    present: (s) => s.hasClientBaseUrl,
  },
  {
    capability: "Retour d'e-mail vers le back-office",
    setting: "ADMIN_BASE_URL",
    consequence: "même chose pour l'équipe, côté back-office",
    severity: "degraded",
    present: (s) => s.hasAdminBaseUrl,
  },
];

/** Retire la sonde : ce qu'on publie est un constat, pas un prédicat. */
function toMissing(check: Check): MissingCapability {
  return {
    capability: check.capability,
    setting: check.setting,
    consequence: check.consequence,
    severity: check.severity,
  };
}

function bySeverity(left: MissingCapability, right: MissingCapability): number {
  const rank = (severity: CapabilitySeverity): number => (severity === "blocking" ? 0 : 1);
  return rank(left.severity) - rank(right.severity);
}
