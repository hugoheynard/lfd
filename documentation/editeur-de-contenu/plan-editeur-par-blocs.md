# Plan — l'éditeur d'e-mails par blocs (S4 et S5)

> 📋 **Doc-first, 2026-11-06.** Suite de
> [`plan-service-e-mails.md`](plan-service-e-mails.md) : S4 (le modèle par
> blocs et son rendu) et S5 (l'éditeur au back-office). Décisions de Hugo du
> même jour, rassemblées aux § 13, 14, 14 bis et 14 ter de ce plan-là, et
> tirées de deux maquettes qu'il a manipulées. Hugo s'est absenté en laissant
> la consigne « tu ne t'arrêtes pas, tu notes tes questions » : les choix
> faits par défaut sont marqués, les questions sont au § 9.
>
> ⚔️ **À contredire par `vitruve`** avant le bâti : le plan porte des données
> enregistrées (les modèles), une permission neuve et le rendu des e-mails
> qui partent pour de vrai.

## Partie 1 — Comprendre

### Ce qu'on construit

Un écran du back-office où l'équipe compose un e-mail **comme dans un outil
d'e-mailing professionnel** : à gauche les variables de l'e-mail, au milieu
son aperçu, à droite une bibliothèque de blocs et d'images. On glisse un
bloc, on écrit son texte, on l'ordonne, on le met en colonnes ; on regarde le
rendu en français, anglais, italien, sur téléphone, en mode sombre ; on
s'envoie un essai ; on publie.

```mermaid
flowchart LR
  subgraph BO["back-office — l'éditeur (S5)"]
    V["variables"] --- P["aperçu"] --- L["blocs + médiathèque"]
  end
  BO -- "brouillon, publier" --> DOC[("le modèle de l'e-mail<br/>une structure de blocs<br/>+ ses textes FR / EN / IT")]
  DOC --> R["rendu par blocs<br/>(@lfd/mailer, S4)"]
  DATA["données de l'envoi<br/>(commande, client…)"] --> R
  R --> E["l'e-mail envoyé"]
```

### Ce qui ne change pas

- **Tant que rien n'est publié pour un e-mail, il part exactement comme
  aujourd'hui**, à l'octet près pour son HTML et son objet.
- Les blocs **système** (récapitulatif, QR, itinéraire) restent produits par
  les données : l'équipe les place, elle ne les écrit pas.
- La charte (couleurs, police, marges) est celle de la marque, jamais réglée
  dans un e-mail.

## Partie 2 — Technique

### 1. L'existant (ouvert le 2026-11-06)

- **La coquille** `renderLayout` (`packages/mailer/src/html.ts`) rend des
  **champs fixes** — titre, corps, bouton, lien secondaire, récapitulatif,
  image (`cid:`), itinéraire, pied — dans un ordre réglable
  (`sections`), avec un en-tête (logo) et un recours fixes. Le corps est **un
  seul texte** (`white-space:pre-line`), échappé. La charte est une constante
  `BRAND` (marine `#24448f`, ivoire, encre) écrite en dur. **Rien n'est
  déclaré pour le mode sombre** (aucun `prefers-color-scheme`).
- **Les textes** : le dictionnaire du code (`platform/mailer/copy/`), les
  réécritures publiées de l'équipe (`public.mail_copy_entries`, contexte
  `b2b/mail-copy`), l'ordre des sections publié
  (`public.mail_section_orders`), l'écran `textes-emails` du back-office
  (`apps/lfd-backoffice-frontend/src/app/textes-emails/`).
- **Le QR** : PNG déterministe, fond blanc opaque, zone de silence intégrée
  (`apps/lfd-api/src/platform/mailer/qr-image.ts`).
- **Le back-office** a `@angular/cdk` (22.1.2) : le glisser-déposer
  (`cdk/drag-drop`) est disponible sans dépendance neuve.
- La Médiathèque est la route `mediatheque` du back-office.

### 2. Le modèle d'un e-mail (S4)

**Un document par (e-mail, marque)** : une **structure** de blocs commune aux
trois langues, et les **textes** de chaque bloc en FR, EN, IT (Hugo,
2026-11-06).

