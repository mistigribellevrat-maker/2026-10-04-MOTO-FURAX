<?php
/* ============================================================================
   MOTO FURAX — réglages du serveur de records et de fantômes
   ============================================================================ */

// Code famille : laisse VIDE pour un jeu ouvert à tous ; sinon, seuls ceux qui connaissent le code
// peuvent enregistrer un record en ligne (le jeu le demande une seule fois, puis s'en souvient).
define('MF_FAMILY_CODE', getenv('MF_FAMILY_CODE') !== false ? getenv('MF_FAMILY_CODE') : '');

// Dossier de stockage (créé automatiquement, protégé par un .htaccess). Doit être accessible en écriture.
define('MF_DATA_DIR', getenv('MF_DATA_DIR') ? getenv('MF_DATA_DIR') : __DIR__ . '/data');

// Les fantômes et records du « défi du jour » sont supprimés après ce nombre de jours.
define('MF_KEEP_DAILY_DAYS', 4);

// Distance de la course en mètres : doit rester égale à CFG.TOTAL_DIST dans js/00-utils.js
// (sert à refuser les fantômes qui n'atteignent pas le collège).
define('MF_TOTAL_DIST', 2000);
