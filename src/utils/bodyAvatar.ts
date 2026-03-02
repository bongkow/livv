/*
 * @Module: BodyAvatar
 * @Purpose: Deterministic SVG human body generator (neck-down) from Ethereum address
 * @Logic: Parses address hex bytes to select body features (gender, proportions,
 *         arm/leg stance). Skin tone uses same byte as faceAvatar for colour match.
 *         Includes anatomical detail: collarbones, muscle contours, knees, elbows,
 *         fingers, navel, and gender-specific silhouettes.
 * @Interfaces: generateBodySvg(address, width), BODY_VIEWBOX_WIDTH, BODY_VIEWBOX_HEIGHT
 * @Constraints: Zero dependencies. Pure function. Body-only — no head rendered.
 */

// ─── Shared palette (must match faceAvatar.ts) ───

const SKIN_TONES = [
    "#FFDBB4", "#EDB98A", "#D08B5B", "#AE5D29",
    "#794528", "#613318", "#F5D6B8", "#C68642",
];

// ─── Constants ───

export const BODY_VIEWBOX_WIDTH = 64;
export const BODY_VIEWBOX_HEIGHT = 100;

// ─── Byte extractor (same logic as faceAvatar) ───

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

// ─── Helpers ───

type Gender = "male" | "female";

function determineGender(byte: number): Gender {
    return byte % 2 === 0 ? "male" : "female";
}

/** Darken a hex colour for shadow/contour lines */
function shadowColor(hex: string): string {
    return hex + "88";
}

/** Even darker for deep contours */
function deepShadow(hex: string): string {
    return hex + "55";
}

// ─── Body part renderers ───

function renderNeck(skin: string): string {
    const shadow = shadowColor(skin);
    return [
        // Main neck cylinder
        `<rect x="27" y="0" width="10" height="12" rx="3" fill="${skin}" />`,
        // Neck tendons / subtle muscle lines
        `<line x1="29" y1="2" x2="29" y2="10" stroke="${shadow}" stroke-width="0.4" />`,
        `<line x1="35" y1="2" x2="35" y2="10" stroke="${shadow}" stroke-width="0.4" />`,
        // Adam's apple hint (subtle)
        `<ellipse cx="32" cy="6" rx="1" ry="1.5" fill="${shadow}" opacity="0.3" />`,
    ].join("\n");
}

function renderCollarbones(skin: string): string {
    const shadow = shadowColor(skin);
    return [
        // Left collarbone
        `<path d="M27 10 Q22 11, 14 14" stroke="${shadow}" stroke-width="0.7" fill="none" stroke-linecap="round" />`,
        // Right collarbone
        `<path d="M37 10 Q42 11, 50 14" stroke="${shadow}" stroke-width="0.7" fill="none" stroke-linecap="round" />`,
        // Notch at center
        `<ellipse cx="32" cy="11" rx="1.5" ry="0.8" fill="${shadow}" opacity="0.4" />`,
    ].join("\n");
}

function renderTorso(gender: Gender, skin: string, variationByte: number): string {
    const v = (variationByte % 3); // 0-2 variation

    if (gender === "male") {
        const sL = 11 - v;
        const sR = 53 + v;
        return [
            // Main torso shape — broad shoulders, tapered waist, curved pelvis
            `<path d="
                M27 9 Q22 10, ${sL} 15
                L${sL} 20
                Q${sL + 1} 30, 17 42
                L19 50
                Q20 56, 27 60
                Q32 62, 37 60
                Q44 56, 45 50
                Q47 42, ${sR - 1} 30
                L${sR} 20
                L${sR} 15
                Q42 10, 37 9 Z"
                fill="${skin}" />`,
            // Pectoral contours
            `<path d="M20 20 Q26 24, 30 22" stroke="${shadowColor(skin)}" stroke-width="0.5" fill="none" />`,
            `<path d="M44 20 Q38 24, 34 22" stroke="${shadowColor(skin)}" stroke-width="0.5" fill="none" />`,
            // Abs — subtle line work
            `<line x1="32" y1="26" x2="32" y2="50" stroke="${shadowColor(skin)}" stroke-width="0.4" />`,
            `<path d="M28 32 Q32 33, 36 32" stroke="${deepShadow(skin)}" stroke-width="0.3" fill="none" />`,
            `<path d="M28 37 Q32 38, 36 37" stroke="${deepShadow(skin)}" stroke-width="0.3" fill="none" />`,
            `<path d="M29 42 Q32 43, 35 42" stroke="${deepShadow(skin)}" stroke-width="0.3" fill="none" />`,
            // Side muscle contour
            `<path d="M${sL + 2} 22 Q${sL + 4} 34, 19 48" stroke="${deepShadow(skin)}" stroke-width="0.3" fill="none" />`,
            `<path d="M${sR - 2} 22 Q${sR - 4} 34, 45 48" stroke="${deepShadow(skin)}" stroke-width="0.3" fill="none" />`,
        ].join("\n");
    } else {
        const sL = 14 - v;
        const sR = 50 + v;
        return [
            // Female torso — narrower shoulders, defined waist, wider hips, curved pelvis
            `<path d="
                M27 9 Q23 10, ${sL} 15
                L${sL} 20
                Q${sL + 2} 28, 21 36
                Q19 44, 16 50
                Q18 56, 27 60
                Q32 62, 37 60
                Q46 56, 48 50
                Q45 44, 43 36
                Q${sR - 2} 28, ${sR} 20
                L${sR} 15
                Q41 10, 37 9 Z"
                fill="${skin}" />`,
            // Waist crease contours
            `<path d="M${sL + 4} 22 Q22 34, 18 48" stroke="${deepShadow(skin)}" stroke-width="0.3" fill="none" />`,
            `<path d="M${sR - 4} 22 Q42 34, 46 48" stroke="${deepShadow(skin)}" stroke-width="0.3" fill="none" />`,
            // Subtle navel-to-hip lines
            `<line x1="32" y1="38" x2="32" y2="50" stroke="${shadowColor(skin)}" stroke-width="0.3" />`,
        ].join("\n");
    }
}

