import { subject, subjectLabelOf, text, type PhraseFact, type Said, type Segment } from './phrase';

/**
 * **Le repli d'un type sans phrase** — jamais le type brut seul.
 *
 * Il ne dit que ce qu'il sait sans risque de mentir, et laisse le reste au
 * détail (D4), qui rend toute la charge :
 *
 * - quand le verbe du type est un seul mot connu **et** qu'il porte sur le
 *   sujet de la ligne lui-même (`product_category.created` sur une famille) :
 *   « Colette a créé la famille « Tartes » » ;
 * - sinon : « Fait enregistré sur la fiche « Tarte citron » ». Un suffixe
 *   composé (`delivery_address_added`) agit sur AUTRE CHOSE que le sujet :
 *   « a ajouté le client « Café » » serait faux, et le détail dira quoi.
 *
 * C'est un filet, pas une phrase : le lot D en écrit une par type.
 */

/** Le verbe d'un suffixe d'un seul mot, au passé composé, après l'auteur. */
const VERBS: Readonly<Record<string, string>> = {
  accepted: 'a accepté',
  activated: 'a activé',
  added: 'a ajouté',
  archived: 'a archivé',
  cancelled: 'a annulé',
  captured: 'a saisi',
  cleared: 'a effacé',
  closed: 'a clos',
  confirmed: 'a confirmé',
  converted: 'a converti',
  corrected: 'a corrigé',
  created: 'a créé',
  declared: 'a déclaré',
  deleted: 'a supprimé',
  featured: 'a mis en avant',
  handled: 'a traité',
  hidden: 'a masqué',
  invited: 'a invité',
  minted: 'a émis',
  moved: 'a déplacé',
  named: 'a nommé',
  paused: 'a suspendu',
  posed: 'a posé',
  published: 'a publié',
  pushed: 'a envoyé',
  reclassified: 'a reclassé',
  reinstated: 'a rétabli',
  removed: 'a supprimé',
  renamed: 'a renommé',
  reordered: 'a réordonné',
  replaced: 'a remplacé',
  requested: 'a demandé',
  restored: 'a restauré',
  resumed: 'a repris',
  retaken: 'a rouvert',
  revoked: 'a révoqué',
  sent: 'a envoyé',
  set: 'a réglé',
  shown: 'a affiché',
  signed: 'a signé',
  suspended: 'a suspendu',
  taken: 'a posé',
  unfeatured: 'a retiré de la mise en avant',
  unpublished: 'a retiré de la vente',
  updated: 'a modifié',
};

/**
 * Le sujet de la ligne, avec son article — par `subjectType`, tel que le
 * backend l'écrit (vérifié le 2026-09-19 sur les `subjectType:` de
 * `apps/lfd-api/src`). Un type de sujet absent d'ici se dit par son seul
 * libellé.
 */
const SUBJECT_NOUNS: Readonly<Record<string, string>> = {
  accounting_rules: 'les règles comptables',
  allergen_category: 'la catégorie d’allergènes',
  allergen_entry: 'l’allergène',
  appellation: 'l’appellation',
  catalog_delivery: 'l’arrivée du référentiel',
  catalog_item: 'l’article',
  catalog_revision: 'la révision',
  company: 'le client',
  company_bank_account: 'le RIB',
  delivery_availability: 'l’ouverture de la livraison',
  delivery_zone: 'la zone de livraison',
  feature_access: 'la fonctionnalité',
  floor: 'la limite de prix',
  ingredient: 'l’ingrédient',
  ladder: 'le barème de volume',
  lead: 'le prospect',
  legal_entity: 'l’entité juridique',
  mercuriale: 'la mercuriale',
  order_cutoff: 'l’heure limite',
  order_cutoff_waiver: 'la dérogation d’heure limite',
  order_late_fee: 'la surtaxe de retard',
  order_time_limit: 'l’heure limite',
  payment_mandate: 'le mandat',
  pickup_address: 'le point de retrait',
  point_of_sale: 'le point de vente',
  product: 'la fiche',
  product_category: 'la famille',
  production_container: 'le contenant',
  production_day: 'la journée',
  public_pickup_schedule: 'les créneaux publics',
  rule: 'la règle de prix',
  sales_context: 'le contexte de vente',
  staff_role: 'le rôle',
  staff_user: 'la fiche d’équipe',
  subscription: 'le panier récurrent',
  user: 'la personne',
  vat_rate: 'le taux de TVA',
  volume_commitment: 'l’engagement de volume',
};

export function fallbackPhrase(fact: PhraseFact): Said {
  const label = subjectLabelOf(fact);
  const noun = Object.hasOwn(SUBJECT_NOUNS, fact.subjectType)
    ? (SUBJECT_NOUNS[fact.subjectType] ?? null)
    : null;
  const object = objectSegments(fact, noun, label);
  const verb = verbOn(fact);
  if (verb !== null && object.length > 0) {
    return {
      title: null,
      segments: [text(`${fact.actor} ${verb} `), ...object],
      consumed: ['subjectLabel'],
      namesActor: true,
    };
  }
  return {
    title: null,
    segments:
      object.length === 0 ? [text('Fait enregistré')] : [text('Fait enregistré sur '), ...object],
    consumed: ['subjectLabel'],
    namesActor: false,
  };
}

/** Le verbe, seulement s'il porte sur le sujet de la ligne lui-même. */
function verbOn(fact: PhraseFact): string | null {
  const dot = fact.type.lastIndexOf('.');
  const prefix = fact.type.slice(0, dot);
  const suffix = fact.type.slice(dot + 1);
  if (dot < 0 || prefix !== fact.subjectType || !Object.hasOwn(VERBS, suffix)) {
    return null;
  }
  return VERBS[suffix] ?? null;
}

/** « la famille « Tartes » », « « Tartes » », « la famille » — ou rien. */
function objectSegments(fact: PhraseFact, noun: string | null, label: string | null): Segment[] {
  if (label === null) {
    return noun === null ? [] : [text(noun)];
  }
  return [text(noun === null ? '« ' : `${noun} « `), subject(fact, label), text(' »')];
}
