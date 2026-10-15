import type { Route } from '@angular/router';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { routes } from '../app.routes';
import { legacyLegalMentionRedirect } from '../b2b/b2b.routes';
import { LEGAL_MENTION_SLUGS } from '../reglages/legal-mention-slugs';
import { comptoirLanding } from '../comptoir/comptoir-landing';
import type { AnyPermissionGuard, PermissionGuard } from '../auth/permission.guard';

/**
 * **Quel droit ouvre quel écran** — la table entière, écrite une fois.
 *
 * Ce n'est pas une paraphrase des routes : c'est la décision, et les tests plus
 * bas vérifient que le routeur s'y conforme. Ajouter un écran sans l'inscrire
 * ici fait échouer la suite — c'est tout l'intérêt, parce qu'un écran non gardé
 * ne se voit pas à la relecture. Il se voit le jour où quelqu'un l'ouvre et
 * récolte des 403 partout, ce qui ressemble à une panne bien plus qu'à un refus.
 *
 * `null` = hérite du garde de son parent, et c'est **correct** parce que
 * l'écran parle de la même ressource. « Admin → Utilisateurs » est
 * précisément le cas où ça ne l'est pas : l'annuaire de l'équipe exige
 * `staff:read`, la seule ressource que le catalogue réserve aux
 * administrateurs, alors que son parent s'ouvre sur `companies:read`. Hériter
 * y ouvrait la page à un commercial, dont chaque appel rendait ensuite 403.
 */
const OPEN = 'open';

/**
 * `null` = hérite d'un ancêtre gardé. `OPEN` = personne ne le garde, et c'est
 * VOULU. Les distinguer est tout l'intérêt : sans ce mot, un écran oublié et un
 * écran ouvert exprès s'écrivent pareil, et le test qui traque les orphelins ne
 * peut plus rien dire.
 */
type ScreenAccess = StaffPermission | readonly StaffPermission[] | AnyOf | null | typeof OPEN;

/** « L'un OU l'autre » — un `anyPermissionGuard`, à distinguer de deux gardes cumulés. */
interface AnyOf {
  readonly anyOf: readonly StaffPermission[];
}

