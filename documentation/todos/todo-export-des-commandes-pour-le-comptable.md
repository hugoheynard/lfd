# TODO — l'export des commandes pour le comptable

**Ouvert le 2026-09-10**, en livrant le brouillon de `pain.008`.

## Le fait

Nous n'émettons pas de factures : **le comptable importe nos commandes dans son
logiciel et sort la facture mensuelle** (décision du 2026-09-10, §0 quater de
[`../comptabilite/architecture-prelevement-sepa-direct.md`](../comptabilite/architecture-prelevement-sepa-direct.md)).

Cet import est donc **son entrée**, et elle n'existe pas. Nous savons calculer le
montant à prélever, nous savons produire le fichier de la banque, et nous ne
savons pas donner au comptable ce à partir de quoi il facture.

C'est le seul maillon manquant entre notre commande et la facture du client.

## 🔴 La question qui bloque, et qui n'est pas technique

**Quel format le logiciel du comptable sait-il importer ?**

Personne ne le sait, et elle décide de tout : un CSV et un modèle d'import ne
demandent pas le même travail qu'un fichier structuré à son schéma. L'écrire
avant de la poser, c'est écrire deux fois.

Elle se pose **avec** les huit questions à la Caisse d'Épargne
([`../comptabilite/format-pain-008.md`](../comptabilite/format-pain-008.md)) —
même entretien, même semaine.

## Ce qu'on sait déjà, et qui ne bougera pas

L'assiette est **tranchée et codée**. Le port
`BillableOrdersReader.billableBetween(from, to)` rend déjà les sociétés à
prélever sur un cycle, et son adaptateur porte les quatre critères à un seul
endroit du dépôt.

⚠️ Mais il **agrège par société** — c'est ce dont le prélèvement a besoin. Le
comptable, lui, facture des **lignes** : il lui faut les commandes une par une.
C'est le même critère appliqué au même intervalle, rendu à une autre maille, et
c'est la seule chose à ajouter au port.

## 🔴 Ce qu'il NE faut pas faire : laisser resommer la TVA

Le CSV doit porter `total_cents`, `vat_cents` et **`vat_shares`** — la
ventilation par taux, figée sur la commande — jamais des lignes que le comptable
resommerait.

L'arrondi de la TVA est fait **une fois**, dans `ventilateVat` (`@lfd/money`) —
le schéma le dit : « la définition vit dans `ventilateVat`, et nulle part
ailleurs ». Il proratise les extras (livraison, surtaxe de retard) entre les taux.
Un logiciel qui recalculerait depuis les lignes n'obtiendrait **pas** nos
chiffres, et l'écart entre le montant prélevé et la facture émise serait garanti
dès le premier mois — c'est-à-dire exactement le problème que le §0 quater
laisse ouvert en disant « à trancher avant T9 ».

Le montant est le **TTC** (`total_cents`), qui inclut `delivery_fee_cents` et
`late_fee_cents` : le CSV doit les détailler, sinon la somme prélevée ne se
recompose pas depuis les commandes que le client connaît.

## Les conventions du dépôt, déjà établies

Deux exports CSV tournent (`catalog-csv.ts`, `customers-csv.ts`) et fixent la
forme : séparateur `;` (Excel FR lit la virgule comme une décimale), **BOM UTF-8** (sans quoi le tableur lit l'UTF-8 en Latin-1), fins de ligne CRLF,
décimales à la virgule et **sans symbole monétaire** pour que le tableur somme,
et tout ce qui ressemble à un nombre long entre guillemets — un SIRET nu devient
`8,12457E+13`.

⚠️ Le BOM s'écrit **`\uFEFF` en séquence d'échappement**, jamais en caractère : rien ne
l'attrape, ni le typecheck ni ESLint, et un outil de normalisation le mange sans
qu'un diff le montre. Constaté deux fois, dont le 2026-09-10.

## Ce qui reste ouvert au-delà du format

- **Le mandat de facturation.** C'est LFC qui vend, donc LFC qui doit émettre.
  Qu'un tiers le fasse en son nom est permis et se contractualise — à obtenir par
  écrit avant le premier cycle, et ce n'est pas un sujet de code.
- **L'écart possible** entre le montant prélevé et la facture du comptable. Les
  deux sortent de la même assiette ; l'écart ne peut donc venir que d'un décalage
  de date. À trancher avant la tranche 9.
