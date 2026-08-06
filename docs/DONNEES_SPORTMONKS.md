# Ce dont on dispose réellement via SportMonks

Ce document liste uniquement ce qui a été **confirmé par de vrais appels API** sur le match Arsenal–Manchester City (sauf mention contraire). Rien ici n'est deviné : soit on l'a vu dans une vraie réponse, soit c'est noté comme "documenté mais pas encore vérifié".

Abonnement actuel : **Starter** + add-ons **Match Facts** et **Pressure Index & xG**. Couvre 5 compétitions : Premier League, Bundesliga, Ligue 1, Serie A, LaLiga.

---

## 1. Compétition / Ligue

Confirmé (`/leagues`) :
- Nom, pays (nom + code + drapeau), type, logo de la compétition, identifiant

## 2. Club / Équipe

Confirmé (dans les fixtures) :
- Nom, code court (3 lettres), **logo** (`image_path`), fondation, identifiant
- Position au classement au moment du match (`meta.position`)
- Qui est domicile/extérieur, qui a gagné (`meta.winner`)

## 3. Joueur

Confirmé (dans les compositions) :
- Nom complet, nom affiché, prénom, nom de famille
- **Photo** (`image_path`)
- Date de naissance, taille, poids, poste
- **Pays / nationalité** (nom + drapeau) — récupéré désormais
- Numéro de maillot

## 4. Entraîneur

Confirmé :
- Nom complet, nom affiché, **photo**, pays/nationalité, date de naissance

## 5. Informations générales du match

Confirmé :
- Date et heure, stade (nom, ville, capacité, photo du stade), **journée** (numéro de round), statut (terminé/en cours/à venir)
- Score final + score par mi-temps

**Non confirmé pour l'instant** : nombre de spectateurs réels (`attendance`). Le stade a une *capacité* (60 704 pour l'Emirates), mais ce n'est pas l'affluence réelle du match. Il existe peut-être un champ dédié — à vérifier avec un nouvel appel si tu veux vraiment cette donnée.

## 6. Compositions

Confirmé :
- Les 11 titulaires + tous les remplaçants (utilisés et non), par équipe
- Position sur le terrain (schéma ligne/colonne), numéro de maillot
- **Capitaine** identifié explicitely
- Note du joueur, minutes jouées

## 7. Événements du match

Confirmé, avec minute précise :
- Buts (avec tireur, passeur, description type de tir)
- Cartons jaunes et rouges (avec motif)
- Remplacements (qui sort, qui entre)
- Score cumulé après chaque but

## 8. Statistiques d'équipe (match complet)

Liste **complète et confirmée** pour ce match (tu choisis lesquelles garder) :

| Catégorie API | Nom |
|---|---|
| offensive | Tirs totaux, tirs cadrés, tirs non cadrés, tirs dans la surface, tirs hors surface, tirs contrés, corners, hors-jeu, buts, dégagements du gardien, tentatives de but, coups de tête gagnés, passes décisives, grosses occasions créées, grosses occasions manquées, dribbles tentés, dribbles réussis (+ %), centres tentés, centres réussis, contre-attaques, passes longues réussies (+ %) |
| défensive | Fautes, arrêts, coups francs, tacles, duels gagnés |
| ensemble | Possession %, ballons sécurisés, passes, passes réussies (+ %), cartons jaunes, remplacements, touches (rentrées), passes longues, interceptions, passes clés |

Plus, séparément : **xG** (par équipe et par période — 1re/2e mi-temps disponibles aussi).

## 9. Statistiques individuelles par joueur

Confirmé, disponibles pour chaque joueur qui a joué (même liste de codes que les stats d'équipe, au niveau individuel) :

- Touches de balle, passes, passes clés, ballons longs tentés/réussis, ballons perdus
- Buts, passes décisives, xG individuel, tirs (total/cadrés/non cadrés/contrés)
- Occasions créées/manquées, dribbles réussis, centres réussis
- Duels gagnés, tacles, interceptions, fautes, cartons jaunes, arrêts (gardien)
- Note du match, minutes jouées

## 10. xG (Expected Goals)

Confirmé : xG total par équipe, par mi-temps, plus quelques variantes (xG post-tir notamment) dont je n'ai pas encore la définition certaine — je ne les affiche pas tant que ce n'est pas confirmé.

## 11. Pression / Momentum

**Documenté officiellement, pas encore vérifié sur ce match précis** : valeurs de pression horodatées par équipe (calculées à partir de possession, attaques dangereuses, tirs, tacles). C'est exactement la donnée qu'il faut pour un vrai graphique momentum. Le prochain appel au robot va nous dire si ça fonctionne comme documenté.

## 12. Ce qu'on n'a probablement PAS avec ce plan

Non inclus dans Starter + Match Facts + Pressure/xG (nécessiteraient un plan supérieur ou un add-on spécifique, à vérifier si besoin un jour) :
- Cartes de chaleur (heatmaps) — nécessite un fournisseur de tracking type Opta/StatsBomb
- Coordonnées de balle en direct (`ballCoordinates`) — existe dans la doc SportMonks mais probablement un add-on séparé
- Cotes et prédictions (Premium Odds Feed) — add-on séparé, non pertinent pour l'éditorial de toute façon
- Historique face-à-face enrichi, tendances de forme — non vérifié

---

*Prochaine étape suggérée : tu me dis, dans les sections 8 et 9 notamment, ce que tu gardes — je nettoierai l'affichage en fonction.*