```ts
// La forme, en esprit — le contrat exact se fixe au bâti.
type MailDocument = {
  template: MailTemplateKey; // "customer.order-placed", …
  brand: "lfc"; // la billetterie viendra
  blocks: Block[]; // l'ordre de l'e-mail
};
type Block =
  | { id; kind: "heading" | "paragraph" | "footer"; text: Localized<RichText> }
  | { id; kind: "button" | "secondaryLink"; label: Localized<string>; href: LinkTarget }
  | { id; kind: "callout"; tone: "info" | "warning"; text: Localized<RichText> }
  | { id; kind: "divider" }
  | { id; kind: "image"; mediaId; alt: Localized<string>; widthPct: Step }
  | { id; kind: "columns"; widths: Step[]; cells: SimpleBlock[][] } // 2 ou 3
  | { id; kind: "system"; system: "summary" | "qr" | "itinerary"; caption?: Localized<string> };
```

- **`RichText`** : du texte, du gras, de l'italique, des liens, et des
  **jetons de variable** (`{prénom}`) — jamais du HTML libre.
- **`LinkTarget`** : une variable que le modèle fournit (lien de paiement, de
  suivi…) ou une adresse fixe en `https://`.
- **Les crans** de largeur : 25, 33, 50, 67, 75 % ; une rangée fait 100.
- **Règles tenues au serveur à chaque enregistrement** (le front les montre,
  le serveur les refuse) : blocs admis par le modèle ; pas de colonnes dans
  une colonne ; pas de bloc système dans une colonne ; chaque bloc système
  obligatoire du modèle présent une fois ; variables connues du modèle ;
  variables obligatoires présentes ; adresses en `https://`.

**Le contrat** (le schéma des blocs) vit dans un paquet partagé par l'API et le
back-office — `@lfd/contracts` s'il convient, sinon un paquet dédié (choix
au bâti). Le rendu, lui, reste dans `@lfd/mailer`.

**Chaque modèle déclare** (dans le code du bloc `mail`, à partir du registre
`B2bMails`) : ses variables (le manifeste d'aujourd'hui), ses blocs système et
lesquels sont obligatoires, les blocs qu'il admet, et son **document par
défaut**.

### 3. Pas de migration de masse : le document par défaut

Les réécritures publiées d'aujourd'hui (textes et ordre des sections) **ne
sont pas converties en masse**. Choix par défaut, à contredire :

- Sans document publié, un e-mail part comme aujourd'hui (coquille actuelle +
  textes effectifs). Rien ne bouge.
- Quand l'équipe **ouvre** un e-mail dans l'éditeur pour la première fois, le
  serveur lui propose un **brouillon de départ** calculé : la conversion de
  la coquille actuelle en blocs, avec les textes **effectifs** du moment
  (dictionnaire + réécritures publiées) dans les trois langues.
- À la **première publication** d'un document, il prend la main pour cet
  e-mail ; les réécritures de l'ancien écran ne s'appliquent plus à lui.

**Garantie, prouvée par un test par modèle et par langue** : le document de
départ, rendu par le moteur par blocs, donne **les mêmes octets** (HTML et
objet) que la coquille actuelle. Sans elle, publier un e-mail sans rien
toucher changerait ce que reçoit le client.

### 4. Le rendu par blocs (S4)

- `@lfd/mailer` gagne un rendu **par liste de blocs**, avec la même coquille
  (en-tête, recours, `max-width:560px`, CSS en ligne, tableaux de
  présentation). Les colonnes sont des tableaux ; sur téléphone elles
  s'empilent par une règle `@media` dans `<head>` (lue par Apple Mail et
  Gmail web ; ignorée ailleurs, où les colonnes restent côte à côte).
- **La charte par marque** remplace la constante `BRAND` : `lfc` aujourd'hui,
  la billetterie demain. Elle porte une **variante sombre** déclarée par
  `prefers-color-scheme` pour les messageries qui la respectent.
- **Le QR** garde son PNG sur fond blanc opaque : jamais inversé.
- **Les images de la Médiathèque** : par défaut, **jointes en ligne**
  (`cid:`), comme le logo et le QR — la règle « aucune image distante » de la
  coquille tient, et les messageries qui bloquent les images distantes les
  affichent quand même. Une variante réduite (~600 px de large) est jointe,
  pas l'original. Question au § 9.
- `@lfd/mailer` change : `pnpm test` à la racine à chaque lot qui y touche.

### 5. Le stockage et la publication (S4)

