import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { auditCapabilities, type CapabilitySnapshot } from "../capability-audit.js";

/** Tout est branché : le cas nominal, celui qui ne doit rien dire. */
const ALL_PRESENT: CapabilitySnapshot = {
  hasManagementCredentials: true,
  hasAdminAudience: true,
  hasMailerKey: true,
  hasStorage: true,
  hasStripe: true,
  hasClientBaseUrl: true,
  hasAdminBaseUrl: true,
  hasCatalogIngestSecret: true,
};

function without(...keys: readonly (keyof CapabilitySnapshot)[]): CapabilitySnapshot {
  return keys.reduce<CapabilitySnapshot>(
    (snapshot, key) => ({ ...snapshot, [key]: false }),
    ALL_PRESENT,
  );
}

describe("auditCapabilities", () => {
  it("ne dit rien quand tout est configuré", () => {
    expect(auditCapabilities(ALL_PRESENT)).toEqual([]);
  });

  it("nomme le réglage à poser, pas seulement la capacité", () => {
    // Le journal doit porter l'action. « Le paiement est indisponible » envoie
    // chercher ; « STRIPE_SECRET_KEY absent » se règle.
    const [missing] = auditCapabilities(without("hasStripe"));

    expect(missing?.setting).toContain("STRIPE_SECRET_KEY");
    expect(missing?.consequence).not.toBe("");
  });

  it("remonte les bloquants avant les dégradés", () => {
    // Un journal se lit par le haut. L'ordre de déclaration n'a aucune raison
    // d'être l'ordre d'importance.
    const missing = auditCapabilities(without("hasStorage", "hasManagementCredentials"));

    expect(missing.map((entry) => entry.severity)).toEqual(["blocking", "degraded"]);
  });

  it("tient l'audience admin pour bloquante — elle ferme TOUT /admin/*", () => {
    const [missing] = auditCapabilities(without("hasAdminAudience"));

    expect(missing?.severity).toBe("blocking");
  });

  it("liste chaque canal manquant, sans en fondre deux en un", () => {
    const missing = auditCapabilities(without("hasClientBaseUrl", "hasAdminBaseUrl"));

    expect(missing).toHaveLength(2);
  });
});

/**
 * L'invariant qui compte vraiment.
 *
 * Ajouter un réglage optionnel **sans** sa ligne d'inventaire recrée exactement
 * la panne silencieuse qu'on vient de corriger — et rien ne le signalerait, par
 * définition. Ce test lit la source de `AppConfig` et exige que chaque réglage
 * facultatif soit soit couvert, soit **explicitement** exempté.
 *
 * Il est volontairement grossier : il compare des noms de variables, pas des
 * types. Un test raffiné qu'on désactive au premier faux positif ne protège
 * personne ; celui-ci se met à jour en une ligne.
 */
describe("inventaire — aucun réglage optionnel oublié", () => {
  /**
   * Réglages facultatifs qui n'éteignent **aucune** capacité produit : ils
   * changent un comportement interne, et un exploitant n'a rien à en faire au
   * démarrage.
   */
  const EXEMPTED = new Set([
    "AUTH0_CUSTOMER_CONNECTION", // a un défaut : le nom Auth0 d'un tenant neuf
    "AUTH0_STAFF_CONNECTION", // a un défaut : `lfc-staff`, constaté dans le tenant
    "BOOTSTRAP_ADMIN_EMAIL", // a un défaut ; son échec réel est signalé par StaffUsersModule
    "RECOMPUTE_TOKEN", // outil d'exploitation, pas une porte du produit
    "MAILER_FROM_ADDRESS", // a un défaut
    "MAILER_REPLY_TO", // purement cosmétique
    "MAILER_STAFF_INBOX", // sans elle, les alertes internes ne partent pas — couvert par le canal courrier
    "AUTH_DEV_IMPERSONATE", // développement uniquement
    "ADMIN_DEV_BYPASS", // développement uniquement
    "EXPOSE_ERROR_DETAIL", // développement uniquement
    "PORT", // a un défaut
    "NODE_ENV", // a un défaut
    "APP_REVISION", // gravée dans l'image ; absente = build local, aucune capacité éteinte
  ]);

  it("chaque optionalString d'AppConfig est inventorié ou exempté", () => {
    const audited = auditCapabilities(
      Object.keys(ALL_PRESENT).reduce<CapabilitySnapshot>(
        (snapshot, key) => ({ ...snapshot, [key]: false }),
        ALL_PRESENT,
      ),
    );
    const covered = audited.map((entry) => entry.setting).join(" ");

    const forgotten = optionalSettings().filter(
      (name) => !EXEMPTED.has(name) && !covered.includes(name),
    );

    expect(forgotten).toEqual([]);
  });
});

/** Les noms de variables lus de façon facultative, au fil des deux fichiers. */
function optionalSettings(): readonly string[] {
  const sources = ["../../config/app-config.ts", "../../config/env-readers.ts"].map((relative) =>
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8"),
  );
  const names = sources.flatMap((source) =>
    [...source.matchAll(/optionalString\("([A-Z0-9_]+)"\)/g)].map((match) => match[1] ?? ""),
  );
  return [...new Set(names)].filter((name) => name !== "");
}
