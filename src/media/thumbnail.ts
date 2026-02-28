/*
 * @Module: Thumbnail Generator
 * @Purpose: Generate small base64 thumbnail data URLs from image files for instant previews
 * @Logic: Draws image onto an off-screen canvas, scales to max 200px, exports as JPEG data URL
 * @Interfaces: generateThumbnail(file: File) => Promise<string>
 * @Constraints: Browser-only (uses Canvas API). Only for image files.
 */

/** Max dimension (width or height) for the thumbnail in pixels. */
const MAX_THUMBNAIL_SIZE = 200;

/** JPEG quality for the thumbnail (0–1). Lower = smaller payload. */
const THUMBNAIL_QUALITY = 0.6;

/**
 * Generate a small base64 data URL thumbnail from an image File.
 *
 * The thumbnail is scaled to fit within `MAX_THUMBNAIL_SIZE` on its longest
 * edge and exported as a JPEG data URL. Typical output is 2–8 KB — small
 * enough to embed in the transfer metadata JSON.
 */
export async function generateThumbnail(file: File): Promise<string> {
    const bitmap = await createImageBitmap(file);

    const { width, height } = bitmap;
    const scale = Math.min(MAX_THUMBNAIL_SIZE / width, MAX_THUMBNAIL_SIZE / height, 1);
    const thumbW = Math.round(width * scale);
    const thumbH = Math.round(height * scale);

    const canvas = new OffscreenCanvas(thumbW, thumbH);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2d context for thumbnail");

    ctx.drawImage(bitmap, 0, 0, thumbW, thumbH);
    bitmap.close();

    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: THUMBNAIL_QUALITY });
    return blobToDataUrl(blob);
}

// ─── Helpers ───

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read blob as data URL"));
        reader.readAsDataURL(blob);
    });
}
