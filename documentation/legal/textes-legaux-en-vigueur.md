# Les textes légaux en vigueur — ce qui est publié, d'où il vient, ce qui a été adapté

> ✅ **État au 2026-10-26.** Publiés en production le 2026-10-26 depuis le
> back-office (Réglages › Légal), dans les trois langues. Ce document dit ce
> que contient chaque texte, de quel document du juriste il vient, et **ce qui
> a été changé** pour qu'il décrive la plateforme réelle. Ce n'est pas un avis
> juridique : la relecture reste celle des juristes.

## 1. Les textes

| Mention                     | Écran                                        | Source                                                    | Articles                    | PDF de référence                      |
| --------------------------- | -------------------------------------------- | --------------------------------------------------------- | --------------------------- | ------------------------------------- |
| Mentions légales            | `/reglages/legal/mentions-legales`           | `3_MENTIONS LEGALES_CRAZEATIVITY_LA FOLIE COFFEE.docx`    | 6                           | —                                     |
| CGV particuliers            | `/reglages/legal/cgv`, onglet Particuliers   | `6_CGV_CRAZEATIVITY_LA_FOLIE_COFFEE.odt`, parties I et II | 20 + annexe de rétractation | `cgv-particuliers-2026-10-27.pdf`     |
| CGV professionnels          | `/reglages/legal/cgv`, onglet Professionnels | même document, parties I et III                           | 19                          | `cgv-professionnels-2026-10-26.pdf`   |
| CGU                         | `/reglages/legal/cgu`                        | `4_CGU_CRAZEATIVITY_LA FOLIE COFFEE.pdf`                  | 11                          | — (le dépôt ne vaut que pour les CGV) |
| Déclaration d'accessibilité | `/reglages/legal/accessibilite`              | pré-audit interne du 2026-10-26                           | 6                           | —                                     |

Les textes s'éditent article par article ; chaque écriture fait monter la
**révision**, et c'est la révision des CGV que la case du panier fait accepter
(voir [`plan-cgv-par-audience.md`](plan-cgv-par-audience.md), C6). Les PDF sont
la version de référence ; le texte en ligne en facilite la lecture.

## 2. Ce qui vaut pour tous

- **Le site est `https://lafoliecoffee.info`** — les documents disaient
  `www.lafoliecoffee.com`.
- **Le siège et l'adresse de réalisation** : Chalet Abate, **603** avenue
  Olympique, 73150 Val d'Isère (Hugo, 2026-10-26 : « 603 partout »).
- **L'hébergeur est Cloudflare, Inc.** (le site et la passerelle y sont
  servis), et non OVH. L'adresse de Cloudflare a été écrite de mémoire
  (101 Townsend Street, San Francisco) : **à vérifier**.
- **Conception et développement : La Folie Coffee** — l'agence citée par le
  document n'a pas réalisé ce site.
- **« Accessible ici »** devient « accessible depuis le pied de page du Site » :
  un article ne porte pas de lien.

## 3. Les mentions légales

L'article 2 renvoie aux CGU pour l'accès au Site, et aux CGV pour les
commandes (repointé le 2026-10-26, à la demande de Hugo, dans les trois
langues).

## 4. Les CGU

Texte du juriste presque mot pour mot, trois écarts décidés par Hugo :

| Article | Le document disait                     | Publié                                                         | Décision                                    |
| ------- | -------------------------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| 2       | cartes, horaires, traiteur, newsletter | gardé tel quel                                                 | Hugo : « garde » (le site vitrine les aura) |
| 3       | compte nécessaire pour commander       | commande avec ou sans compte ; compte requis pour l'espace pro | Hugo : « adapte »                           |
| 4.1     | prix TTC                               | TTC pour les particuliers, HT pour les pros                    | Hugo : « adapte »                           |

## 5. Les CGV — un document, deux publics

Le document du juriste réunissait trois parties : commune, « click & collect »
(particuliers) et « Espace Pro ». Chaque version reprend le préambule, la
partie commune, **sa** partie et les dispositions finales.

**Les chiffres réglables ne sont pas écrits.** Heures limites, délai de
prévenance d'un article, délai d'annulation, zones et frais de livraison sont
des réglages du back-office : les CGV disent « indiqué sur le Site ». Un chiffre
écrit (19 h, 18 h, 5 jours, 20 €) serait devenu faux au premier réglage. Le
délai d'annulation montré au client est **figé à sa commande** (voir
[`../commandes/annulation/annulation-par-le-client.md`](../commandes/annulation/annulation-par-le-client.md)).

### Particuliers — ce qui a été adapté

