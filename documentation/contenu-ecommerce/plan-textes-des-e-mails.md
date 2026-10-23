# Plan — piloter le texte de tous les e-mails

> **Doc-first, 2026-10-23.** Hugo : « dans communication j'ai besoin d'avoir
> une page pour piloter le contenu texte de tous les emails ». Hugo a confié
> les choix à l'assistant le même jour ; chacun porte sa raison. Ne touche ni
> l'argent, ni une migration de données, ni une frontière de sécurité : pas de
> `vitruve`, les affirmations sur l'existant ont été rouvertes à la main.

## 0. Ce qui existe (ouvert le 2026-10-23)

- **28 e-mails**, déclarés dans le registre
  `apps/lfd-api/src/platform/mailer/mail-templates.ts` (`B2bMails`) : 17 pour
  le client (`customer.*`), 10 pour l'équipe (`staff.*` et `ops.deploy-check`),
  1 pour l'agence (`agency.vitrine-notice`).
- **Une partie de leurs textes** est déjà dans un dictionnaire en trois
  langues, `platform/mailer/copy/` (`MAIL_COPY`, `mail-copy.model.ts`, ~140
  lignes par langue) : la confirmation de commande, la tournée partie, la
  facture émise, l'annulation. **Le reste est écrit dans les gabarits** :
  l'avis de prélèvement, l'accès ouvert, les demandes clients, le dossier du
  fournil, les sous-comptes, la vitrine, et la plupart des e-mails de l'équipe
  (`mail-templates.ts`, 928 lignes).
- **Le modèle à suivre existe** pour les textes de la boutique
  ([`plan-textes-de-la-boutique.md`](plan-textes-de-la-boutique.md)) :
  `b2b/shop-copy/` (entrées en brouillon puis publiées, `shop_copy_entries`,
  `shop_copy_publication`), l'écran `textes-boutique/` du back-office, au
  premier niveau de Communication, droit `b2b_storefront`.

## 1. Les choix

- **C1 — Tous les textes d'un e-mail passent par le dictionnaire.** Objet,
  sur-titre, titre, paragraphes, libellés, boutons, pied. Un texte resté dans
  un gabarit ne se pilote pas. Les **données** (numéro, montant, date, nom)
  restent des variables `{ref}`, `{total}`… que le texte place où il veut.
