/**
 * **La prose du guide de l'agence**, en un seul endroit : la page la rend en
 * HTML, le générateur Markdown la recopie telle quelle. Écrire un texte deux
 * fois, c'est le laisser diverger au premier changement de contrat.
 *
 * Les textes sont en Markdown **en ligne** restreint — `code`, **gras**,
 * *italique* — que `renderInlineMarkdown` sait traduire et que tout lecteur
 * Markdown lit nativement. Les espaces insécables sont des caractères, pas
 * des entités : un `&nbsp;` passerait tel quel dans le fichier téléchargé.
 */

/**
 * 🚩 **Le XML est servi** depuis le 2026-10-18 : `Accept: application/xml`,
 * `?format=xml` et `GET /vitrine/schema.xsd` répondent
 * (`apps/lfd-api/src/b2b/vitrine/http/vitrine.controller.ts`). Le drapeau
 * reste pour qu'un retrait se fasse en une ligne — la page et le Markdown le
 * lisent tous deux.
 */
export const VITRINE_XML_AVAILABLE = true;

/** Le nom du fichier téléchargé. */
export const VITRINE_GUIDE_FILE_NAME = 'guide-webhook-vitrine.md';

export const VITRINE_GUIDE_TITLE = 'Webhook vitrine — guide de l’agence';

/** Une ligne d'un tableau qui n'est pas un champ : une route, une erreur. */
export interface DocRow {
  readonly key: string;
  readonly a: string;
  readonly b: string;
  readonly c: string;
}

/** L'en-tête d'une des six sections numérotées. */
export interface GuideSection {
  readonly title: string;
  readonly subtitle: string;
}

export const GUIDE_INTRO =
  'Pour le développeur du site vitrine : comment La Folie Coffee vous prévient qu’un élément du catalogue a changé, comment vérifier que l’appel vient bien de nous, puis comment relire ce qui a changé. Toutes les données servies sont **publiques** : les mêmes que sur la boutique en ligne.';

export const GUIDE_RECEIVED = {
  lead: 'Ce que vous recevez de nous, une fois, à la création de votre abonnement :',
  body: 'l’adresse de base de l’API, une **clé de lecture** et un **secret de signature**. Les deux derniers ne sont montrés qu’une fois : rangez-les comme des mots de passe. Si nous les régénérons, les anciens cessent aussitôt de valoir.',
} as const;

export const GUIDE_SECTIONS = {
  principle: {
    title: '1. Le principe : on vous prévient, vous relisez',
    subtitle: 'deux sens, deux mécanismes',
  },
  auth: { title: '2. Authentification', subtitle: 'une clé pour lire, un secret pour vérifier' },
  notification: { title: '3. La notification', subtitle: 'ce que nous POSTons à votre adresse' },
  reads: { title: '4. Les lectures', subtitle: 'relire ce qui a changé' },
  schema: {
    title: '5. Le schéma de données',
    subtitle: 'les entités servies, et ce qui les relie',
  },
  xml: { title: '6. Format XML', subtitle: 'la même ressource, en XML' },
} as const satisfies Record<string, GuideSection>;

/** Les étiquettes des exemples de code. */
export const SAMPLE_LABELS = {
  node: 'Node.js',
  php: 'PHP',
  headers: 'En-têtes',
  body: 'Corps',
  request: 'Requête',
  error: 'Erreur',
  itemJson: 'Un article (JSON)',
  json: 'JSON',
  xml: 'XML',
} as const;

export const PRINCIPLE_POINTS: readonly string[] = [
  '**De nous vers vous — la notification.** Au plus tard cinq minutes après un changement, nous envoyons un `POST` signé à l’adresse `https` que vous nous avez donnée. Il ne contient **pas** les données : seulement les clés de ce qui a changé et de ce qui a disparu.',
  '**De vous vers nous — la relecture.** Vous relisez ensuite les éléments nommés (ou tout le catalogue) avec votre clé de lecture, dans la langue de votre choix.',
  'Vous ne recevez que les ensembles cochés pour vous : *catalogue* (articles et rayons), *opérations*, *textes*, *Incontournables*. Un ensemble non coché est vide dans nos réponses et n’apparaît jamais dans une notification.',
];

export const AUTH_POINTS: readonly string[] = [
  '**La clé de lecture** accompagne chacune de vos lectures, dans l’en-tête `X-Vitrine-Key` — ou, si votre outil ne sait pas poser d’en-tête, dans l’URL : `?key=<votre clé>` (l’en-tête l’emporte s’il est là). Elle vous identifie et applique vos ensembles cochés. Absente, inconnue, régénérée ou abonnement coupé de notre côté : réponse `403`.',
  '**Le secret de signature** ne voyage jamais : il vous sert à vérifier que chaque notification vient de nous et n’a pas été modifiée.',
];

export const SIGNATURE_INTRO =
  'Chaque notification porte l’en-tête `Vitrine-Signature: t=<horodatage>,v1=<signature>` :';

