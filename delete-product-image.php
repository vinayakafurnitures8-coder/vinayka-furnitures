<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(405, ['ok' => false, 'error' => 'POST required.']);
require_admin();
$body = request_json(); $url = $body['imageUrl'] ?? '';
if (!is_string($url) || !preg_match('#^(?:\.\./)?uploads/(products|materials|company)/([a-f0-9]{32}\.(?:jpg|png|webp))$#', $url, $match)) respond(422, ['ok' => false, 'error' => 'Invalid image path.']);
$path = realpath(__DIR__ . '/../uploads/' . $match[1] . '/' . $match[2]); $base = realpath(__DIR__ . '/../uploads/' . $match[1]);
if (!$path || !$base || !str_starts_with($path, $base . DIRECTORY_SEPARATOR)) respond(404, ['ok' => false, 'error' => 'Image not found.']);
if (!unlink($path)) respond(500, ['ok' => false, 'error' => 'Image could not be deleted.']);
respond(200, ['ok' => true]);