function renderChest(gender: Gender, skin: string): string {
    if (gender === "female") {
        const shadow = shadowColor(skin);
        const deep = deepShadow(skin);
        return [
            // Breast contours — curved shading
            `<path d="M22 20 Q25 28, 30 26" stroke="${shadow}" stroke-width="0.6" fill="none" />`,
            `<path d="M42 20 Q39 28, 34 26" stroke="${shadow}" stroke-width="0.6" fill="none" />`,
            // Under-breast shadow
            `<path d="M23 26 Q27 29, 31 27" stroke="${deep}" stroke-width="0.4" fill="none" />`,
            `<path d="M41 26 Q37 29, 33 27" stroke="${deep}" stroke-width="0.4" fill="none" />`,
            // Subtle highlights on top
            `<ellipse cx="26" cy="22" rx="2" ry="1" fill="white" opacity="0.08" />`,
            `<ellipse cx="38" cy="22" rx="2" ry="1" fill="white" opacity="0.08" />`,
        ].join("\n");
    }
    return "";
}

function renderShoulder(gender: Gender, skin: string): string {
    const shadow = shadowColor(skin);
    if (gender === "male") {
        return [
            // Deltoid caps — rounded shoulder masses
            `<ellipse cx="12" cy="17" rx="4" ry="5" fill="${skin}" />`,
            `<ellipse cx="52" cy="17" rx="4" ry="5" fill="${skin}" />`,
            // Deltoid contour
            `<path d="M10 13 Q12 10, 16 14" stroke="${shadow}" stroke-width="0.4" fill="none" />`,
            `<path d="M54 13 Q52 10, 48 14" stroke="${shadow}" stroke-width="0.4" fill="none" />`,
        ].join("\n");
    }
    return [
        `<ellipse cx="15" cy="17" rx="3" ry="4" fill="${skin}" />`,
        `<ellipse cx="49" cy="17" rx="3" ry="4" fill="${skin}" />`,
    ].join("\n");
}

function renderArms(gender: Gender, skin: string): string {
    const thick = gender === "male" ? 4.5 : 3.8;
    const shadow = shadowColor(skin);

    const lShoulder = gender === "male" ? 10 : 13;
    const rShoulder = gender === "male" ? 54 : 51;

    const armPath = (sx: number, elbowX: number, elbowY: number, handX: number, handY: number, side: "l" | "r") => {
        const bicepShadowX = (sx + elbowX) / 2 + (side === "l" ? -1 : 1);
        const bicepShadowY = (18 + elbowY) / 2;
        return [
            // Upper arm
            `<path d="M${sx} 18 Q${bicepShadowX} ${bicepShadowY - 2}, ${elbowX} ${elbowY}"
                stroke="${skin}" stroke-width="${thick}" fill="none" stroke-linecap="round" />`,
            // Forearm
            `<path d="M${elbowX} ${elbowY} Q${(elbowX + handX) / 2 + (side === "l" ? 1 : -1)} ${(elbowY + handY) / 2}, ${handX} ${handY}"
                stroke="${skin}" stroke-width="${thick - 0.8}" fill="none" stroke-linecap="round" />`,
            // Elbow joint
            `<circle cx="${elbowX}" cy="${elbowY}" r="${thick / 2 + 0.3}" fill="${skin}" />`,
            `<circle cx="${elbowX}" cy="${elbowY}" r="${thick / 2 - 0.5}" fill="${shadow}" opacity="0.3" />`,
            // Bicep contour
            `<path d="M${sx} 18 Q${bicepShadowX} ${bicepShadowY}, ${elbowX} ${elbowY}"
                stroke="${shadow}" stroke-width="0.3" fill="none" />`,
        ].join("\n");
    };

    // 차렷자세 (attention stance) — arms straight down at sides
    return [
        armPath(lShoulder, lShoulder - 1, 38, lShoulder - 1, 54, "l"),
        armPath(rShoulder, rShoulder + 1, 38, rShoulder + 1, 54, "r"),
        renderDetailedHands(lShoulder - 1, 54, rShoulder + 1, 54, skin),
    ].join("\n");
}

