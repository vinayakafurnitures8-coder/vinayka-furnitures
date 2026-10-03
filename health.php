<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, max-age=0');

$gd = extension_loaded('gd') && function_exists('imagecreatetruecolor');
$curl = function_exists('curl_init');
$finfo = class_exists('finfo');
$urlFopen = (bool)ini_get('allow_url_fopen');

$ok = $finfo && ($curl || $urlFopen);

http_response_code($ok ? 200 : 503);

echo json_encode([
    'ok' => $ok,
    'php' => PHP_VERSION,
    'gd' => $gd,
    'curl' => $curl,
    'fileinfo' => $finfo,
    'url_fopen' => $urlFopen,
    'webp' => function_exists('imagecreatefromwebp') && function_exists('imagewebp')
], JSON_UNESCAPED_SLASHES);
