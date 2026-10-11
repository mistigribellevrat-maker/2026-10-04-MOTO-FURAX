<?php
/* ============================================================================
   MOTO FURAX — serveur de records et de fantômes
   Hébergement mutualisé (OVH...), PHP 7.4+, aucune base de données : fichiers JSON dans api/data/.

   GET  ghosts.php?a=ping                                  -> { ok, writable, protected }
   GET  ghosts.php?a=records&mode=college                  -> records du niveau, par « pilote|aide »
   GET  ghosts.php?a=ghost&mode=college&pilot=oscar&aid=0  -> fantôme (échantillons x,y,z à 10 Hz)
   POST ghosts.php?a=submit  { mode, pilot, aid, time, score, bike, ghost:{ t, d } }
                                                           -> enregistre si c'est mieux que l'existant

   Le serveur ne fait confiance à rien : noms validés, tailles limitées, fantôme vérifié (bornes de la
   route, vitesse plausible, durée cohérente, arrivée au collège).
   ============================================================================ */
require __DIR__ . '/config.php';
@ini_set('display_errors', '0');
error_reporting(0);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function out($code, $arr) {
  http_response_code($code);
  echo json_encode($arr, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}
function ok_mode($s)  { return is_string($s) && preg_match('/^[a-z][a-z0-9-]{1,23}$/', $s) === 1; }
function ok_pilot($s) { return is_string($s) && preg_match('/^[a-z][a-z0-9_]{1,15}$/', $s) === 1; }

function ensure_dir() {
  $d = MF_DATA_DIR;
  if (!is_dir($d)) @mkdir($d, 0755, true);
  if (!is_dir($d) || !is_writable($d)) return false;
  if (!is_file($d . '/.htaccess')) @file_put_contents($d . '/.htaccess', "Options -Indexes\n<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
  if (!is_file($d . '/index.html')) @file_put_contents($d . '/index.html', '<!doctype html><title></title>');
  return true;
}
function rec_file($mode) { return MF_DATA_DIR . '/records_' . $mode . '.json'; }
function ghost_file($mode, $pilot, $aid) { return MF_DATA_DIR . '/ghost_' . $mode . '_' . $pilot . '_' . $aid . '.json'; }
function read_json($f) {
  if (!is_file($f)) return null;
  $s = @file_get_contents($f);
  if ($s === false) return null;
  $j = json_decode($s, true);
  return is_array($j) ? $j : null;
}
function write_json($f, $data) {
  $tmp = $f . '.tmp' . getmypid();
  if (@file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) === false) return false;
  if (!@rename($tmp, $f)) { @unlink($tmp); return false; }
  return true;
}
// une seule ecriture a la fois (deux enfants qui finissent une course en meme temps)
function with_lock($fn) {
  $fh = @fopen(MF_DATA_DIR . '/.lock', 'c');
  if (!$fh) return $fn();
  flock($fh, LOCK_EX);
  try { return $fn(); } finally { flock($fh, LOCK_UN); fclose($fh); }
}
function family_code_ok() {
  if (MF_FAMILY_CODE === '') return true;
  $c = isset($_SERVER['HTTP_X_FAMILY_CODE']) ? $_SERVER['HTTP_X_FAMILY_CODE'] : '';
  return is_string($c) && hash_equals((string)MF_FAMILY_CODE, $c);
}
// verifie un fantome : retourne [true, donnees arrondies] ou [false, raison]
function check_ghost($g, $time) {
  if (!is_array($g) || !isset($g['d']) || !is_array($g['d'])) return [false, 'ghost'];
  $d = array_values($g['d']);
  $n = count($d);
  if ($n < 30 || $n > 12600 || $n % 3 !== 0) return [false, 'ghost-taille'];
  if (abs((($n / 3) - 1) / 10 - $time) > 2.5) return [false, 'ghost-duree'];
  $out = [];
  $pz = null;
  for ($i = 0; $i < $n; $i += 3) {
    if (!is_numeric($d[$i]) || !is_numeric($d[$i + 1]) || !is_numeric($d[$i + 2])) return [false, 'ghost-nombre'];
    $x = (float)$d[$i]; $y = (float)$d[$i + 1]; $z = (float)$d[$i + 2];
    if (abs($x) > 14 || $y < -1 || $y > 16 || $z > 8) return [false, 'ghost-bornes'];
    if ($pz !== null) {
      $dz = $pz - $z;                       // > 0 : il avance (nitro : 62 m/s = 6,2 m par echantillon)
      if ($dz > 7.5 || $dz < -5) return [false, 'ghost-vitesse'];
    }
    $pz = $z;
    $out[] = round($x, 2); $out[] = round($y, 2); $out[] = round($z, 1);
  }
  if ($pz > -(MF_TOTAL_DIST - 15)) return [false, 'ghost-arrivee'];
  return [true, $out];
}
function throttle() {            // un envoi toutes les 1,5 s par adresse (anti-boucle)
  $f = MF_DATA_DIR . '/rate.json';
  $r = read_json($f);
  if (!is_array($r)) $r = [];
  $now = microtime(true);
  foreach ($r as $k => $t) { if ($now - $t > 60) unset($r[$k]); }
  $ip = md5(isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '');
  $blocked = isset($r[$ip]) && $now - $r[$ip] < 1.5;
  if (!$blocked) $r[$ip] = $now;
  write_json($f, $r);
  return !$blocked;
}
function cleanup_daily() {
  $limit = gmdate('Ymd', time() - MF_KEEP_DAILY_DAYS * 86400);
  foreach ((array)glob(MF_DATA_DIR . '/*daily-*') as $f) {
    if (preg_match('/daily-(\d{8})/', basename($f), $m) && $m[1] < $limit) @unlink($f);
  }
}
function clean_records($r) {
  $o = [];
  if (!is_array($r)) return $o;
  foreach ($r as $k => $v) {
    if (!is_array($v)) continue;
    $o[$k] = [
      'time' => isset($v['time']) ? $v['time'] : null,
      'score' => isset($v['score']) ? (int)$v['score'] : 0,
      'bike' => isset($v['bike']) ? (int)$v['bike'] : 0,
      'ghost' => !empty($v['ghost'])
    ];
  }
  return $o;
}

$a = isset($_GET['a']) ? $_GET['a'] : '';

if ($a === 'ping') {
  out(200, ['ok' => true, 'v' => 1, 'writable' => ensure_dir(), 'protected' => MF_FAMILY_CODE !== '']);
}

if ($a === 'records') {
  $mode = isset($_GET['mode']) ? $_GET['mode'] : '';
  if (!ok_mode($mode)) out(400, ['ok' => false, 'error' => 'mode']);
  ensure_dir();
  out(200, ['ok' => true, 'mode' => $mode, 'records' => (object)clean_records(read_json(rec_file($mode)))]);
}

if ($a === 'ghost') {
  $mode = isset($_GET['mode']) ? $_GET['mode'] : '';
  $pilot = isset($_GET['pilot']) ? $_GET['pilot'] : '';
  $aid = isset($_GET['aid']) ? $_GET['aid'] : '';
  if (!ok_mode($mode) || !ok_pilot($pilot) || !in_array((string)$aid, ['0', '1', '2'], true)) out(400, ['ok' => false, 'error' => 'cle']);
  $g = read_json(ghost_file($mode, $pilot, (int)$aid));
  if (!$g || !isset($g['d'])) out(404, ['ok' => false, 'error' => 'absent']);
  out(200, ['ok' => true, 't' => $g['t'], 'bike' => isset($g['bike']) ? (int)$g['bike'] : 0, 'd' => $g['d']]);
}

if ($a === 'submit') {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(405, ['ok' => false, 'error' => 'methode']);
  if (!family_code_ok()) out(401, ['ok' => false, 'error' => 'code']);
  if (!ensure_dir()) out(500, ['ok' => false, 'error' => 'stockage']);
  $raw = file_get_contents('php://input', false, null, 0, 262144);
  $in = json_decode($raw, true);
  if (!is_array($in)) out(400, ['ok' => false, 'error' => 'json']);
  $mode = isset($in['mode']) ? $in['mode'] : '';
  $pilot = isset($in['pilot']) ? $in['pilot'] : '';
  $aid = isset($in['aid']) ? $in['aid'] : -1;
  if (!ok_mode($mode) || !ok_pilot($pilot) || !is_numeric($aid) || (int)$aid < 0 || (int)$aid > 2) out(400, ['ok' => false, 'error' => 'cle']);
  $aid = (int)$aid;
  $score = isset($in['score']) && is_numeric($in['score']) ? (int)$in['score'] : 0;
  if ($score < 0 || $score > 5000000) out(400, ['ok' => false, 'error' => 'score']);
  $bike = isset($in['bike']) && is_numeric($in['bike']) ? (int)$in['bike'] : 0;
  if ($bike < 0 || $bike > 30) $bike = 0;
  $time = null;
  if (isset($in['time']) && $in['time'] !== null) {
    if (!is_numeric($in['time'])) out(400, ['ok' => false, 'error' => 'temps']);
    $time = round((float)$in['time'], 2);
    if ($time < 25 || $time > 400) out(422, ['ok' => false, 'error' => 'temps']);   // 2000 m a 62 m/s = 32 s mini
  }
  $ghost = null;
  if ($time !== null && isset($in['ghost']) && is_array($in['ghost'])) {
    $chk = check_ghost($in['ghost'], $time);
    if (!$chk[0]) out(422, ['ok' => false, 'error' => $chk[1]]);
    $ghost = $chk[1];
  }
  if (!throttle()) out(429, ['ok' => false, 'error' => 'trop-vite']);

  $stored = ['time' => false, 'score' => false];
  $records = with_lock(function () use ($mode, $pilot, $aid, $score, $bike, $time, $ghost, &$stored) {
    $rf = rec_file($mode);
    $recs = read_json($rf);
    if (!is_array($recs)) $recs = [];
    $key = $pilot . '|' . $aid;
    $cur = isset($recs[$key]) && is_array($recs[$key]) ? $recs[$key] : ['time' => null, 'score' => 0, 'bike' => 0, 'ghost' => false];
    if ($score > (int)(isset($cur['score']) ? $cur['score'] : 0)) { $cur['score'] = $score; $stored['score'] = true; }
    if ($time !== null && (!isset($cur['time']) || $cur['time'] === null || $time < (float)$cur['time'] - 0.0005)) {
      $cur['time'] = $time; $cur['bike'] = $bike; $cur['ghost'] = $ghost !== null; $cur['date'] = gmdate('Y-m-d');
      $stored['time'] = true;
      if ($ghost !== null) write_json(ghost_file($mode, $pilot, $aid), ['t' => $time, 'bike' => $bike, 'd' => $ghost]);
      else @unlink(ghost_file($mode, $pilot, $aid));          // l'ancien fantome ne correspond plus
    }
    if ($stored['time'] || $stored['score']) { $recs[$key] = $cur; write_json($rf, $recs); }
    if (strpos($mode, 'daily-') === 0) cleanup_daily();
    return $recs;
  });
  out(200, ['ok' => true, 'stored' => $stored, 'records' => (object)clean_records($records)]);
}

out(400, ['ok' => false, 'error' => 'action']);
