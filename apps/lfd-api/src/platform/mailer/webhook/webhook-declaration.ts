/**
 * **L'état de notre webhook chez Resend**, jugé sans rien muter.
 *
 * Vérifier plutôt que créer : une application qui déclare son webhook au
 * démarrage mute l'état d'un tiers à chaque boot. Un poste local ou un
 * déploiement d'essai lancé avec la clé de production repointerait le vrai
 * webhook vers lui-même — et les rebonds de la production partiraient sur un
 * portable. La création reste un geste délibéré ; la vérification, elle, tourne
 * en continu.
 *
 * Pur : rien ici ne fait d'appel réseau, donc tout se teste.
 */

/** Ce que la liste de Resend rend d'un webhook — la part qu'on lit. */
export interface DeclaredWebhook {
  readonly endpoint: string;
  readonly status: string;
  readonly events: readonly string[];
}

/** Ce qu'on attend d'être prévenu. Sans `bounced`, le canal ment par omission. */
export const EXPECTED_EVENTS: readonly string[] = [
  "email.sent",
  "email.delivery_delayed",
  "email.delivered",
  "email.bounced",
  "email.complained",
];

/**
 * Le chemin de NOTRE route. On juge là-dessus plutôt que sur l'adresse
 * complète : l'hôte public change (passerelle, domaine à venir) alors que le
 * chemin nous appartient. Exiger l'adresse exacte demanderait un réglage de
 * plus, qu'il faudrait tenir à jour — et un réglage qu'on oublie fait sonner
 * une fausse alerte, ce qui est pire que de ne pas vérifier.
 */
export const WEBHOOK_PATH = "/webhooks/resend";

export interface DeclarationVerdict {
  readonly healthy: boolean;
  /** Combien d'endpoints ACTIFS pointent sur notre route. */
  readonly active: number;
  /** Ce qu'on a constaté, en clair — c'est ce qui voyage jusqu'à l'écran. */
  readonly detail: string;
}

export function checkDeclaration(webhooks: readonly DeclaredWebhook[]): DeclarationVerdict {
  const ours = webhooks.filter((hook) => hook.endpoint.includes(WEBHOOK_PATH));
  const active = ours.filter((hook) => hook.status === "enabled");

  if (ours.length === 0) {
    return { healthy: false, active: 0, detail: "aucun webhook déclaré chez Resend" };
  }
  if (active.length === 0) {
    // LE cas silencieux : Resend désactive un endpoint qui échoue trop. Le
    // canal continue d'envoyer, et plus rien ne revient — sans que personne
    // n'ait rien changé.
    return { healthy: false, active: 0, detail: "webhook déclaré mais DÉSACTIVÉ par Resend" };
  }
  if (active.length > 1) {
    // Deux endpoints actifs : il en reste un d'avant un changement d'adresse.
    // Les événements partent aux deux, et on ne sait plus lequel fait foi.
    return {
      healthy: false,
      active: active.length,
      detail: `${active.length} webhooks actifs sur cette route — un ancien n'a pas été retiré`,
    };
  }
  const missing = missingEvents(active[0]?.events ?? []);
  if (missing.length > 0) {
    // Le plus trompeur : les livraisons arrivent, tout paraît vert, et les
    // rebonds ne viennent jamais.
    return { healthy: false, active: 1, detail: `événements manquants : ${missing.join(", ")}` };
  }
  return { healthy: true, active: 1, detail: "actif, tous les événements attendus" };
}

function missingEvents(declared: readonly string[]): readonly string[] {
  return EXPECTED_EVENTS.filter((event) => !declared.includes(event));
}