const SCREENS: Readonly<Record<string, ScreenAccess>> = {
  // CONTENU PLATEFORME — sous le B2B, dont il partage le contexte et le droit.
  // Seule la VUE est listée : `b2b/contenu` ne porte pas d'écran, c'est un
  // groupement, et la table n'inventorie que ce qui s'affiche.
  'b2b/contenu/app-footer': null,
  // UN écran pour les cinq mentions, parti en Réglages › Légal le 2026-10-15
  // (Hugo) sous le droit qu'il héritait de l'espace B2B — ni élargi, ni
  // resserré. Le segment est validé par le composant, qui n'appelle rien
  // quand il ne désigne aucune mention du vocabulaire.
  'reglages/legal/:mention': 'b2b_settings:read',
  'commercial/comptes-clients': 'b2b_companies:read',
  'comptes-clients/nouveau': 'b2b_companies:write',
  // La liste de TOUTES les commandes (plan-page-commandes.md, C2).
  commandes: 'b2b_orders:read',
  'commandes/:orderId': 'b2b_orders:read',
  'comptes-clients/:id/nouvelle-commande': 'b2b_place_order:write',
  // Cible du QR de colisage imprimé sur la fiche d'atelier — c'est une VALEUR
  // encodée dans du papier en circulation, pas un choix d'arborescence, d'où le
  // premier niveau.
  //
  // `:write` et non le `:read` de ses voisines du fournil, et ce n'est pas une
  // incohérence à lisser : le poste ÉCRIT — il coche des lignes, il compte des
  // containers, il déclare une commande prête. En `:read`, on serait entré dans
  // un écran dont chaque appel aurait répondu non.
  'colisage/:reference': 'production_packing:write',
  'retrait/:token': 'handover_counter:write',

  // COMPTABILITÉ — l'entité qui ÉMET : notre ICS, notre compte créancier. Le
  // droit lui est propre et n'est PAS `b2b_settings` : un commercial a
  // `b2b_settings: "read"`, et cet écran décide de la destination des virements.
  // La coquille porte le mur ; la vue hérite, comme dans l'espace B2B.
  comptabilite: 'b2b_accounting:read',
  'comptabilite/tableau-de-bord': null,
  'comptabilite/entites-juridiques': null,
  'comptabilite/entites-juridiques/:id': null,
  'comptabilite/blocages-prelevement': null,
  'comptabilite/liens-de-paiement': null,
  'comptabilite/prelevement-du-mois': null,
  'comptabilite/arretes-de-facturation/:id': null,
  'comptabilite/factures/:id': null,
  'comptabilite/fidelite': null,
  'comptabilite/limites-de-prix': 'lfc_price_limits:read',
  // Son propre droit, venu des Réglages le 2026-09-29 : ni `b2b_settings`, que
  // le commercial lit, ni `b2b_accounting`.
  'comptabilite/surtaxe-de-retard': 'b2b_late_fee:read',
  'comptabilite/tva-de-la-livraison': null,
  'comptabilite/dossier-de-facturation': null,

  'comptes-clients/:id': 'b2b_companies:read',
  'comptes-clients/:id/dashboard': null,
  'comptes-clients/:id/informations': null,
  'comptes-clients/:id/sous-comptes': null,
  // Les notes de la commerciale : ni la comptabilité ni le support, qui lisent pourtant la fiche.
  'comptes-clients/:id/notes': 'b2b_client_notes:read',
  // Posé le 2026-10-12 : qui ne lit que les comptes prenait un 403 sur la liste.
  'comptes-clients/:id/commandes': 'b2b_orders:read',
  // La MÊME commande que `commandes/:orderId`, sous le bandeau de son compte, et
  // derrière le MÊME droit : la coquille n'ouvre que `b2b_companies:read`, et
  // hériter ici laisserait lire les commandes à qui ne le peut pas ailleurs.
  'comptes-clients/:id/commandes/:orderId': 'b2b_orders:read',
  // Le seul onglet de la fiche qui ne suit PAS le droit du parent : voir ce
  // qu'un client a négocié n'est pas voir sa fiche.
  'comptes-clients/:id/tarifs': 'b2b_pricing:read',
  'comptes-clients/:id/facturation': null,
  'comptes-clients/:id/stats': null,
  'comptes-clients/:id/paniers-recurrents': null,
  'comptes-clients/:id/alertes': null,
  'comptes-clients/:id/data': null,

  // ADMIN — ce qui se règle sur les GENS. Le parent s'ouvre sur le plus faible
  // des deux droits, et chaque vue porte le sien : `null` aurait donné à
  // l'annuaire de l'équipe le mur des sociétés, qui n'est pas le sien.
  admin: 'b2b_companies:read',
  'admin/acces-en-attente': 'b2b_companies:read',
  'admin/utilisateurs': 'staff_access:read',
  // Le MÊME droit que l'annuaire, délibérément : définir un rôle et
  // l'attribuer sont le même pouvoir. Un mur plus faible ici laisserait
  // fabriquer des droits à qui n'a pas celui de les donner.
  'admin/roles': 'staff_access:read',
  // L'éditeur exige `staff:write`, pas `staff:read` : voir un rôle et le
  // définir ne sont pas le même geste, et l'URL d'un formulaire se tape.
  'admin/roles/nouveau': 'staff_access:write',
  'admin/roles/:key': 'staff_access:write',
  // Sa propre ressource (plan inscription pro §2.4) : le parent s'ouvre sur les
  // sociétés, et couper la vente en ligne n'est pas lire une fiche client.
  'admin/feature-access': 'b2b_feature_access:read',
  // Le journal traverse les modules : il a sa propre ressource, et n'hérite
  // donc pas du `companies:read` de son parent.
  'admin/journal': 'activity:read',

  // Son PROPRE périmètre, et pas `settings:read` : regarder la flotte n'est pas
  // la régler. Le jour où l'un s'ouvre à quelqu'un, l'autre n'a aucune raison
  // de suivre — et un écran qui expose la topologie interne mérite sa décision.
  sante: 'ops_health:read',

  // Les Réglages vidés le 2026-10-10 : la facturation est une page de la
  // Documentation, les réglages commerciaux une vue de l'Exploitation.
  'documentation/facturation': OPEN,
  'documentation/mediatheque': OPEN,
  exploitation: OPEN,
  // La même coquille, pour Réglages › Sites (S1, 2026-10-13) : elle ne
  // dessine rien, chaque écran porte son garde.
  reglages: OPEN,
  // LES SITES — sous leur propre droit (Q-S5), comme `admin/sites`. La
  // création demande l'écriture : sans elle, la page s'ouvrirait sur un
  // « Ajouter » que le serveur refuserait. `nouveau` AVANT `:id`.
  'reglages/sites': 'lfc_site_settings:read',
  'reglages/sites/nouveau': 'lfc_site_settings:write',
  'reglages/sites/:id': 'lfc_site_settings:read',
  // RÉGLAGES › COMMANDES (plan-reglages-commandes.md, O1b) — deux droits, ceux
  // des routes serveur : l'interrupteur à part (Q5), l'heure limite et
  // l'annulation ensemble.
  'reglages/commandes/ouverture': 'lfc_order_opening:read',
  'reglages/commandes/heure-limite': 'lfc_order_settings:read',
  'reglages/commandes/annulation': 'lfc_order_settings:read',

  // L'ESPACE B2B — ce que la plateforme client vend, et à quel prix. Même mur
  // que les réglages d'où ses écrans viennent : décider d'un prix de vente est
  // du paramétrage, pas une ressource à part.
  b2b: 'b2b_settings:read',
  // La RÉCEPTION porte son propre droit, et pas celui de l'espace : valider ce
  // qui entre en vente est le métier du commercial, régler la plateforme ne
  // l'est pas. C'est la séparation que le découpage des droits par outil a
  // rendue exprimable — la ranger sous `b2b_settings` la lui reprendrait.
  'b2b/reception': 'b2b_catalog:read',
  'b2b/catalogue': null,
  // Les réglages de l'e-commerce sont TOUS partis le 2026-10-13 : les points
  // de retrait vers les sites, l'heure limite, l'ouverture et l'annulation
  // vers Réglages › Commandes. Il ne reste ici que des redirections.
  // « Nous écrire » : son propre droit. Répondre aux messages n'est pas
  // régler la vente, et l'inverse non plus (demandes-clients.md, §5.6).
  'b2b/contact': 'b2b_contact:read',
  // La boîte des demandes clients : le droit du contact
  // (demandes-clients.md, §6.8).
  'b2b/demandes': 'b2b_contact:read',

  // **Médiathèque** — hors de `pim/`, derrière SA ressource : le mur que la
  // route serveur oppose (`@AdminSurface("media_library")`). Elle a eu la
  // sienne le 2026-09-23 ; cette ligne a suivi le 2026-10-02.
  mediatheque: 'media_library:read',

  // **Opérations datées** et **Promotions** — premier niveau depuis le
  // 2026-10-13 (Hugo), sous le mur des espaces qu'elles ont quittés :
  // préparer une opération, c'est choisir des articles et fixer des dates
  // (`pim_catalog`) ; la frise LIT la même chose que la grille (`b2b_settings`).
  operations: 'pim_catalog:read',
  'operations/:key': 'pim_catalog:read',
  promotions: 'b2b_settings:read',
  'promotions/frise': 'b2b_settings:read',
  'promotions/simulateur': 'b2b_settings:read',

  // **Vitrine** — hors de l'espace B2B, derrière SA ressource : sous `b2b`, le
  // mur `b2b_settings` l'aurait fermée à la communication, qui la compose
  // (boutique-rayon-layout.md, D7). L'ancienne adresse redirige.
  vitrine: 'b2b_storefront:read',

  // **Textes de la boutique** — même métier et même mur que la vitrine
  // (`@AdminSurface("b2b_storefront")`, plan-textes-de-la-boutique.md, §7).
  'textes-boutique': 'b2b_storefront:read',

  // **Outils agent** — hors de `pim/`, et gardé PLUS SERRÉ que lui : le
  // référentiel s'ouvre en lecture (`pim_catalog:read`), cet atelier écrit. Il
  // ne peut donc pas hériter, sinon un lecteur du catalogue armerait des outils
  // d'écriture et récolterait des 403 — ce que la table existe pour empêcher.
  // Deux trousses depuis le 2026-10-11 : le référentiel OU la médiathèque,
  // chacune en écriture ; la page ne déclare que celle dont on a le droit.
  // Trois depuis le 2026-10-11 : l'exploitation, en lecture (`ops_health:read`).
  // Cinq depuis le 2026-10-14 : la flotte, en lecture (`delivery_settings:read`).
  'outils-agent': {
    anyOf: [
      'pim_catalog:write',
      'media_library:write',
      'ops_health:read',
      'b2b_companies:read',
      'delivery_settings:read',
    ],
  },

  pim: 'pim_catalog:read',
  // La SEULE vue du PIM à ne pas hériter : poser un taux de TVA est une
  // décision comptable, et `catalog:write` est réservé à l'admin. La ressource
  // `tax` existe pour ça — sans retirer de lecture à qui l'avait.
  'pim/tva': 'pim_tax:read',
  // Même droit que les taux : décider ce que le professionnel paie par
  // rapport au particulier est une décision comptable.
  'pim/regles-comptables': 'pim_tax:read',
  // L'ÉCRITURE, pas la lecture de ses voisins : la tranche fiscale du journal
  // est servie sous `pim_tax:write` (plan journal, lot 4) — en `read`, le
  // commercial ouvrirait un écran dont chaque appel rendrait 403.
  'pim/journal-fiscal': 'pim_tax:write',
  'pim/catalogue': null,
  'pim/revisions': null,
  // Le diff vivant : même mur que les ancres elles-mêmes — c'est une LECTURE du
  // catalogue, elle ne pose rien et ne publie rien.
  'pim/revisions/en-attente': null,
  'pim/publication': null,
  // La famille se règle sur SA page depuis c-0 : même droit que la liste, elle
  // n'ouvre rien de plus — le référentiel garde chaque écriture de son côté.
  'pim/categories/nouveau': null,
  'pim/categories/:id': null,
  'pim/categories': null,
  'pim/emplacements': null,
  // Le registre décide de ce qu'on peut VENDRE, mais ne porte aucun taux :
  // `catalog:read` suffit, et `tax:read` serait un mur pour rien.
  'pim/contextes': null,
  // La PROVENANCE ne touche à aucun prix : `catalog:read` suffit, et `tax:read`
  // serait un mur pour rien.
  'pim/ingredients': null,
  'pim/appellations': null,
  'pim/allergenes': null,
  'pim/conditionnements': null,
  'pim/limites-de-commande': null,
  'pim/integration': null,
  'pim/produits/nouveau': null,
  'pim/produits/:id': null,
  'pim/produits': null,
  // LA PRODUCTION est un ESPACE dont la coquille n'est PAS gardée depuis le
  // 2026-10-01 (plan-droits-par-geste.md, DG-D1) : le plan du soir, la fiche
  // d'atelier et le colisage sont trois droits, et chaque vue porte le sien.
  production: OPEN,
  // LE FOURNIL, sorti de la Production le 2026-10-06, sous la fiche d'atelier.
  fournil: 'production_worksheet:read',
  'prod-manager': 'production_plan:read',
  // Partis en Réglages › Production le 2026-10-13 (Hugo).
  'reglages/production/fournil': 'production_settings:read',
  // LE COMPTOIR non plus : la file de retrait (`handover_counter`) et la
  // commande pro (`b2b_place_order`) sont deux droits. Attester un retrait
  // passe par `retrait/:token`, qui exige l'écriture.
  // UNE VUE à part des espaces, sous son propre droit : elle montre le nom des
  // clients du jour sans ouvrir les commandes (architecture-supervision-du-jour.md).
  supervision: 'b2b_supervision:read',
  comptoir: OPEN,
  'comptoir/retrait': 'handover_counter:read',
  // Le réassort (2026-10-12, pas encore construit) : le poste du retrait.
  'comptoir/reassort': 'handover_counter:read',
  // Lire les clients du comptoir ET commander : deux gardes, deux droits
  // (architecture-commande-au-comptoir.md). `b2b_companies` n'y apparaît pas — c'est le
  // point : le vendeur de comptoir n'a pas la fiche client.
  'comptoir/nouvelle-commande': ['b2b_counter:read', 'b2b_place_order:write'],
  // La MÊME saisie que `comptes-clients/:id/nouvelle-commande`, montée sous le
  // comptoir pour que la navigation n'en sorte pas.
  'comptoir/nouvelle-commande/:id': ['b2b_counter:read', 'b2b_place_order:write'],
  // LA LIVRAISON est un ESPACE dont la coquille n'est PAS gardée : ses vues
  // relèvent de deux droits distincts, et un garde commun fermerait l'une à qui
  // ne tient que l'autre (plan-preparation-de-tournee.md, lot 2). La coquille ne
  // montre rien d'elle-même ; chaque vue porte son garde.
  // LE COURSIER (2026-10-03) : la page du livreur, hors de la Livraison.
  coursier: 'delivery_driving:read',
  colisage: 'production_packing:read',
  'coursier/:roundId/chargement': 'delivery_driving:read',
  // Le texte d'information du livreur (rgpd-livreur.md §7) : le droit de la page.
  'coursier/mes-donnees': 'delivery_driving:read',
  livraison: OPEN,
  'livraison/feuille-de-route': 'delivery_run_sheet:read',
  'tour-manager': 'delivery_rounds:read',
  'livraison/non-remis': 'delivery_rounds:read',
  // « À décider » (a-la-porte.md, B3) : le droit de décider, pas celui des
  // tournées ni des comptes (2026-10-02) ; la page s'ouvre en lecture, les
  // réponses demandent l'écriture (2026-10-07, audit Q5).
  'livraison/a-decider': 'delivery_decisions:read',
  // Tiré des positions des livreurs : l'écriture des tournées, lecture comprise.
  'livraison/carnet-a-corriger': 'delivery_rounds:write',
  'livraison/simulateur': 'delivery_rounds:read',
  'livraison/assistant-achat': 'delivery_rounds:read',
  // Le chargement (lot 4) : ouvrir un bac, une tournée, des étiquettes est une
  // LECTURE ; les gestes demandent l'écriture, que l'écran seul propose.
  'livraison/chargement': 'delivery_loading:read',
  'livraison/chargement/:roundId': 'delivery_loading:read',
  // La fiche d'un bac se lit sous le colisage OU le chargement (2026-10-02).
  'livraison/bac/:binId': { anyOf: ['production_packing:read', 'delivery_loading:read'] },
  // Les étiquettes lisent le panneau des bacs : celui du geste (2026-10-02).
  // Les étiquettes d'un transfert interne (lot T3) : la route du serveur se lit sous la lecture.
  'livraison/etiquettes/transfert/:transferId': 'delivery_loading:read',
  'livraison/etiquettes/:orderId': {
    anyOf: ['production_packing:write', 'delivery_loading:write'],
  },
  // Les RÉGLAGES de la livraison, partis en Réglages › Livraison le
  // 2026-10-13 (Hugo), mêmes droits.
  'reglages/livraison/vehicules': 'delivery_settings:read',
  'reglages/livraison/bacs': 'delivery_settings:read',
  'reglages/livraison/contenances': 'delivery_settings:read',
  'reglages/livraison/depart': 'delivery_settings:read',
  // Venue des réglages de l'e-commerce (2026-10-10) : ses deux droits, l'un OU l'autre.
  'reglages/livraison/zones': { anyOf: ['delivery_availability:read', 'delivery_fee:read'] },
  // Un QR de sa propre origine et un mode d'emploi : rien à garder.
  'app-mobile': OPEN,
  // 🔴 **L'outillage de développement**, et son absence de garde est le point.
  //
  // Le mur qui compte est côté SERVEUR : la route est murée par `b2b_settings`
  // et refuse toute base qui n'est pas locale. Un `permissionGuard` ici
  // donnerait l'illusion que c'est lui qui protège, et masquerait le vrai —
  // celui qui rend le geste inexprimable en production.
  //
  // Et cet écran n'existe PAS dans un build de production : `dev-tools.ts` n'y
  // déclare aucune route, donc il n'est pas émis. Il n'est ici que parce que la
  // suite tourne, comme `ng serve`, en configuration de développement.
  dev: OPEN,
  // AUCUN garde, et c'est voulu : de la prose sur le fonctionnement du
  // catalogue, pas une donnée. Elle n'a pas de parent dont hériter — d'où
  // `OPEN` plutôt que `null`.
  documentation: OPEN,
  // Ses sections héritent de l'absence de garde, mais `null` est réservé à
  // l'héritage d'un parent GARDÉ : sans garde au-dessus, elles sont ouvertes
  // pour la même raison que leur parent, et le disent chacune.
  'documentation/parametrage-general': OPEN,
  'documentation/parametrage-produit': OPEN,
  'documentation/remplir-une-fiche-produit': OPEN,
  'documentation/vue-d-ensemble': OPEN,
  'documentation/briques': OPEN,
  'documentation/segmentation-web': OPEN,

  commercial: 'b2b_companies:read',
  'commercial/cockpit': 'b2b_growth:read',
  'commercial/prospects': 'b2b_growth:read',
  analytics: 'b2b_growth:read',
  'commercial/calendrier': 'b2b_growth:read',
  // Les réglages du commercial (2026-10-13) — venus de l'Exploitation, passés
  // par l'espace Commercial, rangés en Réglages › Commercial le même jour.
  'reglages/commercial/disponibilite': 'b2b_commercial_appointment:read',
  'reglages/commercial/marches': 'b2b_growth:read',
  'reglages/commercial/alertes': 'b2b_commercial_alert:read',
  // Les motifs des demandes, venus de l'e-commerce : leur propre droit, sorti
  // de `b2b_contact` (Hugo, 2026-10-13).
  'reglages/commercial/motifs-des-demandes': 'b2b_request_reasons:read',
  // Les deux gabarits héritent du mur de `commercial` (`growth:read`) : ils
  // portent des prix négociés, et la même personne qui voit les prospects
  // négocie leurs tarifs.
  'commercial/tarification/mercuriales-templates': null,
  'commercial/tarification/devis-templates': null,
  'commercial/tarification/mercuriales-templates/:id': null,
  'commercial/tarification/devis-templates/:id': null,

  'rendez-vous/:appointmentId': 'b2b_appointments:read',
};