- **Schéma `mail`** (le bloc l'a depuis S0) : une table des documents
  (modèle, marque, brouillon, publié, révision, auteur, dates) et une table
  **des versions publiées**, en ajout seul (le retour arrière republie une
  version passée).
- Brouillon enregistré à chaque modification (autosave), publication
  explicite, comme les textes de la boutique et des e-mails aujourd'hui.
- Faits de journal : document enregistré, publié, version rétablie.
- Le bloc `mail` lit le document **publié** au rendu, par une mémoire versionnée
  (la forme du texte publié d'aujourd'hui, `cached-published-mail-copy.reader.ts`).
- **Permission** : une ressource neuve `mail_templates` (`StaffResource`,
  migration additive) ; **le droit s'accorde à l'écran des rôles**, jamais par
  migration (`lint:no-role-grants-in-migrations`).

### 6. L'éditeur (S5)

**L'entrée** : le menu principal du back-office, **au-dessus de la
Médiathèque**, avec sa propre icône (Hugo, 2026-11-06). La liste des e-mails,
rangés par destinataire (clients, équipe) puis par produit ; l'éditeur d'un
e-mail. L'écran `textes-emails` disparaît, son adresse renvoie à l'éditeur.

**Trois colonnes** (maquette du 2026-11-06) :

| À gauche                                                           | Au milieu                                                                         | À droite                                                                                                                                                                                                           |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| les **variables** du modèle, glissées dans un texte, jamais tapées | l'**aperçu** : blocs déplacés par glisser-déposer, retirés, texte écrit sur place | la **bibliothèque** : mises en page (2, 3 colonnes), blocs, images de la Médiathèque ; **sous elle, les réglages du bloc sélectionné** (lien d'un bouton, ton d'un encadré, texte alternatif, largeur d'une image) |

**Au-dessus de l'aperçu** : le sélecteur de langue FR / EN / IT (un texte
manquant dans une langue se signale sur son bloc), « vue téléphone »,
« clair / sombre » (simulation), et la barre brouillon / publier / historique
/ « M'envoyer un essai ».

