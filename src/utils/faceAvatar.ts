/*
 * @Module: FaceAvatar
 * @Purpose: Deterministic SVG human face generator from Ethereum address
 * @Logic: Parses address hex bytes to select facial features (skin, hair, eyes,
 *         nose, mouth, face shape, eyebrows, accessories). Returns SVG string.
 * @Interfaces: generateFaceSvg(address, size)
 * @Constraints: Zero dependencies. Pure function — same address always produces same face.
 */

// ─── Palette tables ───

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

// ─── Byte extractor ───

function parseAddress(address: string): number[] {
    const hex = address.replace(/^0x/i, "").toLowerCase();
    const bytes: number[] = [];
    for (let i = 0; i < hex.length && bytes.length < 20; i += 2) {
        bytes.push(parseInt(hex.substring(i, i + 2), 16));
    }
    return bytes;
}

function pick<T>(arr: T[], byte: number): T {
    return arr[byte % arr.length];
}

// ─── SVG part generators ───

function renderFaceShape(shapeIdx: number, skin: string): string {
    const shapes = [
        // Round
        `<ellipse cx="32" cy="36" rx="24" ry="28" fill="${skin}" />`,
        // Oval
        `<ellipse cx="32" cy="36" rx="22" ry="30" fill="${skin}" />`,
        // Square-ish
        `<rect x="10" y="10" width="44" height="52" rx="12" fill="${skin}" />`,
        // Heart / tapered
        `<path d="M32 8 C16 8, 6 22, 8 38 C10 54, 22 62, 32 64 C42 62, 54 54, 56 38 C58 22, 48 8, 32 8Z" fill="${skin}" />`,
    ];
    return shapes[shapeIdx % shapes.length];
}

function renderHair(styleIdx: number, color: string): string {
    const styles = [
        // Short / crew cut
        `<path d="M12 28 C12 14, 20 6, 32 6 C44 6, 52 14, 52 28 L52 22 C52 10, 44 2, 32 2 C20 2, 12 10, 12 22Z" fill="${color}" />`,
        // Longer / side part
        `<path d="M10 30 C10 12, 20 2, 32 2 C44 2, 54 12, 54 30 L54 20 C54 6, 44 -2, 32 -2 C20 -2, 6 10, 6 28Z" fill="${color}" />
         <path d="M6 28 C6 26, 8 20, 12 18 L12 30 C10 30, 6 30, 6 28Z" fill="${color}" />`,
        // Spiky
        `<path d="M12 24 L16 4 L22 18 L28 0 L34 16 L40 2 L46 18 L50 6 L52 24 C52 12, 44 4, 32 4 C20 4, 12 12, 12 24Z" fill="${color}" />`,
        // Mohawk
        `<path d="M26 22 C26 6, 28 -2, 32 -2 C36 -2, 38 6, 38 22 C38 12, 36 4, 32 4 C28 4, 26 12, 26 22Z" fill="${color}" />
         <path d="M12 28 C12 14, 20 6, 32 6 C44 6, 52 14, 52 28 L52 24 C52 12, 44 5, 32 5 C20 5, 12 12, 12 24Z" fill="${color}" opacity="0.4" />`,
        // Bald — just a subtle hairline
        `<path d="M14 26 C14 14, 22 6, 32 6 C42 6, 50 14, 50 26 L50 24 C50 13, 42 5, 32 5 C22 5, 14 13, 14 24Z" fill="${color}" opacity="0.3" />`,
        // Curly
        `<circle cx="16" cy="16" r="6" fill="${color}" />
         <circle cx="24" cy="10" r="6" fill="${color}" />
         <circle cx="32" cy="8" r="6" fill="${color}" />
         <circle cx="40" cy="10" r="6" fill="${color}" />
         <circle cx="48" cy="16" r="6" fill="${color}" />
         <circle cx="14" cy="24" r="5" fill="${color}" />
         <circle cx="50" cy="24" r="5" fill="${color}" />`,
    ];
    return styles[styleIdx % styles.length];
}