export const SIGNATURE_STEPS: readonly string[] = [
  '`t` est l’instant de l’envoi en **secondes** depuis le 1ᵉʳ janvier 1970 (UTC).',
  'La chaîne signée est exactement `<t>.<corps brut>` : la valeur de `t`, un point, puis le corps de la requête **tel que reçu**, octet pour octet (UTF-8). Ne re-sérialisez jamais le JSON avant de vérifier.',
  '`v1` est le **HMAC-SHA256** de cette chaîne, avec votre secret pour clé, écrit en hexadécimal minuscule.',
  'Comparez à **temps constant**, et refusez un `t` qui s’écarte de plus de **300 secondes** de votre horloge : c’est ce qui rend un rejeu inutile.',
];

export const NOTIFICATION_HEADER_POINTS: readonly string[] = [
  '`Content-Type` vaut toujours `application/json`.',
  '`Vitrine-Signature` : voir la section 2. Recalculée à chaque essai.',
  '`Vitrine-Delivery` : l’identifiant de l’envoi, **identique d’un essai à l’autre** tant que le contenu ne change pas.',
];

export const NOTIFICATION_TABLE_CAPTIONS = {
  body: 'Le corps de la notification',
  keys: 'changed et removed — les clés, par ensemble',
} as const;

/** Les trois sous-titres de la notification, et leurs points. */
export const NOTIFICATION_TOPICS: readonly {
  readonly title: string;
  readonly points: readonly string[];
}[] = [
  {
    title: 'Répondre',
    points: [
      'Répondez **2xx** (200 ou 204) en **moins de 5 secondes**, puis relisez en tâche de fond. Tout le reste compte comme un échec : un autre statut, une **redirection** (jamais suivie — donnez-nous l’adresse finale), un délai dépassé, un certificat refusé.',
      'Le corps de votre réponse n’est pas lu.',
      'Signature invalide ou `t` hors fenêtre : refusez (401, par exemple) et ne traitez rien.',
    ],
  },
  {
    title: 'Échecs et relances',
    points: [
      'Après un échec, la **même** livraison repart au plus tôt 30 s plus tard, puis 1 min, 2 min, 4 min… le délai doublant à chaque fois. **Dix essais** en tout, étalés sur environ quatre heures.',
      'Tant qu’une livraison attend, les changements suivants s’y ajoutent : même `sequence`, mais un contenu qui a grossi, donc un **nouveau** `Vitrine-Delivery`.',
      'Au dixième échec, votre abonnement passe **en échec** : plus rien ne vous est envoyé. Une fois votre adresse réparée, nous déclenchons « Tout renvoyer » : la notification suivante nomme alors **tout** votre contenu comme changé.',
      'Un **essai** envoyé depuis notre écran porte `"test": true` et `"sequence": 0`, des listes vides, et n’est jamais relancé.',
    ],
  },
  {
    title: 'Séquence et doublons',
    points: [
      '`sequence` croît d’une livraison à l’autre pour votre abonnement. Une livraison renvoyée à la main par notre équipe garde sa séquence d’origine : ne supposez pas un ordre d’arrivée strict.',
      'Un même envoi peut vous parvenir **deux fois** (un essai que vous avez traité mais auquel la réponse est arrivée trop tard, par exemple). Le plus sûr : traiter chaque notification comme un signal de relecture — relire deux fois ne coûte rien. Si vous écartez les doublons sur `Vitrine-Delivery`, vous ne perdez rien : un même identifiant revient toujours avec le même contenu, et un contenu grossi arrive sous un identifiant neuf.',
    ],
  },
];

export const ROUTE_TABLE = {
  caption: 'Les routes de lecture',
  headers: ['Route', 'Rend', 'Notes'],
  rows: [
    {
      key: 'catalogue',
      a: 'GET /vitrine/catalogue',
      b: 'Le catalogue',
      c: 'Tout, en une fois : rayons, articles, opérations. La relecture la plus simple.',
    },
    {
      key: 'article',
      a: 'GET /vitrine/articles/:sku',
      b: 'Article',
      c: '404 si l’article n’est plus en vente au public (traitez-le comme retiré).',
    },
    {
      key: 'textes',
      a: 'GET /vitrine/textes',
      b: 'Les textes',
      c: 'Les textes de la boutique dans la langue demandée.',
    },
    {
      key: 'schema',
      a: 'GET /vitrine/schema.xsd',
      b: 'Le schéma XSD',
      c: 'Décrit les trois lectures en XML. Sans clé.',
    },
  ] satisfies readonly DocRow[],
} as const;

