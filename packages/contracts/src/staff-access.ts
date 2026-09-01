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
 *
 * ## 🔴 La ressource porte son OUTIL — `<outil>.<domaine>`
 *
 * Et les outils sont **les blocs de `src/`** : `pim`, `b2b`, `staff`, `ops`. Le
 * préfixe n'est donc pas une convention de nommage, c'est la frontière
 * d'architecture rendue lisible dans la permission — la même qu'on voit en
 * ouvrant `src/`, et la même que `lint:context-boundaries` fait respecter.
 *
 * Elles étaient douze, à plat, et « catalogue » désignait **deux choses** : le
 * référentiel produit et le catalogue vendu de la plateforme. Deux personnes
 * différentes doivent pouvoir toucher l'un sans l'autre — un commercial négocie
 * un prix, il n'édite pas une fiche produit.
 *
 * ⚠️ **Un tiret bas, ni point ni deux-points.** `StaffPermission` s'écrit déjà
 * `${resource}:${action}` : un `:` dans la ressource rendrait un futur
 * `split(":")` ambigu. Un `.` aurait été plus lisible, mais Prisma n'accepte pas
 * de point dans une valeur d'enum — il aurait fallu un `@map`, donc **deux
 * orthographes** (`pim_catalog` côté client, `pim.catalog` côté base) et une
 * couche de traduction entre les deux. Une seule orthographe partout vaut mieux
 * qu'un point.
 *
 * ⚠️ **`tech` a été SUPPRIMÉE.** Elle ne gardait aucune route — zéro
 * `@AdminSurface("tech")` dans le dépôt —, c'est-à-dire exactement le droit que
 * le premier paragraphe s'interdit de nommer.
 */