function renderEyes(shapeIdx: number, color: string): string {
    const yPos = 34;
    const shapes = [
        // Round eyes
        `<circle cx="24" cy="${yPos}" r="4" fill="white" />
         <circle cx="24" cy="${yPos}" r="2.2" fill="${color}" />
         <circle cx="24.8" cy="${yPos - 0.8}" r="0.8" fill="white" />
         <circle cx="40" cy="${yPos}" r="4" fill="white" />
         <circle cx="40" cy="${yPos}" r="2.2" fill="${color}" />
         <circle cx="40.8" cy="${yPos - 0.8}" r="0.8" fill="white" />`,
        // Almond eyes
        `<ellipse cx="24" cy="${yPos}" rx="5" ry="3" fill="white" />
         <circle cx="24" cy="${yPos}" r="2" fill="${color}" />
         <circle cx="24.6" cy="${yPos - 0.6}" r="0.7" fill="white" />
         <ellipse cx="40" cy="${yPos}" rx="5" ry="3" fill="white" />
         <circle cx="40" cy="${yPos}" r="2" fill="${color}" />
         <circle cx="40.6" cy="${yPos - 0.6}" r="0.7" fill="white" />`,
        // Narrow eyes
        `<ellipse cx="24" cy="${yPos}" rx="5" ry="2" fill="white" />
         <circle cx="24" cy="${yPos}" r="1.6" fill="${color}" />
         <ellipse cx="40" cy="${yPos}" rx="5" ry="2" fill="white" />
         <circle cx="40" cy="${yPos}" r="1.6" fill="${color}" />`,
        // Big round eyes
        `<circle cx="24" cy="${yPos}" r="5.5" fill="white" />
         <circle cx="24" cy="${yPos + 0.5}" r="3" fill="${color}" />
         <circle cx="25" cy="${yPos - 1}" r="1.2" fill="white" />
         <circle cx="40" cy="${yPos}" r="5.5" fill="white" />
         <circle cx="40" cy="${yPos + 0.5}" r="3" fill="${color}" />
         <circle cx="41" cy="${yPos - 1}" r="1.2" fill="white" />`,
    ];
    return shapes[shapeIdx % shapes.length];
}

function renderEyebrows(styleIdx: number, color: string): string {
    const styles = [
        // Flat
        `<line x1="19" y1="27" x2="29" y2="27" stroke="${color}" stroke-width="1.5" stroke-linecap="round" />
         <line x1="35" y1="27" x2="45" y2="27" stroke="${color}" stroke-width="1.5" stroke-linecap="round" />`,
        // Arched
        `<path d="M19 28 Q24 24, 29 27" stroke="${color}" stroke-width="1.5" fill="none" stroke-linecap="round" />
         <path d="M35 27 Q40 24, 45 28" stroke="${color}" stroke-width="1.5" fill="none" stroke-linecap="round" />`,
        // Angled
        `<path d="M19 29 L24 26 L29 27" stroke="${color}" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
         <path d="M35 27 L40 26 L45 29" stroke="${color}" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />`,
        // Thick
        `<path d="M19 28 Q24 24, 29 27" stroke="${color}" stroke-width="2.5" fill="none" stroke-linecap="round" />
         <path d="M35 27 Q40 24, 45 28" stroke="${color}" stroke-width="2.5" fill="none" stroke-linecap="round" />`,
    ];
    return styles[styleIdx % styles.length];
}

function renderNose(shapeIdx: number, skin: string): string {
    // Slightly darker than skin for nose shadow
    const shapes = [
        // Small button
        `<ellipse cx="32" cy="42" rx="2.5" ry="2" fill="${skin}" stroke="#00000020" stroke-width="0.5" />`,
        // Pointed
        `<path d="M32 38 L34 44 L30 44Z" fill="${skin}" stroke="#00000020" stroke-width="0.5" />`,
        // Wide
        `<ellipse cx="32" cy="42" rx="4" ry="2.5" fill="${skin}" stroke="#00000020" stroke-width="0.5" />`,
        // Long
        `<path d="M32 36 C33 40, 35 43, 34 44 L30 44 C29 43, 31 40, 32 36Z" fill="${skin}" stroke="#00000020" stroke-width="0.5" />`,
    ];
    return shapes[shapeIdx % shapes.length];
}

