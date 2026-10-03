<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['error' => 'POST required.']);
}

require_admin();

$requestedKind = $_POST['kind'] ?? 'product';
$kindMap = [
    'product' => 'products', 'products' => 'products',
    'material' => 'materials', 'materials' => 'materials',
    'company' => 'company', 'companies' => 'company'
];
if (!is_string($requestedKind) || !isset($kindMap[$requestedKind])) {
    respond(422, ['error' => 'Invalid image category.']);
}
$kind = $kindMap[$requestedKind];

// Product uploads identify their final gallery position. Enforce the gallery
// bound on the server as well as in the admin editor.
if ($kind === 'products') {
    $imageSlot = filter_var($_POST['imageSlot'] ?? null, FILTER_VALIDATE_INT);
    if ($imageSlot === false || $imageSlot === null || $imageSlot < 0 || $imageSlot > 2) {
        respond(422, ['error' => 'A product can have at most 3 images.']);
    }
}

if (!isset($_FILES['image']) || !is_array($_FILES['image'])) {
    respond(422, ['error' => 'No image was received by the server.']);
}

$file = $_FILES['image'];
$errorCode = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);

if ($errorCode !== UPLOAD_ERR_OK) {
    $messages = [
        UPLOAD_ERR_INI_SIZE   => 'The image exceeds the server upload limit.',
        UPLOAD_ERR_FORM_SIZE  => 'The image exceeds the form upload limit.',
        UPLOAD_ERR_PARTIAL    => 'The image upload was interrupted. Please try again.',
        UPLOAD_ERR_NO_FILE    => 'Please select an image.',
        UPLOAD_ERR_NO_TMP_DIR => 'The server temporary upload folder is unavailable.',
        UPLOAD_ERR_CANT_WRITE => 'The server could not write the uploaded image.',
        UPLOAD_ERR_EXTENSION  => 'The server blocked the image upload.'
    ];

    respond(422, [
        'error' => $messages[$errorCode] ?? 'The image upload failed.'
    ]);
}

$tmp = (string)($file['tmp_name'] ?? '');
$size = (int)($file['size'] ?? 0);

if ($tmp === '' || !is_uploaded_file($tmp)) {
    respond(422, ['error' => 'The uploaded image is invalid.']);
}

if ($size <= 0) {
    respond(422, ['error' => 'The uploaded image is empty.']);
}

if ($size > 5 * 1024 * 1024) {
    respond(422, ['error' => 'Images must be 5 MB or smaller.']);
}

if (!class_exists('finfo')) {
    respond(500, ['error' => 'PHP Fileinfo is unavailable on this server.']);
}

$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($tmp);

$types = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp'
];

if (!isset($types[$mime])) {
    respond(422, ['error' => 'Only JPG, PNG and WebP images are allowed.']);
}

$info = @getimagesize($tmp);

if (!$info || $info[0] < 1 || $info[1] < 1) {
    respond(422, ['error' => 'Invalid image data.']);
}

if (
    $info[0] > 12000 ||
    $info[1] > 12000 ||
    ($info[0] * $info[1]) > 40000000
) {
    respond(422, ['error' => 'Image dimensions are too large.']);
}

$folder = __DIR__ . '/../uploads/' . $kind;

if (!is_dir($folder) && !mkdir($folder, 0755, true)) {
    respond(500, ['error' => 'Upload folder is unavailable.']);
}

if (!is_writable($folder)) {
    respond(500, ['error' => 'Upload folder is not writable by PHP.']);
}

$extension = $types[$mime];
$name = bin2hex(random_bytes(16)) . '.' . $extension;
$destination = $folder . '/' . $name;

/*
 * GD is optional.
 *
 * The previous version always called imagecreatefrom*() and therefore
 * returned a 500 error on hosts where GD is disabled. InfinityFree
 * configurations can differ, so upload the original validated file
 * when GD is unavailable. If GD is available, keep the existing
 * resize/compression behavior.
 */
$gdAvailable =
    extension_loaded('gd') &&
    function_exists('imagecreatetruecolor');

if (!$gdAvailable) {
    if (!move_uploaded_file($tmp, $destination)) {
        respond(500, ['error' => 'Image could not be saved to the uploads folder.']);
    }

    respond(201, [
        'imageUrl' => public_upload_url(
            'uploads/' . $kind . '/' . $name
        ),
        'processed' => false
    ]);
}

$source = false;

if ($mime === 'image/jpeg' && function_exists('imagecreatefromjpeg')) {
    $source = @imagecreatefromjpeg($tmp);
} elseif ($mime === 'image/png' && function_exists('imagecreatefrompng')) {
    $source = @imagecreatefrompng($tmp);
} elseif ($mime === 'image/webp' && function_exists('imagecreatefromwebp')) {
    $source = @imagecreatefromwebp($tmp);
}

if (!$source) {
    /*
     * The file has already passed MIME and image validation.
     * If a specific GD decoder is missing, keep the original file.
     */
    if (!move_uploaded_file($tmp, $destination)) {
        respond(500, ['error' => 'Image could not be saved.']);
    }

    respond(201, [
        'imageUrl' => public_upload_url(
            'uploads/' . $kind . '/' . $name
        ),
        'processed' => false
    ]);
}

$width = imagesx($source);
$height = imagesy($source);
$target = $source;

if ($width > 1600) {
    $newHeight = max(
        1,
        (int)round($height * (1600 / $width))
    );

    $target = imagecreatetruecolor(
        1600,
        $newHeight
    );

    if ($mime !== 'image/jpeg') {
        imagealphablending($target, false);
        imagesavealpha($target, true);

        $transparent = imagecolorallocatealpha(
            $target,
            0,
            0,
            0,
            127
        );

        imagefilledrectangle(
            $target,
            0,
            0,
            1600,
            $newHeight,
            $transparent
        );
    }

    imagecopyresampled(
        $target,
        $source,
        0,
        0,
        0,
        0,
        1600,
        $newHeight,
        $width,
        $height
    );
}

$saved = false;

if ($mime === 'image/jpeg') {
    $saved = imagejpeg($target, $destination, 84);
} elseif ($mime === 'image/png') {
    $saved = imagepng($target, $destination, 6);
} elseif (
    $mime === 'image/webp' &&
    function_exists('imagewebp')
) {
    $saved = imagewebp($target, $destination, 84);
}

if ($target !== $source) {
    imagedestroy($target);
}

imagedestroy($source);

if (!$saved) {
    @unlink($destination);
    respond(500, ['error' => 'Image could not be saved.']);
}

respond(201, [
    'imageUrl' => public_upload_url(
        'uploads/' . $kind . '/' . $name
    ),
    'processed' => true
]);
