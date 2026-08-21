import { z } from "zod";

/**
 * Contrat d'**accès staff** : qui peut quoi dans le back-office.
 *
 * Modèle et justifications : `documentation/b2b/architecture-acces-staff.md`.
 * Trois notions et une formule — un **rôle** est un paquet nommé de
 * **permissions**, qu'une **dérogation** par personne ajuste :
 *
 * ```
 * effectif = permissions(rôle) ∪ dérogations.autorise \ dérogations.refuse
 * ```
 *
 * Le catalogue vit ici, dans le code : typé, testé, diffable en revue et
 * versionné avec les écrans qu'il gouverne. Ce sont les **dérogations** qui
 * s'éditent depuis Réglages, pas les rôles.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Les briques
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Les domaines du back-office, calqués sur les surfaces `/admin/*` **réellement
 * montées**. On ne nomme pas une ressource sans routes : ce serait un droit que
 * personne ne peut ni exercer ni tester.
 */
export const staffResourceSchema = z.enum([
  "companies",
  "orders",
  "catalog",
  // La **fiscalité** du catalogue : le référentiel des régimes de TVA, et lui
  // seul. Détachée de `catalog` parce que ses décideurs ne sont pas les mêmes —
  // le catalogue décide de ce qui existe et à quel prix, la fiscalité de ce qui
  // est taxé et à quel taux. Comptabilité tenait la seconde sans pouvoir y
  // toucher, faute d'une ressource pour la nommer.
  //
  // La frontière s'arrête au référentiel : POUSSER les collections de taxe vers
  // un canal reste `catalog:write`. Un taux juste au référentiel suffit — le
  // publieur n'a plus qu'à réconcilier.
  "tax",
  "growth",
  "appointments",
  "support",
  "settings",
  "staff",
  // Le **journal d'activité** : qui a fait quoi, tous modules confondus. Une
  // ressource à lui parce qu'il traverse les autres — le lire, c'est voir
  // passer des comptes, des commandes et du référentiel à la fois.
  "activity",
  "tech",
  // La carte de santé de l'écosystème. Elle expose la topologie interne et des
  // messages techniques : staff only, jamais côté client.
  "ops",
]);
export type StaffResource = z.infer<typeof staffResourceSchema>;

/**
 * Deux niveaux, jamais trois. `delete` ou `approve` se paient en confusion bien
 * avant de se payer en sécurité, et rien dans le back-office ne les réclame.
 */
export const staffActionSchema = z.enum(["read", "write"]);
export type StaffAction = z.infer<typeof staffActionSchema>;

/** L'unité atomique d'autorisation, p. ex. `companies:write`. */
export type StaffPermission = `${StaffResource}:${StaffAction}`;

/** Construit une permission — un seul endroit sait comment elle s'écrit. */
export function staffPermission(resource: StaffResource, action: StaffAction): StaffPermission {
  return `${resource}:${action}`;
}

/**
 * Les rôles. `admin` porte tous les pouvoirs ; les quatre autres découpent le
 * back-office par métier.
 */
export const staffRoleSchema = z.enum(["admin", "commercial", "comptabilite", "support", "dev"]);
export type StaffRole = z.infer<typeof staffRoleSchema>;

/** Libellés d'écran — le code parle anglais, l'interface parle français. */
export const STAFF_ROLE_LABELS: Readonly<Record<StaffRole, string>> = {
  admin: "Administrateur",
  commercial: "Commercial",
  comptabilite: "Comptabilité",
  support: "Support",
  dev: "Technique",
};

export const STAFF_RESOURCE_LABELS: Readonly<Record<StaffResource, string>> = {
  companies: "Comptes clients",
  orders: "Commandes",
  catalog: "Catalogue",
  tax: "Fiscalité",
  growth: "Croissance",
  appointments: "Rendez-vous",
  support: "Demandes",
  settings: "Réglages",
  staff: "Utilisateurs",
  activity: "Journal d'activité",
  tech: "Technique",
  ops: "Santé de l'écosystème",
};

// ─────────────────────────────────────────────────────────────────────────────
// Le catalogue
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le niveau le plus haut accordé par un rôle sur une ressource. Absent = aucun
 * accès. **`write` implique `read`** : on ne modifie pas ce qu'on ne voit pas.
 */
type RoleGrants = Partial<Readonly<Record<StaffResource, StaffAction>>>;

