/**
 * **La phrase d'un fait du journal**, et sa date lisible — ce que tout écran
 * qui relit le journal dit de la même façon.
 *
 * Sorti de `admin/journal/journal-line.ts` le 2026-09-19 : l'onglet
 * « Historique » de la fiche produit relit les mêmes faits du référentiel, et
 * deux traductions d'un même type finiraient par raconter deux histoires. Ne
 * dépend que du **type** et de la **charge** : l'historique d'une fiche ne
 * reçoit ni module, ni nature d'auteur, ni trace.
 */

/** Ce qu'il faut d'un fait pour le raconter. */
export interface JournalFact {
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * Traduit un fait en **phrase**. Un type inconnu n'est pas une erreur : le
 * journal est ouvert, un module peut en émettre un que l'écran ne connaît pas
 * encore — on rend alors le type lui-même, ce qui reste vrai.
 */
export function factSentence(event: JournalFact): string {
  const p = event.payload;
  switch (event.type) {
    case 'vat_rate.created':
      return `Taux de TVA « ${text(p['name'])} » créé à ${percent(p['percent'])}`;
    case 'vat_rate.rate_changed':
      return `Taux de « ${text(p['name'])} » passé de ${percent(p['from'])} à ${percent(p['to'])}`;
    case 'vat_rate.renamed':
      return `Taux « ${text(p['from'])} » renommé « ${text(p['to'])} »`;
    case 'vat_rate.deleted':
      return `Taux de TVA « ${text(p['name'])} » supprimé (${percent(p['percent'])})`;
    case 'product_category.vat_changed':
      return 'Taux de TVA d’une famille modifiés';
    case 'order.placed':
      // Le NUMÉRO d'abord : c'est par lui qu'on retrouve une commande, pas par
      // son identifiant technique.
      return `Commande ${text(p['orderNumber'])} passée`;
    case 'product.published':
      return `Produit « ${text(p['name'])} » publié au catalogue (${text(p['sku'])})`;
    case 'product.unpublished':
      return `Produit « ${text(p['name'])} » retiré de la vente (${text(p['sku'])})`;
    case 'company.client_note_edited_by_staff':
      return clientNoteSentence(p['action']);
    default:
      return pricingSentence(event) ?? settingSentence(event) ?? event.type;
  }
}

/**
 * « 21 août 2026 à 14:32 ». Le journal affichait l'ISO brut, ce qui est lisible
 * par une machine et par personne d'autre — or il est fait pour être lu par des
 * humains. Heure **locale** : celui qui lit cherche « ce qui s'est passé ce
 * matin », pas un instant UTC.
 */
export function factWhen(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(at);
}

function text(value: unknown): string {
  return optional(value) ?? '—';
}

/** Une chaîne non vide, ou `null`. Le vide n'est pas une valeur à afficher. */
export function optional(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** « 5,5 % ». Un taux absent rend `—` plutôt qu'un `NaN %`. */
function percent(value: unknown): string {
  return typeof value === 'number' ? `${value.toString().replace('.', ',')} %` : '—';
}

/** Un compte, ou `null` s'il n'a pas été figé. Zéro EST un compte. */
export function count(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

/**
 * Les actes de **tarification**.
 *
 * Ils portent déjà leur phrase — figée au moment de l'acte par le domaine, qui
 * seul sait dire ce que la règle affirmait. On ne la reconstruit pas : on la
 * lit, et on préfixe par le verbe. Une phrase recalculée aujourd'hui pour un
 * acte d'hier raconterait l'histoire à l'envers.
 */
const PRICING_VERBS: Readonly<Record<string, string>> = {
  posed: 'posée',
  replaced: 'remplacée',
  confirmed: 'confirmée',
  paused: 'suspendue',
  resumed: 'reprise',
  archived: 'archivée',
  renamed: 'renommée',
};

const PRICING_SUBJECTS: Readonly<Record<string, string>> = {
  price_rule: 'Règle de prix',
  price_floor: 'Limite de prix',
  volume_ladder: 'Barème de volume',
};

function pricingSentence(event: JournalFact): string | null {
  const [subject, act] = event.type.split('.');
  const noun = subject === undefined ? undefined : PRICING_SUBJECTS[subject];
  const verb = act === undefined ? undefined : PRICING_VERBS[act];
  if (noun === undefined || verb === undefined) {
    return null;
  }
  const summary = optional(event.payload['summary']);
  const reason = optional(event.payload['reason']);
  const said = summary === null ? '' : ` — ${summary}`;
  // Le motif écrit par l'agent : c'est souvent la seule phrase qui explique
  // pourquoi un prix a cessé de s'appliquer.
  return `${noun} ${verb}${said}${reason === null ? '' : ` (${reason})`}`;
}

/** Les réglages qui décident du prix de livraison, du retrait et des heures limites. */
function settingSentence(event: JournalFact): string | null {
  const p = event.payload;
  switch (event.type) {
    case 'delivery_zone.created':
      return `Zone de livraison « ${text(p['label'])} » créée`;
    case 'delivery_zone.updated':
      return `Zone de livraison « ${text(p['label'])} » modifiée`;
    case 'delivery_zone.removed':
      return 'Zone de livraison supprimée';
    case 'pickup_address.created':
      return `Point de retrait « ${text(p['label'])} » créé`;
    case 'pickup_address.updated':
      return `Point de retrait « ${text(p['label'])} » modifié`;
    case 'pickup_address.removed':
      return 'Point de retrait supprimé';
    case 'pickup_address.default_set':
      return 'Point de retrait par défaut changé';
    case 'public_pickup_schedule.updated': {
      // Le nombre de plages dit l'essentiel : passer de zéro à une ouvre les
      // créneaux publics du point, et c'est ce qu'un visiteur verra changer.
      const rules = count(p['ruleCount']);
      return `Créneaux publics de « ${text(p['label'])} » réglés${
        rules === null ? '' : ` (${rules} plage(s))`
      }`;
    }
    case 'delivery_availability.updated':
      return 'Livraison par clientèle réglée';
    case 'order_cutoff.created':
      return `Heure limite posée à ${text(p['time'])}`;
    case 'order_cutoff.updated':
      return `Heure limite portée à ${text(p['time'])}`;
    case 'order_cutoff.removed':
      return 'Heure limite supprimée';
    case 'volume_commitment.signed': {
      // Une quantité est un NOMBRE : `text` la rendrait « — », et un engagement
      // sans volume promis ne veut rien dire.
      const promised = count(p['promisedQuantity']);
      return `Engagement de volume signé${promised === null ? '' : ` (${promised.toString()})`}`;
    }
    case 'volume_commitment.closed':
      return `Engagement de volume clos${optional(p['reason']) === null ? '' : ` (${text(p['reason'])})`}`;
    default:
      return null;
  }
}

/**
 * Les gestes du staff sur les **notes du commercial**.
 *
 * Le fait ne porte AUCUN contenu — ni titre, ni description, ni photo — et la
 * phrase n'en invente pas : une note supprimée définitivement ne doit rester
 * lisible nulle part, journal compris (plan « notes photo du commercial », D6).
 * Une action inconnue se dit en termes généraux plutôt que de disparaître.
 */
const CLIENT_NOTE_ACTIONS: Readonly<Record<string, string>> = {
  note_added: 'Note du commercial ajoutée',
  note_revised: 'Note du commercial modifiée',
  note_removed: 'Note du commercial supprimée définitivement',
  notes_reordered: 'Notes du commercial reclassées',
};

function clientNoteSentence(action: unknown): string {
  return (
    (typeof action === 'string' ? CLIENT_NOTE_ACTIONS[action] : undefined) ??
    'Notes du commercial modifiées'
  );
}