export const READ_POINTS: readonly string[] = [
  '**Adresse** : les lectures se font sur `https://lafoliecoffee.info/api/lfd/vitrine/…` (par exemple `https://lafoliecoffee.info/api/lfd/vitrine/catalogue`). Le préfixe `/api/lfd` est **obligatoire** : sans lui, vous recevez une page de la boutique, pas le flux.',
  '**Lecture seule** : si votre site lit seulement le flux (XML ou JSON) et ne veut recevoir aucun appel de notre part, dites-le nous : votre abonnement n’aura **pas d’adresse de webhook**, et seule votre clé de lecture vous servira.',
  '**Langue** : `?lang=fr`, `en` ou `it` — `fr` sans paramètre. Un nom ou une ligne non traduits sont servis **en français**, texte par texte ; la forme de la réponse ne change pas. Les opérations portent leurs langues elles-mêmes et ne dépendent pas du paramètre.',
  '**Débit** : 60 requêtes par minute et par adresse IP. Après une notification, une seule relecture du catalogue suffit le plus souvent.',
  'Les erreurs répondent en JSON : un `code` stable, un `message` en français, un `requestId` à nous transmettre si vous nous écrivez.',
];

export const ERROR_TABLE = {
  caption: 'Les erreurs',
  headers: ['Statut', 'code', 'Cas'],
  rows: [
    {
      key: '400',
      a: '400',
      b: 'http.payload.invalid',
      c: 'lang inconnue (autre que fr, en, it), ou format inconnu (autre que json, xml).',
    },
    {
      key: '403',
      a: '403',
      b: 'vitrine.read_key.refused',
      c: 'Clé absente, inconnue, remplacée par une régénération, ou abonnement coupé de notre côté.',
    },
    {
      key: '404',
      a: '404',
      b: 'vitrine.article.not_found',
      c: 'Article absent de votre vue (GET /vitrine/articles/:sku seulement).',
    },
    {
      key: '429',
      a: '429',
      b: '—',
      c: 'Plus de 60 requêtes par minute depuis la même adresse IP.',
    },
  ] satisfies readonly DocRow[],
} as const;

/** Les en-têtes des tableaux de champs, dans l'ordre des colonnes. */
export const FIELD_HEADERS = ['Champ', 'Type', 'Présence', 'Description'] as const;

export const PRICE_WARNING = {
  lead: 'Les prix sont des entiers, et pas tous dans la même unité.',
  body: '`unitPriceMillicents` et `catalogPriceMillicents` sont **hors taxe**, en **millicentimes** : 1 € = 100 000. `unitPriceTtcCents` est **toutes taxes comprises**, en **centimes** : 1 € = 100. Au particulier, affichez `unitPriceTtcCents` tel quel : le recalculer depuis le hors taxe et le taux peut décaler d’un centime. Il n’y a pas de prix à barrer TTC.',
} as const;

export const SCHEMA_POINTS: readonly string[] = [
  '**Promotions** : elles ne sont pas une entité à part. Le prix servi les inclut déjà, et `catalogPriceMillicents` (le prix à barrer) n’est présent que lorsqu’une promotion rend le prix plus bas.',
  '**Incontournables** : le booléen `isFeatured` d’un article.',
  '**Absent** et **null** ne sont pas la même chose : un champ « peut être absent » n’apparaît pas du tout dans le JSON ; un champ « peut valoir null » est présent, à `null`.',
];

export const XML_SOON = {
  badge: 'Disponible prochainement',
  body: 'Ce format n’est **pas encore servi** : il est décrit ici pour que vous puissiez le préparer. D’ici là, nos réponses sont en JSON.',
} as const;

export const XML_POINTS: readonly string[] = [
  'Chaque lecture existe en XML, demandée par l’en-tête `Accept: application/xml` ou par le paramètre `?format=xml`. La réponse porte `Content-Type: application/xml; charset=utf-8` et commence par la déclaration `<?xml version="1.0" encoding="UTF-8"?>`.',
  '`?format=json` est le défaut, et le paramètre l’emporte sur l’en-tête. Toute autre valeur est refusée en **400**, code `http.payload.invalid`. Les erreurs, elles, restent en JSON.',
  'Le schéma XSD se télécharge à `GET /vitrine/schema.xsd`, sans clé. Les racines : `<catalogue>`, `<item>` pour un article, `<texts>`. Sans espace de noms ; l’ordre des éléments d’un objet n’est pas promis.',
  'Les éléments portent **exactement** le nom des champs JSON, en camelCase.',
  'Un tableau devient un élément au pluriel contenant des éléments au singulier : `items` → `item`, `shelves` → `shelf`, `operations` → `operation`, `skus` → `sku`. Un tableau vide reste un élément vide (`<shelves/>`).',
  'Une valeur `null` ne produit **aucun** élément.',
  'Un texte traduit est un élément simple, dans la langue demandée. Ce qui porte ses langues dans le JSON les porte aussi en XML : le nom d’une opération s’écrit `<name><fr>…</fr><en>…</en></name>`.',
  'Les textes de la boutique : un `<text key="product.bestSeller">…</text>` par texte, dans `<texts>`.',
  'Les caractères qu’XML 1.0 interdit (caractères de contrôle invisibles) sont retirés des textes ; le reste est échappé.',
  'La notification, elle, reste en JSON.',
];
