# Le mandat maison — les quatre lots

> **Plan écrit le 2026-09-12.** Il décrit ce qu'il faut bâtir pour qu'un mandat
> SEPA soit frappé, imprimé, signé, déposé et opposable **sans Stripe**, et pour
> que les coordonnées bancaires cessent de circuler en clair.
>
> Chaque affirmation sur l'existant a été **rouverte dans le code le
> 2026-09-12** ; les constats portent leur fichier et leur ligne.

---

## Lot 1 — le cycle de vie du mandat

### L'état des lieux, vérifié

| Constat                                                              | Où                                        |
| -------------------------------------------------------------------- | ----------------------------------------- |
| `accepted_at` est **NOT NULL**                                       | `accounting.prisma:294`                   |
| `stripe_customer_id`, `payment_method_id` sont **NOT NULL**          | `accounting.prisma:277-278`               |
| `save()` n'écrit que 4 colonnes                                      | `prisma-payment-mandate.repository.ts:68` |
| `reference` ne porte **aucune** contrainte d'unicité                 | `\d payment_mandates`                     |
| `creditor_id` **n'existe pas**                                       | idem                                      |
| index partiel existant : `UNIQUE (company_id) WHERE status='active'` | idem                                      |
| `findCurrent` rend l'actif, sinon le plus récent                     | `…repository.ts:29`                       |

Le modèle est **de forme Stripe** : il suppose qu'un tiers a déjà enregistré le
mandat avant que nous en ayons un. Un mandat maison naît à l'inverse — il existe
**avant** d'être signé, et c'est exactement la place qui manque.

### Ce qu'on ajoute

**Un état `draft`.** Le mandat frappé, imprimé, pas encore signé.

🔴 **Il lui faut sa PROPRE migration, seule.** PostgreSQL refuse d'utiliser une
valeur d'enum dans la transaction qui l'ajoute, et Prisma exécute chaque
migration dans une transaction. `ALTER TYPE "MandateStatus" ADD VALUE 'draft'`
et le premier `WHERE status = 'draft'` ne peuvent pas voyager ensemble — c'est
une panne au déploiement, pas à la compilation.

**Trois colonnes desserrées** — `accepted_at`, `stripe_customer_id`,
`payment_method_id` deviennent nullable. Desserrer est additif et réversible ;
c'est resserrer qui demande trois déploiements.

**Une colonne `creditor_id`**, nullable, FK vers `legal_entities`. Nullable et
non backfillée : les mandats de l'ère Stripe n'ont pas d'émetteur connu, et leur
en inventer un serait écrire une donnée qu'on n'a pas.

**Deux index partiels** :

- `UNIQUE (creditor_id, reference) WHERE creditor_id IS NOT NULL` — l'unicité de
  la RUM par créancier, celle que `rum.md` §5 réclame ;
- `UNIQUE (company_id) WHERE status = 'draft'` — un seul brouillon par société,
  ce qui ferme le trou de `findCurrent` **en base** plutôt qu'en application.

### Ce qu'on change dans le domaine

- `PaymentMandate` gagne `mint()` (fabrique un brouillon) et `sign(at, proof)`
  (brouillon → actif, avec la date du papier). `revoke()` accepte `draft`.
- `save()` écrit **toutes** les colonnes mutables. Aujourd'hui il en écrit
  quatre, ce qui rendrait toute frappe invisible en base.
- `findCurrent` trie `active` > `draft` > le plus récent.

---

## Lot 2 — brancher ce qui existe

- **Frapper la RUM à la création du brouillon.** `rum.ts` est écrit et testé, et
  **seul son spec l'importe** (vérifié). `Rum.mint` demande la référence client,
  l'instant (`Clock`) et un tirage (`SecretGenerator`) — les trois ports
  existent.
- **Brancher `pain008.ts`** sur `LegalEntity.creditorBic` et sur
  `CompanyBankAccount`. Il écrit aujourd'hui `IBAN-INCONNU` et `MANDAT-INCONNU`
  en dur (`pain008.ts:136` et `:140`). Le lot **refuse** plutôt que d'écrire un
  jeton faux : un fichier déposé avec un IBAN factice est rejeté par la banque,
  et on ne l'apprend qu'après.