export const staffResourceSchema = z.enum([
  // ── `pim.` — LE RÉFÉRENTIEL ─────────────────────────────────────────────
  /** Ce que le catalogue **contient** : produits, familles, médias, allergènes, ingrédients. */
  "pim_catalog",
  /**
   * Ce qui **en sort** : Shopify, la plateforme B2B, la publication, les
   * révisions.
   *
   * Détachée de `pim_catalog`, et c'est la découpe qui compte le plus de
   * toutes. Elles étaient un seul droit : qui pouvait corriger une faute de
   * frappe pouvait **pousser le catalogue chez tous les canaux**. Or éditer et
   * diffuser sont deux décisions — la seconde est irréversible pour le client,
   * la première non.
   */
  "pim_channels",
  /** Où et dans quel contexte on vend : points de vente, contextes de vente. */
  "pim_settings",
  /**
   * La **fiscalité** du référentiel : les régimes de TVA et les règles
   * comptables. Ses décideurs ne sont pas ceux du catalogue — le catalogue
   * décide de ce qui existe, la fiscalité de ce qui est taxé et à quel taux.
   */
  "pim_tax",

  // ── `b2b.` — LA PLATEFORME MARCHANDE ────────────────────────────────────
  "b2b_companies",
  "b2b_orders",
  /** Les paniers récurrents — un engagement dans la durée, pas une commande. */
  "b2b_subscriptions",
  /**
   * Le catalogue **vendu** : prix négocié, masquage, mise en avant, parité.
   *
   * Homonyme de `pim_catalog` et **délibérément distinct** : l'un dit ce qui
   * existe, l'autre ce qu'on vend et à quel prix. Un commercial doit pouvoir
   * toucher le second sans jamais toucher le premier.
   */
  "b2b_catalog",
  /**
   * La **tarification** : règles, planchers, gabarits, engagements de volume,
   * journal tarifaire.
   *
   * Elle vivait dans `settings`, avec le contenu du site et les points de
   * retrait — le cœur du métier commercial rangé avec la plomberie. Un
   * commercial avait `settings: read`, donc ne pouvait pas poser une règle de
   * prix.
   */
  "b2b_pricing",
  "b2b_growth",
  "b2b_appointments",
  /** Les demandes des clients. À ne pas confondre avec `staff_notifications`. */
  "b2b_support",
  /** Les moyens de paiement : mandats de prélèvement. Pas une donnée de compte. */
  "b2b_payments",
  /**
   * Les **alertes** — de compte et globales.
   *
   * Leurs trois écrans étaient répartis sur trois ressources différentes
   * (`orders`, `companies`, `settings`) : trois droits pour un seul sujet.
   */
  "b2b_alerts",
  /** Le reste du paramétrage : contenu, zones de livraison, créneaux, retraits. */
  "b2b_settings",

  // ── `staff.` — LE SOCLE ─────────────────────────────────────────────────
  /**
   * L'annuaire, les invitations et **les rôles**.
   *
   * ⚠️ C'est le droit qui permet de se donner tous les autres.
   */
  "staff_access",
  /**
   * La cloche du back-office.
   *
   * Elle était sous `support` — la ressource des demandes CLIENTS. Donner le
   * support client donnait la cloche interne, et l'inverse.
   */
  "staff_notifications",

  // ── `ops.` — L'EXPLOITATION ─────────────────────────────────────────────
  /** La carte de santé de l'écosystème : topologie, trafic. Staff only. */
  "ops_health",

  // ── SANS PRÉFIXE — l'exception, et elle est écrite ──────────────────────
  /**
   * Le **journal d'activité** : qui a fait quoi, tous modules confondus.
   *
   * Seule ressource sans outil, parce qu'elle n'appartient à aucun : le lire,
   * c'est voir passer des comptes, des commandes et du référentiel à la fois.
   * Une exception nommée ne dérive pas ; une exception tacite, si.
   */
  "activity",
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
  pim_catalog: "Référentiel — Catalogue",
  pim_channels: "Référentiel — Diffusion",
  pim_settings: "Référentiel — Points et contextes de vente",
  pim_tax: "Référentiel — Fiscalité",
  b2b_companies: "Comptes clients",
  b2b_orders: "Commandes",
  b2b_subscriptions: "Paniers récurrents",
  b2b_catalog: "Catalogue vendu",
  b2b_pricing: "Tarification",
  b2b_growth: "Croissance",
  b2b_appointments: "Rendez-vous",
  b2b_support: "Demandes clients",
  b2b_payments: "Moyens de paiement",
  b2b_alerts: "Alertes",
  b2b_settings: "Réglages plateforme",
  staff_access: "Équipe et accès",
  staff_notifications: "Notifications internes",
  ops_health: "Santé de l'écosystème",
  activity: "Journal d'activité",
};

// ─────────────────────────────────────────────────────────────────────────────
// Le catalogue
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le niveau le plus haut accordé par un rôle sur une ressource. Absent = aucun
 * accès. **`write` implique `read`** : on ne modifie pas ce qu'on ne voit pas.
 */
export type RoleGrants = Partial<Readonly<Record<StaffResource, StaffAction>>>;

/**
 * La matrice, après le découpage par outil. Ce qui mérite d'être rappelé ici,
 * parce qu'on le relira en modifiant ce tableau :
 *
 * - **`staff_access` n'est ouvert qu'à `admin`** — accorder des droits est le
 *   seul geste qui permet de s'en accorder.
 * - **`dev` ne lit pas les données clients** — un rôle « technique » qui voit
 *   tout est un `admin` qui n'ose pas dire son nom. Le diagnostic ponctuel passe
 *   par une dérogation, qui laisse une trace.
 * - **`comptabilite` ne lit pas `b2b_growth`** — le pipeline commercial n'est
 *   pas de la donnée comptable.
 * - **`pim_channels` n'est ouvert qu'à `admin`** — c'est le droit de DIFFUSER,
 *   et il est irréversible pour le client là où l'édition ne l'est pas. Il était
 *   inclus dans `catalog:write` : qui pouvait corriger une faute de frappe
 *   pouvait pousser tout le catalogue chez tous les canaux.
 * - **`b2b_pricing` et `b2b_catalog` sont en écriture pour `commercial`** — la
 *   correction que ce découpage existe pour rendre possible. La tarification
 *   dormait dans `settings: read` et le catalogue vendu dans `catalog: read` :
 *   le commercial ne pouvait ni poser une règle de prix, ni valider ce qui
 *   entre en vente. C'étaient pourtant ses deux gestes.
 * - **`activity` n'est ouvert qu'à `admin`** — le journal traverse tous les
 *   modules, donc l'ouvrir à un rôle métier lui donnerait à voir l'activité des
 *   autres par la bande. Élargir plus tard est facile ; reprendre un accès déjà
 *   donné ne l'est pas.
 * - **`pim_tax` est en écriture pour `comptabilite`** — un taux de TVA est une
 *   décision comptable, pas un choix d'assortiment. Et `pim_channels` ne l'est
 *   pas : poser un taux juste au référentiel suffit, le publieur n'a plus qu'à
 *   réconcilier. C'est exactement la phrase que l'ancienne ressource `catalog`
 *   ne permettait pas d'écrire, faute de séparer éditer et diffuser.
 * - **`staff_notifications` est ouvert à TOUS les rôles** — la cloche du
 *   back-office n'est pas un privilège, c'est la façon dont on apprend qu'il
 *   s'est passé quelque chose. Elle était sous `support`, donc réservée à ceux
 *   qui traitent les demandes clients : les autres ne recevaient rien.
 *
 * ⚠️ **Personne ne perd un accès qu'il avait**, sauf là où c'est le but :
 * `pim_channels` se referme sur `admin` (il était ouvert à qui avait
 * `catalog:write`, c'est-à-dire au seul `admin` déjà), et rien d'autre ne se
 * resserre. Tout le reste est un élargissement ou une reconduction.
 */
export const ROLE_GRANTS: Readonly<Record<StaffRole, RoleGrants>> = {
  admin: {
    pim_catalog: "write",
    pim_channels: "write",
    pim_settings: "write",
    pim_tax: "write",
    b2b_companies: "write",
    b2b_orders: "write",
    b2b_subscriptions: "write",
    b2b_catalog: "write",
    b2b_pricing: "write",
    b2b_growth: "write",
    b2b_appointments: "write",
    b2b_support: "write",
    b2b_payments: "write",
    b2b_alerts: "write",
    b2b_settings: "write",
    staff_access: "write",
    staff_notifications: "write",
    ops_health: "write",
    // `write` alors qu'aucune route ne le vérifiera jamais — le journal est
    // append-only, alimenté par les handlers. C'est le prix de l'invariant qui
    // compte le plus : `admin` couvre TOUT, sans trou. Un `read` ici ferait de
    // l'administrateur le premier rôle incomplet, et c'est ce qu'un test
    // vérifie explicitement.
    activity: "write",
  },
  commercial: {
    b2b_companies: "write",
    // `write` depuis la saisie assistée : le commercial prend les commandes au
    // téléphone, c'est son métier. Ce droit couvre aussi l'attestation de remise
    // au comptoir (`POST /admin/handover/:token`) — élargissement assumé : celui
    // qui prend la commande est souvent celui qui remet le sac.
    // Il ne couvre TOUJOURS PAS la modification d'une commande passée : aucune
    // route ne l'expose, et ce sont les avenants qui la porteront.
    b2b_orders: "write",
    b2b_subscriptions: "write",
    // 🔴 Les deux droits que le découpage lui DONNE, et qui motivaient tout.
    // Il négocie un prix et valide ce qui entre en vente — c'est son métier, et
    // il ne pouvait ni l'un ni l'autre : la tarification dormait dans
    // `settings: read`, et le catalogue vendu dans `catalog: read`.
    b2b_catalog: "write",
    b2b_pricing: "write",
    b2b_growth: "write",
    b2b_appointments: "write",
    b2b_support: "write",
    b2b_payments: "read",
    b2b_alerts: "write",
    b2b_settings: "read",
    // Il VOIT le référentiel, il n'y touche pas. C'est exactement la séparation
    // que le découpage rend exprimable : avant, le même mot désignait le
    // référentiel et le catalogue vendu.
    pim_catalog: "read",
    pim_tax: "read",
    staff_notifications: "write",
  },
  comptabilite: {
    b2b_companies: "read",
    b2b_orders: "write",
    b2b_subscriptions: "read",
    b2b_catalog: "read",
    b2b_pricing: "read",
    b2b_payments: "write",
    b2b_settings: "read",
    pim_catalog: "read",
    // Le seul `write` de la comptabilité en dehors des commandes : poser un
    // taux et le corriger. **Pas** le pousser vers un canal — `pim_channels`
    // n'est pas à elle, et c'est précisément ce que l'ancienne ressource
    // `catalog` ne permettait pas de dire.
    pim_tax: "write",
    staff_notifications: "write",
  },
  support: {
    b2b_companies: "read",
    b2b_orders: "read",
    b2b_subscriptions: "read",
    b2b_appointments: "write",
    b2b_support: "write",
    staff_notifications: "write",
  },
  dev: {
    // **`dev` ne lit pas les données clients** — un rôle « technique » qui voit
    // tout est un `admin` qui n'ose pas dire son nom. Le diagnostic ponctuel
    // passe par une dérogation, qui laisse une trace.
    pim_catalog: "read",
    pim_tax: "read",
    b2b_settings: "read",
    // `read` et pas `write` : OPS est en lecture seule en v1 (il observe, il
    // n'agit pas). Le jour où des actions murées arrivent, ce droit sera le
    // premier à devoir être re-décidé — pas élargi par habitude.
    ops_health: "read",
    staff_notifications: "write",
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
  return resolvePermissionsFromGrants(ROLE_GRANTS[role], overrides);
}

/**
 * La même résolution, à partir des **droits** plutôt que du nom d'un rôle.
 *
 * C'est le pivot qui rend un rôle définissable en base : `ROLE_GRANTS` cesse
 * d'être la seule source possible de droits, sans que rien ne change pour les
 * cinq rôles du catalogue — {@link resolveStaffPermissions} y délègue, à
 * l'identique. Aucun appelant n'a bougé.
 *
 * Elle reste **pure et déterministe** : ni base, ni réseau, ni horloge.
 *
 * @returns les permissions accordées, triées — comparable et sérialisable tel quel.
 */
export function resolvePermissionsFromGrants(
  grants: RoleGrants,
  overrides: readonly StaffOverride[] = [],
): readonly StaffPermission[] {
  const granted = new Set<StaffPermission>(expandGrants(grants));

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