/** Toutes les routes de l'arbre, avec leur chemin complet. */
function flatten(tree: readonly Route[], prefix = ''): { path: string; route: Route }[] {
  return tree.flatMap((route) => {
    const path = [prefix, route.path ?? ''].filter((part) => part !== '').join('/');
    return [{ path, route }, ...flatten(route.children ?? [], path)];
  });
}

/** Les routes qui rendent un écran — une redirection n'en rend aucun. */
function screens(): { path: string; route: Route }[] {
  return flatten(routes).filter(
    ({ route }) => route.loadComponent !== undefined || route.component !== undefined,
  );
}

/**
 * Ce garde porte-t-il sa permission ? Prédicat vérifié plutôt que conversion :
 * `canActivate` accepte aussi les gardes historiques (une classe, voire une
 * chaîne), et `in` seul ne compile pas sur cette union.
 */
function carriesPermission(guard: unknown): guard is PermissionGuard {
  return typeof guard === 'function' && 'permission' in guard;
}

function carriesAnyOf(guard: unknown): guard is AnyPermissionGuard {
  return typeof guard === 'function' && 'anyOf' in guard;
}

/**
 * Les permissions déclarées par cette route, TOUTES, ou `null` si elle n'en
 * déclare pas. Toutes et non la première : la commande pro du comptoir porte
 * deux gardes, et n'en lire qu'un laissait le second changer sans rien rougir.
 */