**L'aperçu est rendu par le serveur**, avec des données d'exemple du modèle :
c'est le même moteur que l'envoi, donc ce qu'on voit est ce qui part. Il
s'affiche dans un cadre isolé ; chaque bloc y porte un repère
(`data-mail-block`) pour la sélection et le glisser-déposer, jamais dans un
e-mail envoyé (la forme de `markSections` aujourd'hui).

Le glisser-déposer : `cdk/drag-drop`, fold-ng d'abord pour tout le reste
(`apps/lfd-backoffice-frontend/CLAUDE.md`). Clavier : chaque bloc se déplace
aussi par « monter / descendre » (RGAA).

### 7. Les lots

| Lot     | Contenu                                                                                                                                                                                                                         | Ce qui change pour un client    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **S4a** | Le contrat des blocs (paquet dédié, axes de variante, blocs système déclarés par modèle, règles), ses tests ; les déclarations par modèle (variables, axes, blocs système, blocs admis, marque `lfc` / `lfd`). Peut précéder S3 | rien                            |
| **S4b** | Le rendu par blocs dans `@lfd/mailer`, les chartes `lfc` et `lfd` (variante sombre), les colonnes ; le document par défaut de chaque modèle et le test « mêmes textes, même ordre » pour les 32 modèles × 3 langues × leurs cas | rien                            |
| **S4c** | Le stockage (tables du schéma `mail`, versions), la publication, le journal, la permission `mail_templates` ; le bloc `mail` rend un document publié s'il existe                                                                | rien tant que rien n'est publié |
| **S5a** | L'entrée au menu, la liste des e-mails, l'aperçu serveur en lecture seule                                                                                                                                                       | rien                            |
| **S5b** | L'éditeur : glisser-déposer des blocs et des colonnes, texte sur place, variables, réglages du bloc, langues, autosave                                                                                                          | rien tant que rien n'est publié |
| **S5c** | Vue téléphone, clair / sombre, essai, publier, historique et retour arrière ; l'écran `textes-emails` retiré                                                                                                                    | l'équipe publie ses e-mails     |
| **S5d** | Le bloc image : canal `mail/channels/images/` implémenté par `media`, selon la réponse de Hugo à la question 1                                                                                                                  | des images dans les e-mails     |

S3 (déménager gabarits, dictionnaire et sections dans le bloc `mail`) reste
le préalable de S4 (`plan-service-e-mails.md`, § 3).

### 8. Ce qui n'est pas vérifié

- que la coquille puisse produire les mêmes octets depuis un document par
  défaut pour les 32 modèles (des gabarits composent peut-être leur corps
  hors du dictionnaire — à relever modèle par modèle en S4b) ;
- le poids des images jointes de la Médiathèque dans un e-mail ;
- que l'empilement des colonnes par `@media` tienne dans Gmail application.

### 9. Questions pour Hugo (notées pendant son absence)

1. **Images de la Médiathèque** (révisée après `vitruve`) : la médiathèque ne
   sert aucune variante réduite. Trois options : (a) jointes (`cid:`) à leur
   taille d'origine (lourd), (b) jointes après réduction par le bloc `mail`
   (une dépendance de traitement d'image dans l'API), (c) distantes depuis le
   domaine public de la médiathèque (léger, mais bloquées par défaut dans
   certaines messageries). Défaut : le bloc image est reporté à un lot S5d,
   la décision attend Hugo.
2. **Un texte manquant en anglais ou en italien** : défaut choisi, on publie
   quand même et l'e-mail part en français pour cette langue, avec un
   avertissement à l'écran. L'autre option : refuser de publier.
3. **Qui publie** : défaut choisi, le même droit (`mail_templates`) écrit et
   publie. L'autre option : un droit « publier » séparé.
4. **Annuler / rétablir** dans l'éditeur (Ctrl+Z) : prévu en S5b ? Défaut
   choisi : oui, sur la session d'édition.
5. **Les e-mails de l'équipe** (invitation, alerte, dossier du fournil) :
   éditables au même titre que ceux des clients ? Défaut choisi : oui, rangés
   à part dans la liste, avec la charte « La Folie Douce » (`lfd`).
6. **La garantie** passe de « mêmes octets » à « mêmes textes, même ordre » dès
   qu'un e-mail est publié dans l'éditeur (§ 10) : d'accord ?
7. **L'aperçu** : un canevas d'édition au milieu, et un aperçu fidèle (rendu du
   serveur) à la demande — plutôt que l'aperçu fidèle éditable directement,
   impossible avec le glisser-déposer (§ 10) : d'accord ?
8. **Trois colonnes** réservées aux blocs courts (image, bouton, titre) : d'accord ?
9. **Les axes de variante** (§ 10.1) : le sélecteur de cas au-dessus de
   l'aperçu te convient-il pour éditer « payé / à régler / au compte » ?

## 10. Contredit par `vitruve` le 2026-11-06 — ce qui change

3 bloquants, 7 sérieux. Hugo absent : les corrections ci-dessous sont des
choix par défaut, ceux qui touchent à une décision qui lui revient sont
reportés au § 9 (questions 6 à 9).

| Objection                                                                                                                                                                                                                                               | Gravité  | Ce que le plan fait maintenant                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un document statique ne dit pas les **variantes** que le code décide : jusqu'à 5 jeux de textes pour « commande prête » (rappel, reste, retrait / livraison, `mail-templates.ts`), l'intro selon le règlement, des sections présentes selon les données | BLOQUANT | **Les variantes deviennent des axes déclarés par le modèle** (§ 10.1) : un bloc de texte peut « varier selon » un axe (par exemple _règlement_ : payé / à régler / au compte) et porte alors un texte par valeur ; c'est la forme que le dictionnaire a déjà (`title.paid`, S6 du plan des textes). Les blocs dont la donnée manque à l'envoi (bouton sans lien, récapitulatif d'un reste) sont **sautés**, comme aujourd'hui. Aucune condition libre n'est écrite par l'équipe |
| « Mêmes octets » impossible : le corps est aujourd'hui UN paragraphe `pre-line` où les gabarits concatènent des textes ET des données (référence de commande, message du client, constats)                                                              | BLOQUANT | **La garantie « mêmes octets » ne vaut que tant que rien n'est publié** (l'ancien chemin reste intact). Pour un document, la garantie devient « **mêmes textes, même ordre** », vérifiée par un test par modèle et par langue (texte extrait du HTML), plus la planche de spécimens. Les données du corps deviennent des **blocs système** déclarés par le modèle (référence de commande, message du client, constats…)                                                         |
| La médiathèque ne peut pas être jointe depuis `mail` : `mail → media` est interdit, et la médiathèque ne sert **aucune variante réduite** (relu dans `apps/lfd-api/src/media/domain/`, 2026-11-06)                                                      | BLOQUANT | Le bloc `mail` **déclare un canal** `mail/channels/images/` (« donne-moi l'image X ») que `media` implémente — `media → mail : port uniquement` est déjà ouvert par S0. **Le bloc image passe dans un lot à part (S5d)**, après S5c : l'éditeur part sans images, et la question jointe / distante / réduite est posée à Hugo (§ 9, question 1 réécrite)                                                                                                                        |
| Deux sources divergent : une réécriture publiée par `textes-emails` après le calcul d'un brouillon serait masquée en silence                                                                                                                            | SÉRIEUX  | Dès qu'un e-mail a un brouillon ou un document, **`textes-emails` le montre en lecture seule** (« édité dans le nouvel éditeur »). Le périmètre de remplacement de l'envoi (C2, `effective-copy-mailer.ts`) est à relever en S4a : non vérifié                                                                                                                                                                                                                                  |
| Deux marques existent déjà : clients « La Folie Coffee », équipe « La Folie Douce » avec son recours                                                                                                                                                    | SÉRIEUX  | **Deux chartes** : `lfc` (clients) et `lfd` (équipe) ; la marque d'un document vient du modèle, pas d'un choix à l'écran                                                                                                                                                                                                                                                                                                                                                        |
| Première publication irréversible : les tables `mail_copy_*` deviennent à moitié mortes, pas de retour à « comme aujourd'hui »                                                                                                                          | SÉRIEUX  | **« Revenir au modèle d'origine »** : retirer le document publié rend l'e-mail à l'ancien chemin (les tables `mail_copy_*` sont gardées et toujours lues pour un e-mail sans document). Le manifeste et `lint:mail-copy-digest` restent vrais pour l'ancien chemin                                                                                                                                                                                                              |
| `cdk/drag-drop` n'agit pas dans un `iframe` d'aperçu serveur ; un rendu serveur à chaque frappe multiplie les appels                                                                                                                                    | SÉRIEUX  | **Au milieu, un canevas Angular** : les blocs y sont des composants (glisser-déposer, texte sur place), avec une mise en forme proche de la charte ; **un « aperçu fidèle »** rendu par le serveur s'ouvre à la demande (et pour téléphone / sombre / essai), jamais à chaque frappe. Ce qui part est toujours le rendu serveur                                                                                                                                                 |
| Le contrat « `@lfd/contracts` s'il convient » n'était pas décidé                                                                                                                                                                                        | SÉRIEUX  | **Un paquet dédié** (`@lfd/mail-blocks`, nom à confirmer au bâti) importé par l'API et le back-office seulement : rien n'entre dans le baril de `@lfd/contracts`, que la boutique charge                                                                                                                                                                                                                                                                                        |
| Colonnes : Gmail application et Outlook ignorent `<style>` ; 3 × 33 % sur 560 px font des cellules d'environ 165 px                                                                                                                                     | SÉRIEUX  | 3 colonnes admises pour des blocs courts seulement (image, bouton, titre) ; un paragraphe ne va qu'en 2 colonnes. Repli côte à côte accepté, vérifié sur la planche de spécimens                                                                                                                                                                                                                                                                                                |
| Le QR « jamais inversé » n'avait pas de mécanisme                                                                                                                                                                                                       | SÉRIEUX  | Le mécanisme : la zone de silence blanche **intégrée au PNG** (4 modules, ~24 px) et une cellule `bgcolor="#ffffff"` autour ; Gmail et Outlook n'inversent pas, en général, les images. À vérifier en vrai (essai ouvert dans les deux)                                                                                                                                                                                                                                         |
| « Ouvrir » ne doit rien écrire (CQRS)                                                                                                                                                                                                                   | MINEUR   | Le brouillon de départ est **calculé à la lecture** et n'est enregistré qu'à la première modification                                                                                                                                                                                                                                                                                                                                                                           |
| S3 n'est pas un préalable de S4a                                                                                                                                                                                                                        | MINEUR   | S4a (contrat pur) peut précéder S3 ; S4b et S4c le suivent                                                                                                                                                                                                                                                                                                                                                                                                                      |

### 10.1 Les axes de variante

Un modèle déclare ses axes, et leurs valeurs, avec des libellés lisibles :
_règlement_ (payé par carte / à régler / au compte), _acheminement_ (retrait
/ livraison), _rappel_ (premier envoi / rappel)… Un bloc de texte est soit
**fixe**, soit **varie selon un axe** : il porte alors un texte par valeur,
dans chaque langue, et l'éditeur montre un sélecteur de cas au-dessus de
l'aperçu (« voir le cas : à régler, livraison »). L'envoi choisit le texte
selon les données ; l'équipe n'écrit jamais de condition.
