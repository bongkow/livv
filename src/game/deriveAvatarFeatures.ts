/*
 * @Module: deriveAvatarFeatures
 * @Purpose: Extract all address-derived avatar traits into a typed object
 * @Logic: Mirrors the derivation logic in avatarBuilder.ts but returns data
 *         instead of building meshes — for display in the detail panel.
 * @Interfaces: deriveAvatarFeatures(address) → AvatarFeatures
 */

// ─── Palettes (must stay in sync with avatarBuilder.ts) ───

const SKIN_TONES = [
    "#FFDBB4", "#EDB98A", "#D08B5B", "#AE5D29",
    "#794528", "#613318", "#F5D6B8", "#C68642",
];

const HAIR_COLORS = [
    "#2C1B18", "#4A3728", "#8B6914", "#D4A03C",
    "#C0392B", "#E67E22", "#7F8C8D", "#F0E6D3",
];

const EYE_COLORS = [
    "#2E86C1", "#1B4F72", "#27AE60", "#6C3483",
    "#784212", "#1C1C1C",
];

const EYE_SIZE_LABELS = ["Small", "Medium", "Large", "Extra-Large"];
const NOSE_SIZE_LABELS = ["Petite", "Small", "Medium", "Prominent"];
const MOUTH_LABELS = ["Smile", "Neutral", "Wide Smile", "Small/Pursed"];
const BROW_SHAPE_LABELS = ["Flat", "Arched", "Angled", "Furrowed"];
const BROW_THICKNESS_LABELS = ["Thin", "Medium", "Thick"];
const BROW_WIDTH_LABELS = ["Narrow", "Medium", "Wide"];

// ─── Types ───

export interface AvatarFeatures {
    gender: "Male" | "Female";
    heightCm: number;
    skinTone: string;
    hairColor: string;
    eyeColor: string;
    eyeSize: string;
    noseSize: string;
    mouthShape: string;
    browShape: string;
    browThickness: string;
    browWidth: string;
    shirtHue: number;
}

// ─── Derivation ───

function parseAddressBytes(address: string): number[] {
    const hex = address.replace(/^0x/i, "").toLowerCase();
    const bytes: number[] = [];
    for (let i = 0; i < hex.length && bytes.length < 20; i += 2) {
        bytes.push(parseInt(hex.substring(i, i + 2), 16));
    }
    return bytes;
}

export function deriveAvatarFeatures(address: string): AvatarFeatures {
    const bytes = parseAddressBytes(address);

    const isFemale = bytes[1] % 2 === 0;
    const heightByte = bytes[14] ?? 128;
    const heightBase = isFemale ? 155 : 170;
    const heightRange = isFemale ? 20 : 20;
    const heightCm = Math.round(heightBase + (heightByte / 255) * heightRange);

    return {
        gender: isFemale ? "Female" : "Male",
        heightCm,
        skinTone: SKIN_TONES[bytes[0] % SKIN_TONES.length],
        hairColor: HAIR_COLORS[bytes[2] % HAIR_COLORS.length],
        eyeColor: EYE_COLORS[bytes[6] % EYE_COLORS.length],
        eyeSize: EYE_SIZE_LABELS[bytes[5] % EYE_SIZE_LABELS.length],
        noseSize: NOSE_SIZE_LABELS[bytes[7] % NOSE_SIZE_LABELS.length],
        mouthShape: MOUTH_LABELS[bytes[8] % MOUTH_LABELS.length],
        browShape: BROW_SHAPE_LABELS[bytes[10] % BROW_SHAPE_LABELS.length],
        browThickness: BROW_THICKNESS_LABELS[bytes[9] % BROW_THICKNESS_LABELS.length],
        browWidth: BROW_WIDTH_LABELS[bytes[11] % BROW_WIDTH_LABELS.length],
        shirtHue: Math.round(((bytes[12] ?? 128) / 255) * 360),
    };
}