function declaredPermission(route: Route): readonly (StaffPermission | AnyOf)[] | null {
  const permissions = (route.canActivate ?? []).flatMap(
    (g: unknown): (StaffPermission | AnyOf)[] => {
      if (carriesPermission(g)) {
        return [g.permission];
      }
      return carriesAnyOf(g) ? [{ anyOf: g.anyOf }] : [];
    },
  );
  return permissions.length === 0 ? null : permissions;
}

function keyOf(access: StaffPermission | AnyOf): string {
  return typeof access === 'string' ? access : access.anyOf.join(' | ');
}

/** Une forme comparable d'un accès : `null`, ou les permissions dans l'ordre. */
function accessKey(access: ScreenAccess | readonly (StaffPermission | AnyOf)[]): string | null {
  if (access === null || access === OPEN) {
    return null;
  }
  return isList(access) ? access.map(keyOf).join(' + ') : keyOf(access);
}

function isList(
  access: StaffPermission | AnyOf | readonly (StaffPermission | AnyOf)[],
): access is readonly (StaffPermission | AnyOf)[] {
  return Array.isArray(access);
}

describe("l'arbre de routes du back-office", () => {
  it("n'a aucun écran absent de la table", () => {
    const missing = screens()
      .map(({ path }) => path)
      .filter((path) => !(path in SCREENS));

    expect(missing).toEqual([]);
  });

  it('ne garde aucun écran que la table ne connaît plus', () => {
    const live = new Set(screens().map(({ path }) => path));
    const stale = Object.keys(SCREENS).filter((path) => !live.has(path));

    expect(stale).toEqual([]);
  });

  it('ferme chaque écran derrière EXACTEMENT le droit annoncé', () => {
    const wrong = screens()
      .map(({ path, route }) => ({ path, declared: declaredPermission(route) }))
      // Un écran `OPEN` ne déclare rien — c'est exactement ce qu'on attend de lui.
      .filter(({ path, declared }) => accessKey(declared) !== accessKey(SCREENS[path] ?? null));

    expect(wrong).toEqual([]);
  });

  it('garde les anciennes adresses des écrans déménagés', () => {
    // Catalogue et Tarification ont quitté les Réglages pour l'espace B2B, puis
    // « Retraits & livraisons », découpé en trois pages de ses réglages.
    // Leurs URL vivent dans des favoris et des liens collés : un rangement qui
    // rend 404 se paie par celui qui ne l'a pas fait.
    const reglages = routes.find((route) => route.path === 'reglages');
    const moved = (reglages?.children ?? [])
      .filter((child) => typeof child.redirectTo === 'string')
      .map((child) => [child.path, child.redirectTo]);

    expect(moved).toEqual([
      // `''` n'est plus une adresse fixe : elle suit les droits
      // (`firstReglagesView`, éprouvée dans exploitation-entry-access).
      ['catalogue', '/b2b/catalogue'],
      ['tarification', '/promotions'],
      ['tarification/frise', '/promotions/frise'],
      ['tarification/simulateur', '/promotions/simulateur'],
      ['retraits-livraisons', '/reglages/sites'],
      // Partie en Comptabilité sous son propre droit (2026-09-29).
      ['surtaxe-de-retard', '/comptabilite/surtaxe-de-retard'],
      // Les deux derniers écrans, partis le 2026-10-10.
      ['facturation', '/documentation/facturation'],
      // L'entrée de la section Réglages › Commandes : l'heure limite (O1b).
      ['commandes', '/reglages/commandes/heure-limite'],
      // Réglages › Production (2026-10-13) : l'entrée de la section.
      ['production', '/reglages/production/fournil'],
      // Revenus en Réglages › Commercial le 2026-10-13 : l'entrée de la section.
      ['commercial', '/reglages/commercial/disponibilite'],
    ]);
  });

  it('renvoie l’ancienne adresse de la vitrine vers son écran hors de l’espace', () => {
    // Elle a quitté `b2b/contenu` pour `/vitrine` (plan vitrine, D7) : l'adresse
    // vit dans des favoris, et un rangement qui rend 404 se paie par celui qui
    // ne l'a pas fait. Absolue, sans quoi elle resterait sous le mur de l'espace.
    const b2b = routes.find((route) => route.path === 'b2b');
    const contenu = b2b?.children?.find((child) => child.path === 'contenu');
    const vitrine = contenu?.children?.find((child) => child.path === 'vitrine');
    expect(vitrine?.redirectTo).toBe('/vitrine');
  });

  it('renvoie l’ancienne adresse des CGV vers Réglages › Légal', () => {
    // Partie le 2026-10-15 (Hugo) : un favori. Absolue, elle s'applique avant
    // le mur de l'espace.
    const b2b = routes.find((route) => route.path === 'b2b');
    const contenu = b2b?.children?.find((child) => child.path === 'contenu');
    const cgv = contenu?.children?.find((child) => child.path === 'cgv');
    expect(cgv?.redirectTo).toBe('/reglages/legal/cgv');
  });

  it('renvoie chaque ancienne mention vers son segment français sous Réglages › Légal', () => {
    // Partie le 2026-10-15 (Hugo). La table est celle du vocabulaire : chaque
    // clé du contrat a une adresse, et l'ancienne y mène.
    const b2b = routes.find((route) => route.path === 'b2b');
    const contenu = b2b?.children?.find((child) => child.path === 'contenu');
    const mentions = contenu?.children?.find((child) => child.path === 'mentions/:mention');
    expect(mentions?.redirectTo).toBe(legacyLegalMentionRedirect);
    expect(mentions?.loadComponent).toBeUndefined();
    const moved = Object.keys(LEGAL_MENTION_SLUGS).map((mention) =>
      legacyLegalMentionRedirect({ params: { mention } }),
    );
    expect(moved).toEqual([
      '/reglages/legal/mentions-legales',
      '/reglages/legal/cgv',
      '/reglages/legal/confidentialite',
      '/reglages/legal/cookies',
      '/reglages/legal/accessibilite',
    ]);
    // Une clé inventée garde son segment : l'écran dira « Mention inconnue ».
    expect(legacyLegalMentionRedirect({ params: { mention: 'inventee' } })).toBe(
      '/reglages/legal/inventee',
    );
  });

  it('renvoie les anciens réglages de livraison vers l’Exploitation', () => {
    // Partis des réglages de l'e-commerce pour Exploitation › Livraison
    // (2026-10-10). Absolue, sans quoi elle resterait sous le mur de l'espace.
    const b2b = routes.find((route) => route.path === 'b2b');
    const reglages = b2b?.children?.find((child) => child.path === 'reglages');
    const livraison = reglages?.children?.find((child) => child.path === 'livraison');
    // Puis en Réglages › Livraison (2026-10-13) : sans détour.
    expect(livraison?.redirectTo).toBe('/reglages/livraison/zones');
  });

  it('renvoie les anciennes adresses des motifs des demandes vers Réglages › Commercial', () => {
    // Déménagés le 2026-10-13 : absolues, sans quoi elles resteraient sous le
    // mur `b2b_settings` de l'espace.
    const b2b = routes.find((route) => route.path === 'b2b');
    const reglages = b2b?.children?.find((child) => child.path === 'reglages');
    const motifs = reglages?.children?.find((child) => child.path === 'motifs-des-demandes');
    const formulaire = b2b?.children?.find((child) => child.path === 'contact/formulaire');
    expect(motifs?.redirectTo).toBe('/reglages/commercial/motifs-des-demandes');
    expect(motifs?.loadComponent).toBeUndefined();
    expect(formulaire?.redirectTo).toBe('/reglages/commercial/motifs-des-demandes');
  });

  it('renvoie les anciens réglages du fournil et de la livraison vers les Réglages', () => {
    // Partis le 2026-10-13 (Hugo) : des favoris de poste. Absolues.
    const redirectsOf = (path: string): Record<string, unknown> =>
      Object.fromEntries(
        (routes.find((route) => route.path === path)?.children ?? [])
          .filter((child) => typeof child.redirectTo === 'string')
          .map((child) => [child.path, child.redirectTo]),
      );
    expect(redirectsOf('production')).toMatchObject({
      reglages: '/reglages/production/fournil',
    });
    expect(redirectsOf('livraison')).toMatchObject({
      vehicules: '/reglages/livraison/vehicules',
      bacs: '/reglages/livraison/bacs',
      contenances: '/reglages/livraison/contenances',
      depart: '/reglages/livraison/depart',
      zones: '/reglages/livraison/zones',
    });
  });

  it('renvoie les anciens réglages du Commercial vers Réglages › Commercial, sans détour', () => {
    // Partis le 2026-10-13 (Hugo). Absolues : sous `commercial`, elles
    // resteraient derrière le mur `b2b_companies` de l'espace.
    const commercial = routes.find((route) => route.path === 'commercial');
    const moved = (commercial?.children ?? [])
      .filter((child) => child.path?.startsWith('reglages') === true)
      .map((child) => [child.path, child.redirectTo]);
    expect(moved).toEqual([
      ['reglages', '/reglages/commercial/disponibilite'],
      ['reglages/disponibilite', '/reglages/commercial/disponibilite'],
      ['reglages/marches', '/reglages/commercial/marches'],
      ['reglages/alertes', '/reglages/commercial/alertes'],
      ['reglages/motifs-des-demandes', '/reglages/commercial/motifs-des-demandes'],
    ]);
    const exploitation = routes.find((route) => route.path === 'exploitation');
    expect(exploitation?.children?.[0]?.redirectTo).toBe('/reglages/commercial/disponibilite');
  });

  it('ouvre Réglages › Commercial sans avaler ses propres vues', () => {
    // En préfixe, `commercial` capturerait `commercial/marches` et
    // redirigerait en boucle vers la disponibilité.
    const reglages = routes.find((route) => route.path === 'reglages');
    const entry = reglages?.children?.find((child) => child.path === 'commercial');
    expect(entry?.pathMatch).toBe('full');
  });

  it('renvoie les anciens réglages de l’e-commerce vers Réglages › Commandes', () => {
    // Déménagés le 2026-10-13 (plan-reglages-commandes.md, O1b) : absolues,
    // sans quoi elles resteraient sous le mur `b2b_settings` de l'espace.
    const b2b = routes.find((route) => route.path === 'b2b');
    const reglages = b2b?.children?.find((child) => child.path === 'reglages');
    const moved = Object.fromEntries(
      (reglages?.children ?? [])
        .filter((child) => typeof child.redirectTo === 'string')
        .map((child) => [child.path, child.redirectTo]),
    );
    expect(moved).toMatchObject({
      '': '/reglages/commandes/heure-limite',
      'ouverture-boutique': '/reglages/commandes/ouverture',
      'heures-limites': '/reglages/commandes/heure-limite',
      commandes: '/reglages/commandes/annulation',
    });
    expect((reglages?.children ?? []).some((child) => child.loadComponent !== undefined)).toBe(
      false,
    );
  });

  it('renvoie les anciens points de retrait vers Réglages › Sites, même identifiant', () => {
    // Le point EST le site (plan des sites, S1, 2026-10-13) : ses adresses
    // vivent dans des favoris et dans le journal. Absolues, sans quoi elles
    // resteraient sous le mur `b2b_settings` de l'espace.
    const b2b = routes.find((route) => route.path === 'b2b');
    const reglages = b2b?.children?.find((child) => child.path === 'reglages');
    const moved = (reglages?.children ?? [])
      .filter((child) => child.path?.startsWith('points-de-retrait') === true)
      .map((child) => [child.path, child.redirectTo]);
    expect(moved).toEqual([
      ['points-de-retrait', '/reglages/sites'],
      ['points-de-retrait/nouveau', '/reglages/sites/nouveau'],
      ['points-de-retrait/:id', '/reglages/sites/:id'],
    ]);
  });

  it('renvoie l’ancienne fournée vers le Fournil, et /production et le prévisionnel vers Prod manager', () => {
    // `/production/journee` est le favori des postes de labo (2026-10-06).
    const production = routes.find((route) => route.path === 'production');
    const moved = (production?.children ?? [])
      .filter((child) => typeof child.redirectTo === 'string')
      .map((child) => [child.path, child.redirectTo]);
    expect(moved).toEqual([
      ['', '/prod-manager'],
      ['journee', '/fournil'],
      ['previsionnel', '/prod-manager'],
      // Partis en Réglages › Production le 2026-10-13.
      ['reglages', '/reglages/production/fournil'],
      ['colisage', '/colisage'],
    ]);
  });

  it('renvoie les lots de prélèvement vers le prélèvement du mois', () => {
    // Remplacés par l'écran du mois le 2026-10-08 (PA4) : l'adresse vit dans
    // des favoris, et dans les liens des arrêtés déjà ouverts.
    const comptabilite = routes.find((route) => route.path === 'comptabilite');
    const moved = (comptabilite?.children ?? [])
      .filter((child) => typeof child.redirectTo === 'string')
      .map((child) => [child.path, child.redirectTo]);
    expect(moved).toEqual([
      ['', 'tableau-de-bord'],
      ['lots-de-prelevement', 'prelevement-du-mois'],
    ]);
  });

  it('renvoie l’ancienne file de retrait vers la vue du comptoir', () => {
    // `/remises` vit dans les favoris du personnel : le passage à l'espace
    // Comptoir ne doit pas le rendre 404.
    const remises = routes.find((route) => route.path === 'remises');
    expect(remises?.redirectTo).toBe('comptoir/retrait');
    expect(remises?.loadComponent).toBeUndefined();
  });

  it('monte la saisie du comptoir avec l’origine « counter »', () => {
    // Sans elle, la saisie reprend les liens du Commercial — vers
    // `/comptes-clients`, que le poste du comptoir n'a pas forcément le droit d'ouvrir.
    const comptoir = routes.find((route) => route.path === 'comptoir');
    const entry = comptoir?.children?.find((child) => child.path === 'nouvelle-commande/:id');
    expect(entry?.data?.['origin']).toBe('counter');
  });

  it('monte la Supervision au premier niveau, sous son seul droit', () => {
    // Pas sous `b2b_orders:read` : c'est le point — elle se donne à qui supervise
    // sans ouvrir les commandes (architecture-supervision-du-jour.md, Front).
    const supervision = routes.find((route) => route.path === 'supervision');

    expect(supervision && declaredPermission(supervision)).toEqual(['b2b_supervision:read']);
  });

  it('ouvre le comptoir sur le premier onglet permis', () => {
    // Plus une redirection fixe vers le retrait (2026-10-12) : le poste qui ne
    // tient que la commande pro était renvoyé hors du comptoir par le garde.
    const comptoir = routes.find((route) => route.path === 'comptoir');
    const root = comptoir?.children?.find((child) => child.path === '');
    expect(root?.redirectTo).toBe(comptoirLanding);
  });

  it('ne laisse hériter que les écrans dont le parent est gardé', () => {
    const guarded = new Set(
      screens()
        .filter(({ route }) => declaredPermission(route) !== null)
        .map(({ path }) => path),
    );
    const orphans = Object.entries(SCREENS)
      .filter(([, permission]) => permission === null)
      .map(([path]) => path)
      .filter((path) => !ancestorsOf(path).some((ancestor) => guarded.has(ancestor)));

    expect(orphans).toEqual([]);
  });
});

/** Les chemins parents de celui-ci, du plus proche au plus lointain. */
function ancestorsOf(path: string): string[] {
  const segments = path.split('/');
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('/'));
}