/**
 * La matrice. Trois choix méritent d'être rappelés ici, parce qu'on les relira
 * en modifiant ce tableau :
 *
 * - **`staff` n'est ouvert qu'à `admin`** — accorder des droits est le seul
 *   geste qui permet de s'en accorder.
 * - **`dev` ne lit pas les données clients** — un rôle « technique » qui voit
 *   tout est un `admin` qui n'ose pas dire son nom. Le diagnostic ponctuel passe
 *   par une dérogation, qui laisse une trace.
 * - **`comptabilite` ne lit pas `growth`** — le pipeline commercial n'est pas de
 *   la donnée comptable.
 * - **`catalog` n'est en écriture que pour `admin`** — le référentiel décide de
 *   ce qui existe, de ce qui se publie en vitrine et à quel prix canonique ;
 *   trois écrans en aval en dépendent. Les autres rôles le **lisent**, ce qui
 *   est exactement l'audience qu'ils avaient quand l'écran catalogue vivait
 *   sous `settings` : la ressource change de nom, personne ne perd un accès.
 * - **`activity` n'est ouvert qu'à `admin`** — le journal
 *   traverse tous les modules, donc l'ouvrir à un rôle métier lui donnerait à
 *   voir l'activité des autres par la bande. Élargir plus tard est facile ;
 *   reprendre un accès déjà donné ne l'est pas. Seul `activity:read` est
 *   vérifié quelque part : le journal est append-only, alimenté par les
 *   handlers, jamais à la main.
 * - **`tax` est en écriture pour `comptabilite`** — c'est la seule découpe du
 *   catalogue qui échappe à l'admin, et elle est délibérée : un taux de TVA est
 *   une décision comptable, pas un choix d'assortiment. La ressource se détache
 *   de `catalog` **sans retirer d'accès** : tous ceux qui lisaient les régimes
 *   sous `catalog:read` gardent `tax:read`.
 */