function renderDetailedHands(lx: number, ly: number, rx: number, ry: number, skin: string): string {
    const shadow = shadowColor(skin);

    const hand = (cx: number, cy: number, side: "l" | "r") => {
        const dir = side === "l" ? -1 : 1;
        const parts = [
            // Palm
            `<ellipse cx="${cx}" cy="${cy + 2}" rx="3" ry="2.5" fill="${skin}" />`,
            // Wrist crease
            `<path d="M${cx - 2} ${cy} Q${cx} ${cy + 0.5}, ${cx + 2} ${cy}" stroke="${shadow}" stroke-width="0.3" fill="none" />`,
        ];

        // Fingers (4) — pointing down, straight
        for (let i = 0; i < 4; i++) {
            const fx = cx - 2 + i * 1.3;
            const fy = cy + 4;
            const fLen = 2 + (i === 1 || i === 2 ? 0.8 : 0);
            parts.push(
                `<line x1="${fx}" y1="${fy}" x2="${fx}" y2="${fy + fLen}"
                    stroke="${skin}" stroke-width="0.8" stroke-linecap="round" />`
            );
        }
        // Thumb — tucked against side
        parts.push(
            `<line x1="${cx + dir * 2.5}" y1="${cy + 1.5}" x2="${cx + dir * 3}" y2="${cy + 3.5}"
                stroke="${skin}" stroke-width="0.9" stroke-linecap="round" />`
        );

        return parts.join("\n");
    };

    return [hand(lx, ly, "l"), hand(rx, ry, "r")].join("\n");
}

function renderHips(gender: Gender, skin: string): string {
    const shadow = shadowColor(skin);
    if (gender === "female") {
        return [
            // Hip contour — wider curve
            `<path d="M17 53 Q15 56, 16 58" stroke="${shadow}" stroke-width="0.4" fill="none" />`,
            `<path d="M47 53 Q49 56, 48 58" stroke="${shadow}" stroke-width="0.4" fill="none" />`,
            // Iliac crest hints
            `<path d="M22 50 Q26 52, 32 52" stroke="${shadow}" stroke-width="0.3" fill="none" />`,
            `<path d="M42 50 Q38 52, 32 52" stroke="${shadow}" stroke-width="0.3" fill="none" />`,
        ].join("\n");
    }
    return [
        `<path d="M20 52 Q24 54, 32 54" stroke="${shadow}" stroke-width="0.2" fill="none" />`,
        `<path d="M44 52 Q40 54, 32 54" stroke="${shadow}" stroke-width="0.2" fill="none" />`,
    ].join("\n");
}

function renderPelvis(gender: Gender, skin: string): string {
    const shadow = shadowColor(skin);
    const thighW = gender === "male" ? 5.5 : 4.8;
    // Smooth bridge from lower torso curve (y≈58-60) down to leg tops (y=56→thigh start)
    // This fills the groin area so torso and legs connect naturally
    return [
        // Inner thigh fill — two overlapping rounded rects bridging torso to legs
        `<path d="
            M22 56
            Q24 60, 27 62
            L27 56 Z"
            fill="${skin}" />`,
        `<path d="
            M42 56
            Q40 60, 37 62
            L37 56 Z"
            fill="${skin}" />`,
        // Upper thigh connectors — rounded tops at leg origins
        `<ellipse cx="27" cy="58" rx="${thighW / 2 + 1}" ry="3" fill="${skin}" />`,
        `<ellipse cx="37" cy="58" rx="${thighW / 2 + 1}" ry="3" fill="${skin}" />`,
        // Groin crease line
        `<path d="M27 58 Q32 64, 37 58" stroke="${shadow}" stroke-width="0.4" fill="none" />`,
    ].join("\n");
}