| Sujet      | Le document                           | Publié                                                                                                                                                                                                      | Pourquoi                                                                     |
| ---------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Compte     | identification ou création de compte  | avec ou sans compte                                                                                                                                                                                         | la commande invitée existe (`POST /shop/orders`)                             |
| Livraison  | click & collect seul                  | retrait, ou livraison quand le Site la propose                                                                                                                                                              | réglage de livraison par clientèle                                           |
| Paiement   | carte Stripe                          | carte Stripe à la commande, rien d'encaissé au retrait                                                                                                                                                      | rien ne s'encaisse au comptoir par notre système                             |
| Facture    | adressée par e-mail ou dans le compte | récapitulatif par e-mail, facture sur demande                                                                                                                                                               | le système n'émet pas de facture au public                                   |
| Retrait    | e-mail ou numéro de commande          | QR code ou numéro de commande                                                                                                                                                                               | l'écran de retrait                                                           |
| Annulation | quotidien jamais, spéciales à 5 jours | sans frais jusqu'au délai indiqué, depuis le compte ou le lien du mail, remboursement sur la carte                                                                                                          | le système ne distingue pas les commandes « spéciales »                      |
| Médiateur  | `[Nom du médiateur…]`                 | **AME Conso** (Association des Médiateurs Européens), 197 boulevard Saint-Germain, 75007 Paris, `www.mediationconso-ame.com` ; saisine dans l'année qui suit la réclamation écrite — dans les trois langues | **obligatoire** pour vendre aux particuliers — choisi par Hugo le 2026-10-27 |

### Professionnels — ce qui a été adapté

| Sujet                     | Le document                                             | Publié                                                                                                                                                                               | Pourquoi                                            |
| ------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Paiement                  | relevé hebdomadaire, virement ou prélèvement à 30 jours | carte à la commande (facture acquittée par commande) **ou** au compte : facture périodique (mensuelle ou au rythme convenu), prélèvement SEPA sous mandat à l'échéance de la facture | les deux régimes et les trois rythmes du système    |
| Commandes récurrentes     | reconduites automatiquement                             | **retiré**                                                                                                                                                                           | la table d'abonnements ne déclenche aucune commande |
| Minimum de commande       | 50 € HT, sinon 20 € de frais                            | **retiré** ; frais selon la zone                                                                                                                                                     | aucun minimum dans le système                       |
| Commandes exceptionnelles | acompte de 100 %                                        | **retiré**                                                                                                                                                                           | le système ne prend pas d'acompte                   |
| Annulation                | 72 h la veille                                          | tant que la production du jour n'est pas arrêtée                                                                                                                                     | la règle du système                                 |
| Réception                 | réserve sur le bon de livraison                         | signalée au livreur, confirmée par e-mail ; preuve par signature ou photo ; avoir                                                                                                    | preuve de livraison, avoirs (381)                   |

Gardés du juriste : pénalités de retard (BCE + 10 points), indemnité de 40 €,
réserve de propriété, plafond de responsabilité, Tribunal de commerce de
Chambéry, préavis de clôture de 15 jours.

## 6. La déclaration d'accessibilité

Publiée le 2026-10-26 avec le statut **« non conforme »** : aucun audit
complet n'existe, et un taux ne s'affiche qu'après un audit humain (décision de
Hugo, 2026-10-26). Elle liste les non-conformités du pré-audit, le contact
(contact@lafoliecoffee.com) et les voies de recours vers le Défenseur des
droits. **À mettre à jour à chaque lot de correction**, et à régénérer depuis
le fichier de données une fois l'audit fait.

## 7. La politique cookies

Réécrite le 2026-10-26 depuis `5_POLITIQUE COOKIES_CRAZEATIVITY_LA FOLIE COFFEE.odt` :
le document annonçait un bandeau et un module « Paramétrer les cookies » qui
n'existent pas, et une liste nominative « à compléter ». La version publiée dit
ce qui est vrai aujourd'hui (seulement des traceurs strictement nécessaires,
aucun bandeau), garde toutes les catégories et la règle du consentement pour
le jour où on en ajoutera, et donne la liste réelle des traceurs, tenue dans
[`registre-des-traceurs.md`](registre-des-traceurs.md).

## 8. Ce qui reste à faire

- ~~**Le médiateur de la consommation** (CGV particuliers, article 17)~~ — AME Conso, publié le 2026-10-27 dans les trois langues, PDF de référence redéposé (`cgv-particuliers-2026-10-27.pdf`).
- **Vérifier l'adresse de Cloudflare** (mentions légales, article 1).
- **Relecture juridique** des adaptations des tableaux ci-dessus.
- Toute modification d'une CGV fait monter sa révision : les clients qui ont
  le panier ouvert devront recocher (409 `orders.sales_terms_outdated`).
