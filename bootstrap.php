<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, max-age=0');

ini_set('display_errors', '0');
ini_set('log_errors', '1');

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode(
        ['ok' => $status >= 200 && $status < 300] + $payload,
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    );
    exit;
}

set_exception_handler(static function (Throwable $e): void {
    error_log('KR Hanuman API: ' . $e->getMessage());
    respond(500, [
        'error' => 'Internal server error.'
    ]);
});

function request_json(): array
{
    static $cache = null;

    if ($cache !== null) {
        return $cache;
    }

    $raw = file_get_contents('php://input');

    if (!$raw) {
        $cache = [];
        return $cache;
    }

    $json = json_decode($raw, true);

    $cache = is_array($json) ? $json : [];

    return $cache;
}

function firebase_config(): array
{
    $configFile = __DIR__ . '/../js/firebase-config.js';

    if (!is_file($configFile)) {
        respond(500, [
            'error' => 'firebase-config.js not found.'
        ]);
    }

    $source = file_get_contents($configFile);

    preg_match('/apiKey\s*:\s*[\"\']([^\"\']+)/', $source, $apiKey);
    preg_match('/databaseURL\s*:\s*[\"\']([^\"\']+)/', $source, $database);

    if (empty($apiKey[1]) || empty($database[1])) {
        respond(500, [
            'error' => 'Firebase configuration is invalid.'
        ]);
    }

    return [
        'apiKey' => $apiKey[1],
        'databaseURL' => rtrim($database[1], '/')
    ];
}

function authorization_header(): string
{
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strcasecmp($name, 'Authorization') === 0) {
                return trim((string)$value);
            }
        }
    }

    if (function_exists('apache_request_headers')) {
        foreach (apache_request_headers() as $name => $value) {
            if (strcasecmp($name, 'Authorization') === 0) {
                return trim((string)$value);
            }
        }
    }

    foreach ([
        'HTTP_AUTHORIZATION',
        'REDIRECT_HTTP_AUTHORIZATION',
        'Authorization'
    ] as $key) {
        if (!empty($_SERVER[$key])) {
            return trim((string)$_SERVER[$key]);
        }
    }

    return '';
}

function firebase_id_token(): string
{
    $header = authorization_header();

    if (
        preg_match('/^Bearer\s+(.+)$/i', $header, $match)
        && !empty($match[1])
    ) {
        return trim($match[1]);
    }

    $body = request_json();

    $token =
        $_POST['idToken']
        ?? $body['idToken']
        ?? '';

    if (is_string($token) && trim($token) !== '') {
        return trim($token);
    }

    respond(401, [
        'error' => 'Authentication token missing.'
    ]);
}

function firebase_request(
    string $url,
    array $curlOptions = []
): array {

    /*
     * InfinityFree/low-cost hosting can have cURL disabled.
     * Prefer cURL, but fall back to PHP streams so the API
     * still works when allow_url_fopen is available.
     */
    if (function_exists('curl_init')) {
        $curl = curl_init($url);

        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_FAILONERROR => false
        ] + $curlOptions);

        $body = curl_exec($curl);

        if ($body === false) {
            $error = curl_error($curl);
            curl_close($curl);
            respond(502, [
                'error' => $error ?: 'Unable to contact Firebase.'
            ]);
        }

        $status = (int)curl_getinfo(
            $curl,
            CURLINFO_RESPONSE_CODE
        );

        curl_close($curl);

        return [
            $status,
            json_decode((string)$body, true)
        ];
    }

    if (!ini_get('allow_url_fopen')) {
        respond(500, [
            'error' => 'Server cannot make HTTPS requests (cURL and URL fopen are unavailable).'
        ]);
    }

    $method = 'GET';
    if (!empty($curlOptions[CURLOPT_POST])) {
        $method = 'POST';
    }

    $headers = [];
    foreach (($curlOptions[CURLOPT_HTTPHEADER] ?? []) as $header) {
        $headers[] = $header;
    }

    $content = $curlOptions[CURLOPT_POSTFIELDS] ?? null;

    $context = stream_context_create([
        'http' => [
            'method' => $method,
            'header' => implode("\r\n", $headers),
            'content' => is_string($content)
                ? $content
                : ($content !== null ? json_encode($content) : ''),
            'timeout' => 15,
            'ignore_errors' => true
        ]
    ]);

    $body = @file_get_contents($url, false, $context);

    if ($body === false) {
        respond(502, [
            'error' => 'Unable to contact Firebase.'
        ]);
    }

    $status = 0;
    foreach (($http_response_header ?? []) as $header) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $header, $match)) {
            $status = (int)$match[1];
        }
    }

    return [
        $status,
        json_decode((string)$body, true)
    ];
}
function require_admin(): array
{
    $config = firebase_config();

    $idToken = firebase_id_token();

    list($status, $identity) = firebase_request(
        'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' .
        rawurlencode($config['apiKey']),
        [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json'
            ],
            CURLOPT_POSTFIELDS => json_encode([
                'idToken' => $idToken
            ])
        ]
    );

    if ($status !== 200 || empty($identity['users'][0]['localId'])) {
        respond(401, [
            'error' => 'Your session has expired. Please sign in again.'
        ]);
    }

    $uid = $identity['users'][0]['localId'];

    list($dbStatus, $adminValue) = firebase_request(
        $config['databaseURL'] .
        '/admins/' .
        rawurlencode($uid) .
        '.json?auth=' .
        rawurlencode($idToken)
    );

    if ($dbStatus !== 200) {
        respond(500, [
            'error' => 'Unable to verify administrator permissions.'
        ]);
    }

    if ($adminValue !== true) {
        respond(403, [
            'error' => 'Administrator access is required.'
        ]);
    }

    return [
        $config,
        $uid
    ];
}

function public_upload_url(string $path): string
{
    return ltrim(
        str_replace(DIRECTORY_SEPARATOR, '/', $path),
        '/'
    );
}