---

## Lot 3 — ce qui circule en clair

| Fuite                                      | Constat                        |
| ------------------------------------------ | ------------------------------ |
| le CSV d'audit imprime l'IBAN du débiteur  | `pain008-audit.ts:51` et `:79` |
| **notre** `creditor_iban` n'est pas scellé | `legal-entity.mapper.ts:84`    |
| le scan du mandat part en clair au bucket  | `mandate.handlers.ts:65`       |

**Le CSV** — masquer en `••••1234`. L'audit sert à vérifier un LOT, pas à
recomposer un RIB ; qui doit lire l'IBAN entier ouvre la fiche.

**Le `creditor_iban`** — c'est une **migration de données**, la seule du plan, et
elle se fait en trois déploiements : ajouter `creditor_iban_sealed`, écrire les
deux et lire le scellé en priorité, puis retirer la colonne claire. La clé vit
dans l'application : le backfill est un script applicatif, pas du SQL.

**Le scan** — `FieldCipher` scelle une **chaîne**, pas des octets. Deux sorties :
lui ajouter `sealBytes`/`openBytes`, ou sceller le base64. La première est
préférable — la seconde gonfle de 33 % un PDF déjà rangé pour dix ans.

---

## Lot 4 — hygiène

- **`typecheck:tests` en une passe.** Il n'existe que `dev:typecheck`, **en
  watch** (vérifié : rien d'équivalent dans l'app ni à la racine). C'est
  pourquoi trois specs ont pourri sans bruit jusqu'au 2026-09-12. À brancher
  dans les portes.
- **Redéposer le logo de `Crazeativity`** — la base annonce une pièce que le
  bucket n'a pas. Geste d'écran, pas de code.

---

## Ce que ce plan ne tranche pas

🔴 **La dixième question à la Caisse d'Épargne reste sans réponse** — quelle
forme de signature elle exige. Ce plan bâtit le parcours **papier** : frappe,
impression, signature, dépôt du scan. Si la banque accepte l'électronique, le
dépôt de scan devient une branche parmi trois, et rien de ce qui précède n'est
perdu — mais l'inverse n'est pas vrai, et c'est pourquoi on bâtit celui-là.

---

# Révision du 2026-09-12 au soir — après contradiction

`vitruve` est passé sur la version ci-dessus. **Cinq objections bloquantes**, dont
trois portaient sur des faits que le plan affirmait sans les avoir ouverts. Ce
qui suit corrige, et ne réécrit pas : la version d'origine reste lisible pour
qu'on voie ce qui a été cru.

## Ce que le plan disait de faux

**① La justification de la migration séparée était fausse.** Le plan écrivait que
« Prisma exécute chaque migration dans une transaction ». Éprouvé contre le
Postgres de dev (17.10) avec le binaire du dépôt (Prisma 7.8) : `ALTER TYPE …
ADD VALUE` suivi d'un `CREATE INDEX … WHERE status='draft'` **dans un seul
fichier** s'applique sans erreur. La consigne de couper reste bonne — c'est
l'habitude du dépôt — mais sa raison était inventée.

🔴 **Le fait réellement opposable, que le plan ne disait nulle part** : les
migrations **ne sont pas atomiques** ici. Une migration qui échoue au milieu
laisse la base à moitié migrée ET une entrée en échec dans `_prisma_migrations`
qui bloque tous les déploiements suivants. Le commentaire de
`.github/workflows/deploy_lfd_api.yml` affirme l'inverse.

**② `draft` casse un contrat déjà servi.** `MandateStatus` vient de
`packages/contracts`, et le back-office fait
`MANDATE_STATUS_LABELS[mandate.status].toLowerCase()`. Une valeur inconnue d'un
bundle déjà chargé rend `undefined.toLowerCase()` — **section paiement morte**,
sur un back-office en service depuis le 2026-08-17.