function renderMouth(shapeIdx: number): string {
    const y = 50;
    const shapes = [
        // Smile
        `<path d="M24 ${y} Q32 ${y + 6}, 40 ${y}" stroke="#C0392B" stroke-width="1.5" fill="none" stroke-linecap="round" />`,
        // Open smile
        `<path d="M24 ${y} Q32 ${y + 8}, 40 ${y}" fill="#C0392B" />
         <path d="M26 ${y + 1} Q32 ${y + 4}, 38 ${y + 1}" fill="white" />`,
        // Straight / neutral
        `<line x1="26" y1="${y}" x2="38" y2="${y}" stroke="#C0392B" stroke-width="1.5" stroke-linecap="round" />`,
        // Smirk
        `<path d="M25 ${y} Q30 ${y}, 38 ${y - 2}" stroke="#C0392B" stroke-width="1.5" fill="none" stroke-linecap="round" />`,
        // Full lips
        `<ellipse cx="32" cy="${y}" rx="6" ry="3" fill="#E74C3C" opacity="0.7" />
         <line x1="26" y1="${y}" x2="38" y2="${y}" stroke="#C0392B" stroke-width="0.6" />`,
    ];
    return shapes[shapeIdx % shapes.length];
}

function renderAccessory(accIdx: number): string {
    const accessories = [
        // None
        "",
        // Glasses
        `<circle cx="24" cy="34" r="6" fill="none" stroke="#1C1C1C" stroke-width="1.2" />
         <circle cx="40" cy="34" r="6" fill="none" stroke="#1C1C1C" stroke-width="1.2" />
         <line x1="30" y1="34" x2="34" y2="34" stroke="#1C1C1C" stroke-width="1.2" />
         <line x1="18" y1="34" x2="14" y2="32" stroke="#1C1C1C" stroke-width="1" />
         <line x1="46" y1="34" x2="50" y2="32" stroke="#1C1C1C" stroke-width="1" />`,
        // Sunglasses
        `<rect x="17" y="30" width="14" height="8" rx="2" fill="#1C1C1C" opacity="0.85" />
         <rect x="33" y="30" width="14" height="8" rx="2" fill="#1C1C1C" opacity="0.85" />
         <line x1="31" y1="34" x2="33" y2="34" stroke="#1C1C1C" stroke-width="1.5" />
         <line x1="17" y1="33" x2="13" y2="31" stroke="#1C1C1C" stroke-width="1" />
         <line x1="47" y1="33" x2="51" y2="31" stroke="#1C1C1C" stroke-width="1" />`,
        // Freckles
        `<circle cx="18" cy="40" r="0.8" fill="#A0522D" opacity="0.4" />
         <circle cx="21" cy="42" r="0.7" fill="#A0522D" opacity="0.35" />
         <circle cx="19" cy="44" r="0.8" fill="#A0522D" opacity="0.4" />
         <circle cx="43" cy="40" r="0.8" fill="#A0522D" opacity="0.4" />
         <circle cx="46" cy="42" r="0.7" fill="#A0522D" opacity="0.35" />
         <circle cx="44" cy="44" r="0.8" fill="#A0522D" opacity="0.4" />`,
    ];
    return accessories[accIdx % accessories.length];
}

// ─── Main export ───

export function generateFaceSvg(address: string, size: number = 16): string {
    const b = parseAddress(address);
    if (b.length < 12) {
        // Fallback: generic grey circle
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}"><circle cx="32" cy="32" r="28" fill="#555"/></svg>`;
    }

    const skin = pick(SKIN_TONES, b[0]);
    const hairColor = pick(HAIR_COLORS, b[2]);
    const eyeColor = pick(EYE_COLORS, b[6]);

    const parts = [
        renderFaceShape(b[9], skin),
        renderHair(b[4], hairColor),
        renderEyes(b[5], eyeColor),
        renderEyebrows(b[10], hairColor),
        renderNose(b[7], skin),
        renderMouth(b[8]),
        renderAccessory(b[11]),
    ].join("\n");

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">${parts}</svg>`;
}