export const ROLE_GRANTS: Readonly<Record<StaffRole, RoleGrants>> = {
  admin: {
    companies: "write",
    orders: "write",
    catalog: "write",
    tax: "write",
    growth: "write",
    appointments: "write",
    support: "write",
    settings: "write",
    staff: "write",
    // `write` alors qu'aucune route ne le vérifiera jamais — le journal est
    // append-only, alimenté par les handlers. C'est le prix de l'invariant qui
    // compte le plus : `admin` couvre TOUT le catalogue, sans trou. Un `read`
    // ici ferait de l'administrateur le premier rôle incomplet, et c'est ce
    // qu'un test vérifie explicitement.
    activity: "write",
    tech: "write",
    ops: "write",
  },
  commercial: {
    companies: "write",
    // `write` depuis la saisie assistée : le commercial prend les commandes au
    // téléphone, c'est son métier. Ce droit couvre aussi l'attestation de remise
    // au comptoir (`POST /admin/handover/:token`) — élargissement assumé : celui
    // qui prend la commande est souvent celui qui remet le sac.
    // Il ne couvre TOUJOURS PAS la modification d'une commande passée : aucune
    // route ne l'expose, et ce sont les avenants qui la porteront.
    orders: "write",
    catalog: "read",
    tax: "read",
    growth: "write",
    appointments: "write",
    support: "write",
    settings: "read",
  },
  comptabilite: {
    companies: "read",
    orders: "write",
    catalog: "read",
    // Le seul `write` de la comptabilité en dehors des commandes : poser un
    // taux et le corriger. **Pas** le pousser vers un canal : publier reste un
    // geste de catalogue, et un taux juste au référentiel suffit — le publieur
    // n'a plus qu'à réconcilier.
    tax: "write",
    settings: "read",
  },
  support: {
    companies: "read",
    orders: "read",
    appointments: "write",
    support: "write",
  },
  dev: {
    catalog: "read",
    tax: "read",
    settings: "read",
    tech: "write",
    // `read` et pas `write` : OPS est en lecture seule en v1 (il observe, il
    // n'agit pas). Le jour où des actions murées arrivent, ce droit sera le
    // premier à devoir être re-décidé — pas élargi par habitude.
    ops: "read",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Les dérogations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ce qu'une dérogation fait à une permission. L'absence de ligne vaut « hérite »
 * — on ne stocke que l'écart, comme pour les feature flags.
 */
export const staffOverrideEffectSchema = z.enum(["allow", "deny"]);
export type StaffOverrideEffect = z.infer<typeof staffOverrideEffectSchema>;

/**
 * Un écart au rôle, pour une personne. Répond au besoin réel du terrain — « Marc
 * est commercial **mais** il gère aussi les relances », « Léa est commerciale
 * **sauf** qu'elle ne touche pas aux prospects » — sans inventer un rôle sur
 * mesure par cas particulier.
 */
export const staffOverrideSchema = z.object({
  resource: staffResourceSchema,
  action: staffActionSchema,
  effect: staffOverrideEffectSchema,
});
export type StaffOverride = z.infer<typeof staffOverrideSchema>;

/**
 * Réduit une liste de dérogations à **au plus une par permission**, le refus
 * l'emportant sur l'autorisation.
 *
 * Sans ça, deux règles divergent : la base ne peut stocker qu'une ligne par
 * couple (contrainte d'unicité), donc « la dernière gagne », tandis que
 * {@link resolveStaffPermissions} fait gagner le refus. On validerait alors un
 * état, et on en écrirait un autre. Normaliser **une fois**, au goulot, évite
 * d'avoir à choisir laquelle des deux lectures est la vraie.
 */
export function dedupeStaffOverrides(
  overrides: readonly StaffOverride[],
): readonly StaffOverride[] {
  const byPermission = new Map<StaffPermission, StaffOverride>();
  for (const override of overrides) {
    const key = staffPermission(override.resource, override.action);
    const kept = byPermission.get(key);
    // Le refus l'emporte, quel que soit l'ordre d'arrivée.
    if (kept === undefined || override.effect === "deny") {
      byPermission.set(key, override);
    }
  }
  return [...byPermission.values()];
}

// ─────────────────────────────────────────────────────────────────────────────
// La résolution
// ─────────────────────────────────────────────────────────────────────────────

/** Toutes les permissions du catalogue, dans un ordre stable (ressource, puis action). */
export const ALL_STAFF_PERMISSIONS: readonly StaffPermission[] =
  staffResourceSchema.options.flatMap((resource) =>
    staffActionSchema.options.map((action) => staffPermission(resource, action)),
  );

/**
 * L'effectif d'une personne. **Pure et déterministe** : ni base, ni réseau, ni
 * horloge — c'est la brique qu'on n'aura jamais à déboguer en production.
 *
 * Deux implications se propagent, et elles sont duales :
 * - **autoriser l'écriture autorise la lecture** ;
 * - **refuser la lecture refuse l'écriture** — sinon on garderait le droit de
 *   modifier une page qu'on n'a pas le droit d'ouvrir.
 *
 * **Le refus l'emporte** sur l'autorisation, quelle qu'en soit la source.
 *
 * @returns les permissions accordées, triées — comparable et sérialisable tel quel.
 */
export function resolveStaffPermissions(
  role: StaffRole,
  overrides: readonly StaffOverride[] = [],
): readonly StaffPermission[] {
  const granted = new Set<StaffPermission>(expandGrants(ROLE_GRANTS[role]));

  for (const override of overrides.filter((entry) => entry.effect === "allow")) {
    for (const permission of implied(override.resource, override.action)) {
      granted.add(permission);
    }
  }
  for (const override of overrides.filter((entry) => entry.effect === "deny")) {
    for (const permission of deniedBy(override.resource, override.action)) {
      granted.delete(permission);
    }
  }
  return ALL_STAFF_PERMISSIONS.filter((permission) => granted.has(permission));
}

/** Vrai si l'effectif couvre cette permission. Le seul test que le code applicatif écrit. */
export function hasStaffPermission(
  permissions: readonly StaffPermission[],
  required: StaffPermission,
): boolean {
  return permissions.includes(required);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ce que le front consomme
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La réponse de `GET /admin/me` — **le seul point** par lequel un écran apprend
 * ce qu'il a le droit de montrer.
 *
 * C'est la couture de sortie vers un futur backend IAM : le jour où les droits
 * viennent d'ailleurs, on change qui répond à cette question, pas un écran.
 *
 * Le `role` n'est là que pour être **affiché**. Un écran qui teste
 * `role === "admin"` pour décider quoi montrer est un écran qu'il faudra rouvrir
 * au prochain rôle : seules les `permissions` répondent.
 */
export interface StaffMeView {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly role: StaffRole;
  readonly permissions: readonly StaffPermission[];
}

/** Développe la matrice d'un rôle en permissions atomiques. */
function expandGrants(grants: RoleGrants): readonly StaffPermission[] {
  return staffResourceSchema.options.flatMap((resource) => {
    const action = grants[resource];
    return action === undefined ? [] : implied(resource, action);
  });
}

/** Ce qu'accorder `action` accorde vraiment : `write` traîne `read` avec lui. */
function implied(resource: StaffResource, action: StaffAction): readonly StaffPermission[] {
  return action === "write"
    ? [staffPermission(resource, "read"), staffPermission(resource, "write")]
    : [staffPermission(resource, "read")];
}

/** Ce que refuser `action` refuse vraiment : perdre `read`, c'est perdre `write`. */
function deniedBy(resource: StaffResource, action: StaffAction): readonly StaffPermission[] {
  return action === "read"
    ? [staffPermission(resource, "read"), staffPermission(resource, "write")]
    : [staffPermission(resource, "write")];
}