→ Le libellé part **avant** la valeur : contrat et front d'abord, migration
ensuite. C'est la règle des trois déploiements appliquée à un enum.

**③ `accepted_at` nullable casse `PaymentMandateView.acceptedAt`**, non nullable
et affiché (« signé le … »). Et « réversible » était faux : **la réversibilité
expire à la première frappe**, pas au merge — dès qu'une ligne porte `NULL`, le
`NOT NULL` ne revient plus sans migration de données.

**④ `RevokeMandateHandler` appelle Stripe sans condition**
(`mandate.handlers.ts:39`). Un mandat maison n'a pas de `paymentMethodId` : le
révoquer déclencherait un `detach()` sur du vide. Le plan ne touchait que
l'agrégat.

**⑤ L'index ne fermait pas le trou annoncé, et le tri l'aggravait.** En rotation
bancaire — actif en cours + brouillon frappé — `findCurrent` rend l'actif, donc
`AttachMandateProof` agrafe **le scan du mandat neuf sur l'ancien**. La pièce
produite en contestation ne porte pas la RUM opposée. Et `sign()` heurterait
l'index `WHERE status='active'` existant en **P2002 nu**, remonté en 500, sur le
geste « le client a renvoyé son mandat signé ».

→ `sign()` révoque l'ancien **dans la même transaction**, et le dépôt de scan
vise un mandat **par son identifiant**, jamais « le courant ».

## Les trois décisions, tranchées

**Unicité — par (société, créancier).** L'index devient
`UNIQUE (company_id, COALESCE(creditor_id, 'LEGACY')) WHERE status='active'`.
Le `COALESCE` n'est pas une coquetterie : `NULL` étant distinct de `NULL` dans un
index d'unicité, les mandats de l'ère Stripe — qui n'ont pas d'émetteur connu —
sortiraient sinon de toute garantie, ce qui est exactement l'inverse du but.

**`creditor_iban` — ressaisi par l'écran.** Une seule entité en porte un. Aucun
script, donc **aucune clé de production sur un poste** : c'était la vraie
objection, et elle disparaît au lieu d'être gérée. Paliers : ajouter la colonne
scellée, écrire scellé et lire scellé-d'abord, ressaisir, puis retirer la
colonne claire — le dernier palier seul est irréversible, et il attend.

**Rotation de RIB — la norme, pas une option.** Vérifié à la source (CFONB, FAQ
Prélèvement SEPA, chapitre 4 question 2) :

> Si le titulaire du compte à débiter change […] le mandat d'origine devient
> caduc […] Le nouveau mandat doit alors être identifié par une nouvelle RUM. Si
> le titulaire […] demeure inchangé […] changement de compte dans la même banque
> ou dans une autre banque […] il n'est pas nécessaire de lui faire signer un
> nouveau mandat. Par conséquent, la RUM peut être conservée.

🔴 **Ce n'est donc pas l'IBAN qui décide, c'est le TITULAIRE** — et ce n'est pas
un réglage : en faire une option des règles de mandat laisserait choisir
d'enfreindre la norme. `CompanyBankAccount.holder` existe : le test est
directement écrivable.

Deux obligations que rien ne tient aujourd'hui :

- **l'historique des changements** — « le créancier doit conserver la preuve et
  l'historique des différents changements », or remplacer un RIB écrase
  l'ancien sans trace ;
- **la séquence** — en changement de banque, `OrgnlDbtrAgt = SMNDA` et
  `SeqTp = first`. Le CFONB recommande d'émettre **systématiquement** un `first`,
  le créancier ne pouvant pas savoir si l'IBAN a changé de banque ou seulement
  de numéro.

## Ce qui reste non vérifié, et le restera ici

- L'état de la **production** : combien d'entités portent un `creditor_iban`,
  combien de mandats existent. Tout ce qui précède est raisonné sur le schéma,
  le code, et la base de **développement**.
- Ce que la **Caisse d'Épargne** exige comme forme de signature.
