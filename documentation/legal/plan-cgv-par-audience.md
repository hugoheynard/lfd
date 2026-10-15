# Plan — des CGV par audience, leur PDF de référence, et la version acceptée à la commande

> 📐 **Doc-first, rien n'est bâti** (rédigé le 2026-10-15). Se bâtit **après**
> le déplacement des mentions dans Réglages › Légal (`/reglages/legal/…`), qui
> touche le même écran.

## 0. La demande (Hugo, 2026-10-15)

> « Est-ce que tu peux faire en sorte qu'on puisse mettre des CGV par
> audience ? » — puis : un pro sans CGV pro voit « en cours de rédaction »
> (b) ; on enregistre la version acceptée à la commande ; « je veux aussi
> qu'on puisse télécharger un PDF qui est le document CGV produit par nos
> juristes, notre système par paragraphe est pour faciliter la lecture en
> ligne ».

## 1. Ce qui existe (ouvert le 2026-10-15)

- Les cinq mentions vivent dans `public.platform_content` (`key`, `content`
  JSON, `revision`), clé `sales-terms` pour les CGV
  (`b2b/content/infrastructure/prisma-platform-content.repository.ts:38-44`).
  Elles s'éditent **par paragraphe** (`add/edit/move/remove-legal-document-paragraph`,
  `b2b/content/application/`), chaque écriture fait monter `revision`.
- La boutique sert **un seul** texte à tout le monde
  (`lfc-ecommerce-frontend/src/app/client/client-legal-documents.service.ts`).
- **Aucune commande n'enregistre la version des CGV** en vigueur à la
  passation (`orders.prisma` : rien ; vérifié par grep).
- Un dépôt de PDF existe déjà ailleurs : `platform/shared/documents/scanned-document.ts`
  (contrôle par signature d'octets `%PDF-`, 10 Mo), pièces en R2
  ([`commandes/architecture-pieces-en-r2.md`](../commandes/architecture-pieces-en-r2.md)).

## 2. Décisions

### C1 — Deux textes de CGV

- `sales-terms` reste le texte **particuliers** — aucune réécriture.
- `sales-terms-pro`, **nouveau**, le texte **professionnels**, même mécanique
  de paragraphes et de révisions.
- Les quatre autres mentions restent **uniques** : elles valent pour tous.

### C2 — Qui lit quoi

- Un client connecté d'une société (principal pro) lit `sales-terms-pro` ;
  un particulier ou un visiteur lit `sales-terms`. Le choix se fait **au
  serveur**, d'après le principal résolu en base — jamais d'après un
  paramètre que le navigateur enverrait.
- **CGV pro pas encore rédigées** (Hugo : b) : la page dit « Conditions
  générales de vente professionnelles en cours de rédaction » ; on ne sert
  **jamais** les CGV particuliers à un pro, qui y lirait un droit de
  rétractation qu'il n'a pas.

### C3 — Le PDF de référence, par audience

Le PDF est **le document juridique** ; les paragraphes en sont la lecture en
ligne.

- **Dépôt** depuis le back-office, par audience : PDF seulement, contrôlé par
  ses octets (`scanned-document.ts`, `%PDF-`), 10 Mo au plus.
- **Jamais écrasé** : chaque dépôt est un objet R2 neuf et une ligne de
  `public.legal_document_files` (id, `document_key`, clé de stockage, SHA-256,
  taille, déposé le / par, `superseded_at`). Le dépôt suivant pose
  `superseded_at` sur le précédent. On peut toujours retrouver le PDF qu'un
  client a accepté.
- **Téléchargement** dans la boutique : « Télécharger les CGV (PDF) » en tête
  de la page, servi par l'API (le PDF en vigueur pour l'audience du
  lecteur), nom de fichier daté.
- **Sur la page**, une ligne le dit : « La version de référence est le
  document PDF ; ce texte en facilite la lecture. »
- **Cohérence** : le texte en ligne et le PDF peuvent diverger — l'écran du
  back-office montre côte à côte la date de la dernière révision du texte et
  celle du PDF en vigueur, et signale quand le texte est plus récent que le
  PDF.

### C4 — La version acceptée à la commande (Hugo : oui)

- `orders` gagne `sales_terms_key` (`sales-terms` | `sales-terms-pro`),
  `sales_terms_revision` (int) et `sales_terms_file_id` (le PDF en vigueur,
  nullable s'il n'y en a pas), tous nullables — les commandes passées avant
  restent sans version, on n'en invente pas.
- Posés **à la passation**, dans la transaction de la commande, d'après
  l'audience de la commande (société ⇒ pro). Une commande pro alors que les
  CGV pro n'existent pas : `sales_terms_key = sales-terms-pro`, révision et
  fichier `NULL` — le fait est enregistré tel quel.
- Lus par le détail d'une commande au back-office : « CGV acceptées :
  professionnelles, révision 4, PDF du 12/10/2026 » avec le lien vers ce PDF-là.

### C5 — L'écran

Dans Réglages › Légal › **CGV** (une entrée de menu) : deux onglets,
**Particuliers** et **Professionnels**. Chacun : l'éditeur de paragraphes
actuel, et une zone « Document PDF de référence » (déposer, remplacer,
historique des dépôts, télécharger). Mêmes droits que l'écran des mentions
aujourd'hui ; le dépôt est une écriture.

## 3. Lots

| Lot | Contenu                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `sales-terms-pro` (clé, semis vide), lecture par audience au serveur, page « en cours de rédaction » ; onglets au back-office    |
| 2   | `legal_document_files` + dépôt R2 + téléchargement boutique et back-office, ligne « version de référence », alerte de divergence |
| 3   | Version acceptée sur la commande (migration additive), affichage au détail de commande                                           |

Migrations : toutes additives (`legal_document_files`, trois colonnes
nullables sur `orders`). Aucune donnée réécrite.

## 4. Risques

- **Un pro à qui l'on sert les CGV particuliers** : exclu par C2, prouvé par
  un e2e (principal pro, CGV pro absentes ⇒ « en cours de rédaction »).
- **Un PDF écrasé** : impossible par construction (objet neuf, ligne neuve).
- **Texte et PDF divergents** : signalé à l'écran, pas empêché — c'est aux
  juristes de produire le PDF.