- **C2 — Le code garde les textes par défaut ; l'écran les remplace.** Même
  mécanique que la boutique : une entrée par (clé, langue), en brouillon puis
  **publiée**. Un e-mail lit le texte publié s'il existe, sinon celui du code.
  _(Raison : un e-mail doit partir même si la base ne répond pas sur ce
  point ; et retirer une modification ramène au texte d'origine.)_
- **C3 — Brouillon, aperçu, puis « Publier ».** On modifie plusieurs textes,
  on voit l'e-mail rendu, et un seul geste les met en service. Un e-mail parti
  est parti : l'aperçu passe avant.
- **C4 — Les trois langues, le français en référence**, comme la boutique :
  l'écran signale un français modifié dont une traduction n'a pas suivi.
- **C5 — Les variables sont gardées.** Un texte qui perd une variable
  obligatoire (`{ref}` dans l'objet d'une confirmation) ou qui en invente une
  inconnue est **refusé** à l'enregistrement, avec la liste des variables
  permises. _(Raison : un client qui reçoit « Votre commande {ref} » voit le
  défaut, pas l'écran qui l'a causé.)_
- **C6 — L'aperçu est le vrai gabarit**, rendu avec des **données d'exemple**
  marquées, comme la planche des documents : rien n'est envoyé, rien n'est
  écrit. Un bouton « M'envoyer un essai » envoie l'aperçu à l'adresse du staff
  connecté, et à elle seule.
- **C7 — Le droit** est celui des textes de la boutique, `b2b_storefront`
  (lire pour voir, écrire pour modifier et publier) : même métier, la
  communication. _(Raison : pas de nouvelle ressource à accorder à l'écran
  pour une page du même métier.)_
- **C8 — La page** vit dans Communication, au premier niveau, à côté des
  textes de la boutique : « Textes des e-mails ». Les e-mails y sont rangés
  par destinataire (clients, équipe, agence) puis par moment (commande,
  paiement, livraison, compte…), chacun avec ses textes et son aperçu.

## 2. Les lots

| Lot                                      | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E1** ✅ bâti le 2026-10-23 (§2 bis)    | Sortir des gabarits **tous** les textes des 28 e-mails vers le dictionnaire, en trois langues (le français est la vérité ; l'anglais et l'italien reprennent l'existant, sinon une traduction marquée à relire). Aucun changement de rendu : chaque e-mail rend les mêmes octets en français avant et après (tests de non-régression par gabarit). Un manifeste des clés (e-mail, clé, variables permises, texte par défaut) généré depuis le dictionnaire, tenu par une porte comme `lint:shop-copy-digest`. |
| **E2** ✅ bâti le 2026-10-23 (§2 ter)    | Le serveur : entrées en brouillon et publiées (migration additive, sur le modèle de `shop_copy_entries`), le texte effectif (défaut + publié), validation des variables (C5), routes admin (lister, modifier, rétablir, publier), aperçu d'un e-mail avec données d'exemple (C6), essai envoyé au staff connecté, fait de journal et ses libellés.                                                                                                                                                            |
| **E3** ✅ bâti le 2026-10-23 (§2 quater) | L'écran du back-office (C3, C4, C8) : la liste, l'éditeur à trois langues, l'aperçu, « M'envoyer un essai », « Publier », sur le modèle de `textes-boutique/`.                                                                                                                                                                                                                                                                                                                                                |
| **E4a** ✅ bâti le 2026-10-23 (§3 bis)   | Le serveur des sections (§3) : sections déclarées par gabarit, rendu dans l'ordre, ordre en brouillon / publié, aperçu repéré, routes, itinéraire d'un retrait (S7).                                                                                                                                                                                                                                                                                                                                          |
| **E4b** ✅ bâti le 2026-10-23 (§3 ter)   | L'écran des sections : une carte par section avec badge « Texte » / « Système », cadres en tête, monter / descendre, « Rétablir l'ordre », clic dans l'aperçu → carte, survol d'une carte → section encadrée.                                                                                                                                                                                                                                                                                                 |

## 2 bis. E1 — bâti le 2026-10-23 (non commité à l'écriture)

- **Le dictionnaire est rangé par e-mail** : `MailCopy` a une section par clé
  du registre (`mailCopyOf(locale)["customer.order-placed"]`…), découpé en
  cinq familles (`copy/model/` : commande, paiement, facturation, compte,
  équipe) et autant de fichiers par langue (`copy/fr/`, `copy/en/`,
  `copy/it/`). Les 28 gabarits ne portent plus de texte ; ce qui leur reste
  est de la mise en page (ordre des blocs, sauts de paragraphe, forme
  « Libellé : valeur » des e-mails internes, guillemets autour d'un message
  saisi, séparateurs de liste). `mandate-to-sign-wording.ts` ne garde que
  son type.
- **Les variables permises** sont déclarées dans `apps/lfd-api/src/platform/mailer/copy/mail-copy.variables.ts`
  (ce que le gabarit passe à `fill`) ; les **obligatoires** sont celles du
  texte français par défaut. `mail-copy.spec.ts` refuse une variable non
  déclarée, dans les trois langues.
- **Le manifeste** `apps/lfd-api/src/platform/mailer/copy/mail-copy-manifest.json`
  (e-mail → clé → variables permises, obligatoires → texte français) est
  généré par `pnpm mail-copy:digest` ; `lint:mail-copy-digest` (47ᵉ porte)
  refuse qu'il retarde. 325 textes, 28 e-mails.
- **Aucun octet changé** : `apps/lfd-api/src/platform/mailer/__tests__/mail-rendering-golden.spec.ts` compare
  81 cas (chaque branche de chaque e-mail, en français) aux empreintes
  capturées AVANT le déménagement (`apps/lfd-api/src/platform/mailer/__tests__/rendering-golden/mail-rendering.golden.json` :
  objet en clair, SHA-256 du HTML et des pièces jointes).

### Traductions neuves à relire (anglais et italien)

Reprises de l'existant : confirmation, mise à disposition, livraison en
route, paiement refusé, paiement expiré, annulation, facture émise. Le texte
alternatif du QR (`qrAlt`) reprend le titre déjà traduit.

**Écrites le 2026-10-23, à relire** — toutes les sections suivantes, en
anglais et en italien :

- `customer.order-placed-with-your-email`, `customer.order-payment-link` ;
- `customer.collection-notice`, `customer.mandate-to-sign` (dont les deux
  pieds de schéma CORE et B2B — mentions SEPA, à relire avec le formulaire
  traduit s'il existe ; « UMR » en anglais pour la RUM) ;
- `customer.access-opened`, `customer.company-attached`,
  `customer.login-method-linked`, `customer.password-reset` ;
- `customer.sub-account-activity`, `customer.sub-account-gesture` (les
  `action` sont des fragments glissés dans « Your site {site} {action}… » :
  l'ordre des mots y est contraint) ;
- les onze e-mails de l'équipe : `staff.*`, `ops.deploy-check`,
  `agency.vitrine-notice` (« Benvenuto » au masculin générique en italien,
  comme le reste du dictionnaire au vouvoiement « Lei »).

## 2 ter. E2 — bâti le 2026-10-23 (non commité à l'écriture)

- **Le stockage** est un contexte du commerce, `apps/lfd-api/src/b2b/mail-copy/`,
  sur le modèle de `b2b/shop-copy/` : `mail_copy_entries` (une ligne par
  e-mail, chemin, langue ; brouillon à trois états, révision) et
  `mail_copy_publication` (une ligne, la version), migration additive
  `20261023180000_les_textes_des_e_mails`, aucun droit accordé.
- **Le texte effectif** : les gabarits lisent toujours `mailCopyOf(locale)` ;
  il rend le dictionnaire du code, remplacé par les textes d'un périmètre
  ouvert (`apps/lfd-api/src/platform/mailer/copy/mail-copy-overlay.ts`). Le mailer (`MAILER`) est désormais
  `JournalingMailer(EffectiveCopyMailer(MAIL_TRANSPORT))` : il ouvre le
  périmètre du publié avant chaque envoi. Le publié se lit par le port
  `PublishedMailCopyReader`, que le mailer déclare (`platform/`) et que
  `apps/lfd-api/src/appBootstrap/mail-copy-source.module.ts` relie au cache du contexte
  (relu au plus toutes les 15 s, oublié à « Publier »). Lecture en échec :
  l'e-mail part avec le texte du code, et l'API le journalise. Seuls les
  textes que le code connaît, et dont les variables tiennent encore, sont
  appliqués.
- **C5** : vide, variable obligatoire perdue ou variable inconnue → `400`,
  le message liste les variables permises.
- **L'aperçu et l'essai** rendent le vrai gabarit sur un exemple par e-mail
  (`platform/mailer/specimens/`, tout ce qui nomme quelqu'un dit
  « EXEMPLE », liens vers `exemple.invalid`). L'aperçu incruste les images
  `cid:` ; l'essai part par le vrai mailer à l'adresse de la fiche de
  l'appelant, jamais à une adresse de la requête.
- **Les routes**, sous `b2b_storefront` : `GET /admin/mail-copy`,
  `PUT /admin/mail-copy/drafts`, `POST /admin/mail-copy/resets`,
  `POST /admin/mail-copy/publications`,
  `GET /admin/mail-copy/previews?mail=&locale=&source=draft|published`,
  `POST /admin/mail-copy/trials` ; contrats dans
  `packages/contracts/src/mail-copy.ts`.
- **Le journal** : `mail_copy.published` (avant/après de chaque texte) et
  `mail_copy.trial_sent` (e-mail, langue, source), phrases au back-office
  dans `shared/journal/phrases/storefront-phrases.ts`.
- ⚠️ Un e-mail dont les données ne portent pas de langue
  (`followsLocale: false`, 21 sur 28) part toujours en français : son
  aperçu en anglais ou en italien montre donc le français, comme l'envoi.

## 2 quater. E3 — bâti le 2026-10-23 (non commité à l'écriture)

- **L'écran** `apps/lfd-backoffice-frontend/src/app/textes-emails/`, rangé comme
  `textes-boutique/` (`data/`, `rules/`, `state/`, `ui/`) et lui empruntant ses
  langues et la hauteur des champs (`textes-boutique/rules/copy-text.ts`). Route
  `/textes-emails` sous `b2b_storefront:read` ; écrire, publier et s'envoyer un
  essai demandent `:write`. Entrée « Textes des e-mails » dans Communication,
  au rail ET aux tuiles.
- **La liste** range par destinataire (Clients, Équipe, Agence) puis par
  moment ; chaque e-mail a un intitulé et une ligne « qui / quand » écrits
  dans `rules/mail-labels.ts` (une clé inconnue s'affiche telle quelle).
- **Un texte** montre ses trois langues côte à côte, l'état (brouillon,
  publié), « Rétablir », le texte du code quand il diffère, la traduction en
  retard (C4), et ses variables en boutons qui s'insèrent au curseur du
  dernier champ touché — les obligatoires marquées. La validation des
  variables n'est PAS doublée côté écran : le refus `400` du serveur
  s'affiche tel quel sous le champ, qui garde la frappe.
- **L'aperçu** : objet, pièces jointes nommées, corps dans une
  `<iframe srcdoc sandbox="">` ; langue et source (brouillon / publié) au
  choix, relu à chaque écriture acceptée. « M'envoyer un essai » envoie
  d'abord la frappe en attente. Un e-mail `followsLocale: false` le dit à
  côté des langues de l'aperçu, sous ses champs EN/IT et en tête de l'e-mail.
- **« Publier »** dans un bandeau « N modifications en attente », qui
  n'apparaît que s'il y en a. Pas d'historique des publications : E2 n'a pas
  de route pour le lire (le journal porte `mail_copy.published`).

- La **mise en page** des e-mails (couleurs, logo, ordre des blocs) : c'est
  le gabarit, pas le texte.
- Le **choix de la langue** d'un client : rien ne la porte encore
  (`mail-copy.ts`, `DEFAULT_MAIL_LOCALE`) ; les trois langues sont prêtes pour
  le jour où elle existera.

## 2 quinquies. Le texte d'origine changé — serveur bâti le 2026-10-23 (non commité à l'écriture)

Hugo, 2026-10-23 : un texte modifié à l'écran (brouillon ou publié) dont le
texte du code a changé depuis la modification doit être SIGNALÉ, comme la
traduction en retard (C4) — un avertissement, jamais un refus.

- **Ce qui est noté** : `mail_copy_entries.draft_default_text` et
  `published_default_text` (migration additive
  `20261023233000_le_texte_d_origine_des_e_mails`) — le TEXTE du code de la
  même langue, pas une empreinte : l'écran peut montrer l'ancien à côté du
  nouveau. Les lignes d'avant restent à NULL = inconnu = pas de signal ;
  les remplir aurait demandé de recopier le dictionnaire dans le SQL, et
  d'affirmer qu'elles avaient été écrites contre lui.
- **L'agrégat** (`MailCopyEntry`) note le texte du code à chaque brouillon qui
  remplace, l'oublie à « Rétablir », et note le texte du code COURANT à la
  publication : publier vaut relecture.
- **Le signal** (`apps/lfd-api/src/b2b/mail-copy/domain/mail-copy-default-drift.ts`) porte
  sur ce qui partira : le brouillon s'il remplace, sinon le publié ; rien sur
  un « rétablir », une orpheline, un inconnu.
- **Le contrat** : `MailCopyLocaleView.defaultChangedSince:
{ previousDefault: string } | null` (le texte d'aujourd'hui reste
  `default`), et `MailCopyAdminView.defaultChangedCount`. L'écran reste à
  faire.
- ⚠️ **Les textes de la boutique ont la même faiblesse** (`b2b/shop-copy`, vu
  le 2026-10-23) : rien n'y note le texte du code au moment de la
  modification. Non corrigé.

## 3. E4 — les sections d'un e-mail, ordonnées (doc-first, 2026-10-23)

Hugo : « les cartes des sections auto comme le QR ou la liste avec les prix
avec un badge système, mais pouvoir les déplacer plus haut ou plus bas, les
sections doivent avoir des positions » ; et « si on clique sur un élément, ça
devrait highlight la carte concernée ».

- **S1 — Un e-mail est une suite de sections**, déclarée par gabarit : en-tête
  (logo, « LA FOLIE COFFEE », titre header), titre, paragraphe(s),
  récapitulatif (montants), image (QR), bouton, lien secondaire, pied. Chaque
  section est de nature **texte** (ses textes au dictionnaire, modifiables) ou
  **système** (produite par les données : QR, récapitulatif, pièces jointes —
  non modifiable), et porte un **badge** dans l'écran.
- **S2 — Les positions se règlent** : chaque section a une position ; l'écran
  permet de la monter ou de la descendre. **L'en-tête reste en tête, le pied de
  recours (adresse de l'administrateur) reste en bas** : ce sont des cadres,
  pas des sections. Une section absente d'un envoi (pas de QR pour une
  livraison) est simplement sautée.
- **S3 — L'ordre se publie comme les textes** : brouillon, aperçu, « Publier »,
  par e-mail ; sans ordre publié, l'ordre du code s'applique. Migration
  additive.
- **S4 — L'aperçu et l'écran se répondent** : l'aperçu est rendu avec un
  repère par section (et par texte) ; un clic sur un élément de l'aperçu met
  en évidence la carte concernée et la fait défiler ; un survol d'une carte
  encadre sa section dans l'aperçu.
- **S5 — Le rendu ne change pas** tant que rien n'est publié : l'ordre par
  défaut de chaque gabarit est celui d'aujourd'hui, prouvé par les empreintes
  d'E1 (régénérées une fois pour l'en-tête au logo).

- **S6 — Une carte par section, ses textes dedans** (Hugo, 2026-10-23 : « au
  lieu d'avoir Titre — paid, Titre — due, Titre — account… créer une section
  avec un titre, ça fera moins de cartes et sera plus structuré »). Les
  variantes d'un même texte (`title.paid`, `title.due`, `title.account`) se
  rangent dans la carte de leur section, chacune sous un nom lisible qui dit
  QUAND elle s'affiche (« Commande payée par carte », « Commande à régler »,
  « Commande au compte »), FR/EN/IT côte à côte. Le chemin technique
  (`title.paid`) n'est plus affiché, sauf au survol.

- **S7 — « Y aller », pour un retrait** (Hugo, 2026-10-23 : « pour un mail dont
  la commande va être en retrait boutique, le système devrait proposer un
  bouton qui déclenche un maps avec l'adresse du point de retrait »). Une
  section **système** des e-mails d'une commande en retrait (confirmation,
  commande prête, modification) : un bouton qui ouvre l'itinéraire vers le
  point, par un lien universel de carte (Google Maps `?api=1&destination=…`,
  qui ouvre aussi l'application sur téléphone), sur le **point GPS** du site
  s'il est posé, sinon sur son adresse figée dans la commande. Son libellé
  (« Itinéraire vers la boutique ») est un texte modifiable ; le lien, lui, est
  produit par les données. Absente pour une livraison.

Lots : **E4a** serveur (sections déclarées par gabarit, rendu dans l'ordre,
ordre en brouillon / publié, aperçu repéré, routes) ; **E4b** écran (cartes
par section avec badge, monter / descendre, clic aperçu → carte, survol carte
→ aperçu).

## 3 bis. E4a — bâti le 2026-10-23 (non commité à l'écriture)

- **La coquille rend une suite de sections** (`packages/mailer/src/layout-sections.ts`) :
  `title`, `body`, `summary`, `image`, `itinerary`, `cta`, `secondaryLink`,
  `footer`, dans cet ordre par défaut. L'en-tête (bandeau, logo, sous-titre) et
  le recours restent hors sections. `renderLayout` reçoit `sections` (un
  ordre ; une section qu'il ne nomme pas suit à sa place par défaut) et
  `markSections` (l'aperçu). Les sept sections d'avant laissent leur ligne
  vide quand elles sont absentes : c'est ce qui garde l'ordre par défaut
  **identique à l'octet** (S5) — les 77 empreintes qui ne portent pas de
  retrait n'ont pas bougé.
- **Chaque e-mail déclare ses sections** (`apps/lfd-api/src/platform/mailer/sections/`,
  `MAIL_LAYOUTS`, exhaustif sur le registre : un e-mail sans déclaration ne
  compile pas) : ses deux cadres (objet, en-tête), puis ses sections et, dans
  chacune, ses textes du dictionnaire. Nature `text` (titre, paragraphes,
  pied) ou `system` (récapitulatif, image, itinéraire, bouton, lien
  secondaire ; le titre et le corps de l'annonce de l'agence, saisis). Les
  pièces jointes ne sont pas une section : elles n'ont pas de place dans le
  corps. `apps/lfd-api/src/platform/mailer/sections/__tests__/mail-layouts.spec.ts` rend les 81 cas en aperçu repéré et vérifie
  que chaque texte s'affiche dans la section qui le déclare.
- **S6 — Les variantes** portent leur nom lisible (« Commande payée par
  carte », « Prénom inconnu ») dans la déclaration, côté serveur, à côté du
  gabarit qui choisit la variante, et l'écran le reçoit par le contrat
  (`MailSectionTextView.variant`) : un nom écrit à l'écran divergerait du
  code au premier gabarit modifié.
- **L'ordre se règle et se publie** dans `b2b/mail-copy` : agrégat
  `MailSectionOrder` (brouillon à trois états, révision), table
  `mail_section_orders` (migration additive
  `20261023230000_l_ordre_des_sections_des_e_mails`). Il refuse un ordre qui
  oublie, double ou invente une section, ou qui nomme l'en-tête ou le recours
  (`400`, la liste attendue dans le message). **Publication commune avec les
  textes** : le même « Publier », la même version, le même fait
  (`mail_copy.published` porte `sectionOrders`, avant/après, quand un ordre
  change) — l'aperçu montre l'e-mail entier, et « Publier » met en service ce
  qu'il a montré.
- **À l'envoi**, `EffectiveCopyMailer` lit l'ordre publié par le même port
  (`PublishedMailCopyReader.sectionOrders()`, même cache, même version) ; un
  ordre illisible fait partir l'e-mail dans l'ordre du code, avec ses textes
  publiés, et l'API le journalise. Un ordre que les sections du code ne
  permettent plus est ignoré.
- **L'aperçu est repéré** (S4) : `<div data-mail-section="<id>">` autour de
  chaque section rendue, `<span data-mail-text="<chemin>" data-mail-text-of="<e-mail>">`
  autour de chaque texte (ôté d'un attribut : le `alt` du QR). Rien de tout
  ça dans l'essai ni dans un envoi.
- **S7 — L'itinéraire** (`apps/lfd-api/src/platform/mailer/pickup-itinerary.ts`) :
  un bouton encadré « Itinéraire vers la boutique » (fr/en/it au
  dictionnaire, chemin `itinerary`) dans la confirmation et le « c'est prêt »
  d'un RETRAIT, vers `https://www.google.com/maps/dir/?api=1&destination=…`,
  sur le point GPS (`pickupPoint`, facultatif dans les données) sinon sur
  l'adresse figée. ⚠️ **Aucun appelant ne passe encore le point GPS** : la
  feuille projetée ne le porte pas, l'itinéraire se fait donc sur l'adresse.
  Les quatre empreintes des retraits ont été régénérées après avoir vérifié
  que, ce bouton ôté, le HTML rendait l'empreinte d'avant.
- **Les routes**, sous `b2b_storefront` : la lecture est
  `GET /admin/mail-copy` (chaque e-mail porte `frames`, `sections` rangées
  dans l'ordre du brouillon avec `defaultPosition` / `publishedPosition` /
  `draftPosition`, et `sectionOrder`) ; `PUT /admin/mail-copy/section-orders`
  `{ mail, order, expectedRevision }` et
  `POST /admin/mail-copy/section-order-resets` `{ mail, expectedRevision }`
  rendent `204`. `pendingCount` compte aussi un ordre en attente.

## 3 ter. E4b — bâti le 2026-10-23 (non commité à l'écriture)

- **Une carte par section** (`textes-emails/ui/mail-section-card/`) : d'abord
  les deux cadres (« Objet », « En-tête »), qui ne se déplacent pas, puis les
  sections dans l'ordre du brouillon. Badge « Texte » ou « Système » ; une
  carte système dit ce qu'elle montre et qu'elle est produite par les données
  (`rules/mail-sections.ts`, une phrase par section de la coquille) ; ses
  libellés éventuels restent éditables. Dans une carte, chaque texte porte le
  nom de sa variante (`variant`), rien s'il est seul, FR/EN/IT côte à côte ;
  le chemin technique n'est plus qu'au survol (`title`). Un texte qu'aucune
  carte ne range (le `alt` du QR) reste éditable sous « Autres textes ».
- **Monter / descendre** : deux boutons fold par carte (fold n'a pas de
  glisser-déposer, vérifié dans les déclarations de types de fold-ng le 2026-10-23), désactivés aux
  bords. Chaque geste écrit en brouillon avec la révision lue puis relit ;
  `400` affiché tel quel au-dessus des sections, `409` relit et le dit au même
  endroit. Badge « Ordre modifié » et « Rétablir l'ordre » ; l'ordre en
  attente compte pour un dans « N modifications en attente ».
- **L'aperçu répond aux cartes** (S4) : le cadre passe de `sandbox=""` à
  `sandbox="allow-same-origin"`, **sans** `allow-scripts` — le HTML du serveur
  reste inerte (ni script, ni formulaire, ni fenêtre), et c'est l'écran qui lit
  `contentDocument` pour écouter les clics. Un `postMessage` aurait demandé un
  script dans le cadre. Un clic désigne la carte (et le texte s'il est de cet
  e-mail ; un texte de l'en-tête désigne le cadre) : encadrée, défilée ; le
  lien cliqué n'est pas suivi. Le survol d'une carte encadre sa section dans
  l'aperçu, à la couleur du token fold lue dans l'écran.