function renderLegs(gender: Gender, skin: string): string {
    const thick = gender === "male" ? 5.5 : 4.8;
    const calfThick = thick - 1;
    const shadow = shadowColor(skin);
    const hipY = 58;

    const leg = (hipX: number, kneeX: number, kneeY: number, ankleX: number, ankleY: number) => [
        // Thigh
        `<path d="M${hipX} ${hipY} L${kneeX} ${kneeY}"
            stroke="${skin}" stroke-width="${thick}" fill="none" stroke-linecap="round" />`,
        // Knee cap
        `<circle cx="${kneeX}" cy="${kneeY}" r="${thick / 2 + 0.5}" fill="${skin}" />`,
        `<ellipse cx="${kneeX}" cy="${kneeY}" rx="2" ry="1.5" fill="${shadow}" opacity="0.25" />`,
        // Shin / calf
        `<path d="M${kneeX} ${kneeY} L${ankleX} ${ankleY}"
            stroke="${skin}" stroke-width="${calfThick}" fill="none" stroke-linecap="round" />`,
        // Calf muscle contour
        `<path d="M${kneeX + 1} ${kneeY + 2} Q${kneeX + 2} ${kneeY + 6}, ${ankleX + 0.5} ${ankleY - 4}"
            stroke="${shadow}" stroke-width="0.3" fill="none" />`,
    ].join("\n");

    // 차렷자세 — legs straight, together
    return [
        leg(27, 27, 74, 27, 88),
        leg(37, 37, 74, 37, 88),
        renderDetailedFeet(27, 88, 37, 88, skin),
    ].join("\n");
}

function renderDetailedFeet(lx: number, ly: number, rx: number, ry: number, skin: string): string {
    const shadow = shadowColor(skin);
    const foot = (cx: number, cy: number, dir: number) => [
        // Foot body
        `<ellipse cx="${cx + dir * 1}" cy="${cy + 2}" rx="5" ry="2.5" fill="${skin}" />`,
        // Ankle bone bump
        `<circle cx="${cx - dir * 1}" cy="${cy}" r="1.2" fill="${skin}" />`,
        `<circle cx="${cx - dir * 1}" cy="${cy}" r="0.6" fill="${shadow}" opacity="0.3" />`,
        // Toe separation hints
        `<line x1="${cx + dir * 3}" y1="${cy + 1}" x2="${cx + dir * 3}" y2="${cy + 3}" stroke="${shadow}" stroke-width="0.2" />`,
        `<line x1="${cx + dir * 4.5}" y1="${cy + 1.5}" x2="${cx + dir * 4.5}" y2="${cy + 2.8}" stroke="${shadow}" stroke-width="0.2" />`,
    ].join("\n");

    return [foot(lx, ly, -1), foot(rx, ry, 1)].join("\n");
}

function renderNavel(skin: string): string {
    const shadow = shadowColor(skin);
    return [
        `<ellipse cx="32" cy="46" rx="1.2" ry="1.5" fill="${shadow}" opacity="0.4" />`,
        `<path d="M31.2 45.5 Q32 44.5, 32.8 45.5" stroke="${shadow}" stroke-width="0.3" fill="none" />`,
    ].join("\n");
}

// ─── Main export ───

export function generateBodySvg(address: string, width: number = 64): string {
    const b = parseAddress(address);
    if (b.length < 12) {
        const h = Math.round(width * (BODY_VIEWBOX_HEIGHT / BODY_VIEWBOX_WIDTH));
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BODY_VIEWBOX_WIDTH} ${BODY_VIEWBOX_HEIGHT}" width="${width}" height="${h}"><rect x="20" y="4" width="24" height="80" rx="8" fill="#555"/></svg>`;
    }

    const skin = pick(SKIN_TONES, b[0]);
    const gender = determineGender(b[1]);
    const height = Math.round(width * (BODY_VIEWBOX_HEIGHT / BODY_VIEWBOX_WIDTH));

    const parts = [
        renderNeck(skin),
        renderCollarbones(skin),
        renderShoulder(gender, skin),
        renderTorso(gender, skin, b[3]),
        renderChest(gender, skin),
        renderArms(gender, skin),
        renderNavel(skin),
        renderHips(gender, skin),
        renderPelvis(gender, skin),
        renderLegs(gender, skin),
    ].join("\n");

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BODY_VIEWBOX_WIDTH} ${BODY_VIEWBOX_HEIGHT}" width="${width}" height="${height}">${parts}</svg>`;
}
