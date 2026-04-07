/*
 * @Module: AvatarBuilder
 * @Purpose: Load HVGirl.glb and apply address-deterministic innate traits
 * @Logic: Ethereum address bytes → gender, height, skin tone, hair color, eye color,
 *         body proportions (bone scaling), head shape, face overlay (eyebrows).
 *         Clothing colors are NOT address-derived (changeable later).
 * @Interfaces: buildAvatar(scene, address, shadow?) → Promise<AvatarRig>
 */

import {
    Scene,
    MeshBuilder,
    StandardMaterial,
    PBRMaterial,
    TransformNode,
    DynamicTexture,
    Color3,
    Mesh,
    ShadowGenerator,
    SceneLoader,
    AnimationGroup,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { truncateAddress } from "@/utils/truncateAddress";

// ─── Deterministic trait derivation from Ethereum address ───

interface InnateTraits {
    gender: "male" | "female";
    scale: number;              // 0.08–0.12
    skinColor: Color3;
    hairColor: Color3;
    eyeColor: Color3;
    eyeDarkColor: Color3;
    // Body proportions (bone scaling)
    shoulderWidth: number;      // 0.85–1.20
    hipWidth: number;           // 0.85–1.20
    upperArmLength: number;     // 0.90–1.10
    upperLegLength: number;     // 0.92–1.08
    spineLength: number;        // 0.95–1.05
    // Head shape
    headScaleX: number;         // 0.90–1.10
    headScaleY: number;         // 0.90–1.10
    headScaleZ: number;         // 0.92–1.08
    // Face overlay
    eyebrowStyle: number;       // 0–5
    eyebrowThickness: number;   // 0.6–1.4
    eyeSize: number;            // 0.7–1.3
    noseWidth: number;          // 0.7–1.3
    mouthWidth: number;         // 0.7–1.3
    mouthCurve: number;         // -0.3–0.3 (down to up)
}

function addressToBytes(address: string): number[] {
    const hex = address.replace("0x", "").toLowerCase();
    const bytes: number[] = [];
    for (let i = 0; i < hex.length && i < 40; i += 2) {
        bytes.push(parseInt(hex.slice(i, i + 2), 16));
    }
    return bytes;
}

// Normalize byte (0–255) to a range [min, max]
function norm(byte: number, min: number, max: number): number {
    return min + (byte / 255) * (max - min);
}

// Interpolate smoothly between palette entries using two bytes (category + variation)
// This gives 256 unique values per trait instead of N discrete palette entries
const SKIN_PALETTE: [number, number, number][] = [
    [1.0, 0.87, 0.77],   // fair
    [0.96, 0.80, 0.69],  // light
    [0.87, 0.72, 0.53],  // medium light
    [0.78, 0.61, 0.43],  // medium
    [0.66, 0.49, 0.33],  // olive
    [0.55, 0.38, 0.26],  // tan
    [0.44, 0.30, 0.20],  // brown
    [0.33, 0.22, 0.15],  // dark
];

const HAIR_PALETTE: [number, number, number][] = [
    [0.05, 0.03, 0.02],  // jet black
    [0.25, 0.15, 0.08],  // dark brown
    [0.55, 0.35, 0.15],  // brown
    [0.75, 0.55, 0.25],  // auburn
    [0.92, 0.78, 0.45],  // blonde
    [0.95, 0.90, 0.70],  // platinum
    [0.80, 0.25, 0.12],  // red
    [0.50, 0.50, 0.55],  // grey
];

const EYE_PALETTE: [number, number, number][] = [
    [0.22, 0.13, 0.06],  // dark brown
    [0.55, 0.38, 0.15],  // amber
    [0.20, 0.45, 0.20],  // green
    [0.25, 0.45, 0.65],  // blue
    [0.15, 0.30, 0.55],  // dark blue
    [0.40, 0.35, 0.55],  // grey-blue
    [0.10, 0.08, 0.05],  // near black
];

function lerpPalette(palette: [number, number, number][], t: number): Color3 {
    const n = palette.length - 1;
    const idx = t * n;
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, n);
    const frac = idx - lo;
    return new Color3(
        palette[lo][0] + (palette[hi][0] - palette[lo][0]) * frac,
        palette[lo][1] + (palette[hi][1] - palette[lo][1]) * frac,
        palette[lo][2] + (palette[hi][2] - palette[lo][2]) * frac,
    );
}

function addressToTraits(address: string): InnateTraits {
    const b = addressToBytes(address);

    // Gender: bit 0 of first byte
    const gender = b[0] & 1 ? "male" : "female";

    // Height: males tend taller, females shorter (overlapping ranges)
    const baseScale = gender === "male"
        ? norm(b[1], 0.090, 0.120)
        : norm(b[1], 0.078, 0.105);

    // Skin tone — use TWO bytes for 65536 unique combos, then lerp through palette
    const skinT = ((b[2] * 256 + b[19]) % 65536) / 65535;
    const skinColor = lerpPalette(SKIN_PALETTE, skinT);

    // Hair color — two bytes, lerp through palette
    const hairT = ((b[3] * 256 + b[18]) % 65536) / 65535;
    const hairColor = lerpPalette(HAIR_PALETTE, hairT);

    // Eye color — two bytes, lerp through palette
    const eyeT = ((b[4] * 256 + b[17]) % 65536) / 65535;
    const eyeColor = lerpPalette(EYE_PALETTE, eyeT);
    const eyeDarkColor = new Color3(eyeColor.r * 0.5, eyeColor.g * 0.5, eyeColor.b * 0.5);

    // Body proportions — gender-differentiated
    const shoulderWidth = gender === "male"
        ? norm(b[5], 1.02, 1.20)
        : norm(b[5], 0.85, 1.02);
    const hipWidth = gender === "male"
        ? norm(b[6], 0.85, 1.00)
        : norm(b[6], 0.98, 1.18);
    const upperArmLength = norm(b[7], 0.92, 1.08);
    const upperLegLength = norm(b[8], 0.94, 1.06);
    const spineLength = norm(b[9], 0.96, 1.04);

    // Head shape
    const headScaleX = norm(b[10], 0.90, 1.10);
    const headScaleY = norm(b[11], 0.90, 1.10);
    const headScaleZ = norm(b[12], 0.93, 1.07);

    // Face features
    const eyebrowStyle = b[13] % 6;
    const eyebrowThickness = norm(b[14], 0.6, 1.4);
    const eyeSize = norm(b[15], 0.7, 1.3);
    const noseWidth = norm(b[16], 0.7, 1.3);
    const mouthWidth = norm(b[17], 0.7, 1.3);
    const mouthCurve = norm(b[18], -0.3, 0.3);

    return {
        gender, scale: baseScale, skinColor, hairColor, eyeColor, eyeDarkColor,
        shoulderWidth, hipWidth, upperArmLength, upperLegLength, spineLength,
        headScaleX, headScaleY, headScaleZ,
        eyebrowStyle, eyebrowThickness, eyeSize, noseWidth, mouthWidth, mouthCurve,
    };
}

// ─── Face overlay: procedural eyebrows / features ───

function buildFaceOverlay(
    scene: Scene,
    parent: TransformNode,
    traits: InnateTraits,
): Mesh {
    const size = 0.6;
    const plane = MeshBuilder.CreatePlane("faceOverlay", { width: size, height: size }, scene);
    // Position in front of face — head bone local coords
    plane.position.y = 0.5;
    plane.position.z = -0.55;
    plane.parent = parent;

    const res = 256;
    const tex = new DynamicTexture("faceTex", { width: res, height: res }, scene, true);
    tex.hasAlpha = true;
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, res, res);

    const cx = res / 2; // center x
    const cy = res / 2; // center y

    // ── Eyebrows ──
    const browY = cy - 50 * traits.eyeSize;
    const browSpread = 28;
    const browLen = 35 * traits.eyebrowThickness;
    const browThick = 3 + 4 * traits.eyebrowThickness;

    ctx.strokeStyle = `rgb(${traits.hairColor.r * 200}, ${traits.hairColor.g * 180}, ${traits.hairColor.b * 160})`;
    ctx.lineWidth = browThick;
    ctx.lineCap = "round";

    // Different eyebrow styles
    const style = traits.eyebrowStyle;
    for (const side of [-1, 1]) {
        const bx = cx + side * browSpread;
        ctx.beginPath();
        if (style === 0) {
            // Straight
            ctx.moveTo(bx - side * browLen, browY);
            ctx.lineTo(bx + side * browLen * 0.3, browY - 2);
        } else if (style === 1) {
            // Arched
            ctx.moveTo(bx - side * browLen, browY + 4);
            ctx.quadraticCurveTo(bx, browY - 12, bx + side * browLen * 0.3, browY);
        } else if (style === 2) {
            // Angled
            ctx.moveTo(bx - side * browLen, browY + 6);
            ctx.lineTo(bx, browY - 6);
            ctx.lineTo(bx + side * browLen * 0.3, browY - 3);
        } else if (style === 3) {
            // Rounded
            ctx.moveTo(bx - side * browLen, browY + 2);
            ctx.quadraticCurveTo(bx, browY - 8, bx + side * browLen * 0.4, browY + 2);
        } else if (style === 4) {
            // Thick straight
            ctx.lineWidth = browThick * 1.5;
            ctx.moveTo(bx - side * browLen, browY);
            ctx.lineTo(bx + side * browLen * 0.4, browY + 1);
        } else {
            // S-curve
            ctx.moveTo(bx - side * browLen, browY + 3);
            ctx.bezierCurveTo(
                bx - side * browLen * 0.3, browY - 10,
                bx + side * browLen * 0.1, browY - 5,
                bx + side * browLen * 0.4, browY + 1,
            );
        }
        ctx.stroke();
    }

    // ── Nose hint ──
    const noseW = 6 * traits.noseWidth;
    ctx.strokeStyle = `rgba(${traits.skinColor.r * 150}, ${traits.skinColor.g * 120}, ${traits.skinColor.b * 100}, 0.5)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - noseW, cy + 8);
    ctx.quadraticCurveTo(cx, cy + 14, cx + noseW, cy + 8);
    ctx.stroke();

    // ── Mouth ──
    const mw = 18 * traits.mouthWidth;
    const mouthY = cy + 30;
    ctx.strokeStyle = `rgba(180, 80, 80, 0.6)`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - mw, mouthY);
    ctx.quadraticCurveTo(cx, mouthY + 12 * traits.mouthCurve, cx + mw, mouthY);
    ctx.stroke();

    tex.update();

    const mat = new StandardMaterial("faceOverlayMat", scene);
    mat.diffuseTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.emissiveColor = Color3.White();
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    plane.material = mat;

    return plane;
}

// ─── Avatar rig interface ───

export interface AvatarRig {
    root: TransformNode;
    head: Mesh;
    headBaseY: number;
    idleAnim: AnimationGroup | null;
    walkAnim: AnimationGroup | null;
    runAnim: AnimationGroup | null;
    walkWeight: number;
    walkSpeed: number;
}

// ─── Animation blending helper ───

export function blendWalkAnimation(rig: AvatarRig, isMoving: boolean, dt: number): void {
    if (!rig.idleAnim || !rig.walkAnim) return;

    if (isMoving) {
        rig.walkWeight = Math.min(1, rig.walkWeight + dt * 6);
    } else {
        rig.walkWeight = Math.max(0, rig.walkWeight - dt * 6);
    }

    rig.walkAnim.setWeightForAllAnimatables(rig.walkWeight);
    rig.idleAnim.setWeightForAllAnimatables(1 - rig.walkWeight);
}

// ─── Default clothing colors (neutral — NOT address-derived) ───

const DEFAULT_CLOTHING: Record<string, [number, number, number] | "skin"> = {
    "T-shirt": [0.95, 0.95, 0.95],  // white T-shirt
    "short":   [0.05, 0.05, 0.06],  // black pants
    "belt":    [0.08, 0.08, 0.08],  // black belt
    "brown":   "skin",              // barefoot — match skin tone
};

// ─── Main avatar builder ───

export async function buildAvatar(
    scene: Scene,
    address: string,
    shadow?: ShadowGenerator,
): Promise<AvatarRig> {
    const result = await SceneLoader.ImportMeshAsync(
        "",
        "/models/",
        "HVGirl.glb",
        scene,
    );

    const root = result.meshes[0] as unknown as TransformNode;
    const traits = addressToTraits(address);

    // Scale — address-derived height
    root.scaling.setAll(traits.scale);

    // GLB uses rotationQuaternion — clear for Euler
    root.rotationQuaternion = null;

    // ── Apply bone scaling for body proportions ──
    const boneNames: Record<string, (t: TransformNode) => void> = {
        "mixamorig:Spine2": (node) => {
            node.scaling.x = traits.shoulderWidth;
        },
        "mixamorig:Hips": (node) => {
            node.scaling.x = traits.hipWidth;
        },
        "mixamorig:LeftArm": (node) => {
            node.scaling.y = traits.upperArmLength;
        },
        "mixamorig:RightArm": (node) => {
            node.scaling.y = traits.upperArmLength;
        },
        "mixamorig:LeftUpLeg": (node) => {
            node.scaling.y = traits.upperLegLength;
        },
        "mixamorig:RightUpLeg": (node) => {
            node.scaling.y = traits.upperLegLength;
        },
        "mixamorig:Spine1": (node) => {
            node.scaling.y = traits.spineLength;
        },
        "mixamorig:Head": (node) => {
            node.scaling.x = traits.headScaleX;
            node.scaling.y = traits.headScaleY;
            node.scaling.z = traits.headScaleZ;
        },
    };

    let headBone: TransformNode | null = null;

    const allNodes = root.getChildTransformNodes(false);
    for (const node of allNodes) {
        const fn = boneNames[node.name];
        if (fn) fn(node);
        if (node.name === "mixamorig:Head") headBone = node;
    }

    // ── Find head mesh for camera targeting ──
    let headMesh: Mesh | null = null;
    for (const m of result.meshes) {
        const name = m.name.toLowerCase();
        if (name.includes("head") || name.includes("face")) {
            headMesh = m as Mesh;
            break;
        }
    }
    if (!headMesh && result.meshes.length > 1) {
        headMesh = result.meshes[1] as Mesh;
    }

    // ── Shadows ──
    if (shadow) {
        result.meshes.forEach((m) => {
            shadow.addShadowCaster(m as Mesh);
            m.receiveShadows = true;
        });
    }

    // ── Apply innate material colors ──
    const innateColors: Record<string, Color3> = {
        "skin": traits.skinColor,
        "hair": traits.hairColor,
        "iris": traits.eyeColor,
        "iris dark": traits.eyeDarkColor,
    };

    // Strip Babylon.js suffixes like " #1", " #2" from material names
    function baseName(name: string): string {
        return name.replace(/ #\d+$/, "");
    }

    function getTargetColor(name: string): Color3 | null {
        const base = baseName(name);
        if (innateColors[base]) return innateColors[base];
        const clothVal = DEFAULT_CLOTHING[base];
        if (clothVal) {
            return clothVal === "skin"
                ? traits.skinColor
                : new Color3(clothVal[0], clothVal[1], clothVal[2]);
        }
        return null;
    }

    // Create a fresh PBRMaterial with the target color — NO textures, just solid color
    function makeColoredMaterial(original: PBRMaterial | StandardMaterial, color: Color3, suffix: string): PBRMaterial {
        const mat = new PBRMaterial(baseName(original.name) + "_" + suffix, scene);
        mat.albedoColor = color;
        mat.albedoTexture = null;  // Force solid color — remove any baked texture
        mat.metallic = 0;
        mat.roughness = 1;
        if (original instanceof PBRMaterial) {
            mat.metallic = original.metallic ?? 0;
            mat.roughness = original.roughness ?? 1;
        }
        return mat;
    }

    const addrSuffix = address.slice(2, 8);

    // Diagnostic: log all mesh/material info for debugging
    console.log(`[Avatar ${address.slice(0, 10)}] traits:`, {
        gender: traits.gender,
        scale: traits.scale.toFixed(4),
        skin: `rgb(${(traits.skinColor.r * 255)|0},${(traits.skinColor.g * 255)|0},${(traits.skinColor.b * 255)|0})`,
        hair: `rgb(${(traits.hairColor.r * 255)|0},${(traits.hairColor.g * 255)|0},${(traits.hairColor.b * 255)|0})`,
    });

    // Apply colors to all meshes — handles both MultiMaterial and direct material
    for (const m of result.meshes) {
        m.hasVertexAlpha = false;

        // Path 1: MultiMaterial (single mesh with multiple primitives)
        const multiMat = m.material;
        if (multiMat && "subMaterials" in multiMat) {
            const subs = (multiMat as { subMaterials: (PBRMaterial | StandardMaterial | null)[] }).subMaterials;
            console.log(`[Avatar ${addrSuffix}] MultiMaterial found with ${subs.length} subs:`,
                subs.map((s) => s?.name).join(", "));
            for (let i = 0; i < subs.length; i++) {
                const sub = subs[i];
                if (!sub) continue;
                const color = getTargetColor(sub.name);
                if (!color) continue;
                console.log(`[Avatar ${addrSuffix}] coloring sub "${sub.name}" → rgb(${(color.r*255)|0},${(color.g*255)|0},${(color.b*255)|0})`);
                subs[i] = makeColoredMaterial(sub, color, addrSuffix);
            }
            continue;
        }

        // Path 2: Direct material (one material per mesh/primitive)
        if (m.material) {
            const color = getTargetColor(m.material.name);
            if (color) {
                console.log(`[Avatar ${addrSuffix}] coloring mesh "${m.name}" mat "${m.material.name}" → rgb(${(color.r*255)|0},${(color.g*255)|0},${(color.b*255)|0})`);
                m.material = makeColoredMaterial(
                    m.material as PBRMaterial | StandardMaterial,
                    color,
                    addrSuffix,
                );
            } else {
                console.log(`[Avatar ${addrSuffix}] SKIPPED mesh "${m.name}" mat "${m.material.name}" (no color mapping)`);
            }
        }
    }

    // Log bone scaling results
    console.log(`[Avatar ${addrSuffix}] bone scaling applied:`,
        allNodes.filter((n) => boneNames[n.name]).map((n) => n.name).join(", ") || "NONE FOUND");

    // ── Face overlay (eyebrows, nose hint, mouth) ──
    if (headBone) {
        buildFaceOverlay(scene, headBone, traits);
    }

    // ── Animations ──
    let idleAnim: AnimationGroup | null = null;
    let walkAnim: AnimationGroup | null = null;
    let runAnim: AnimationGroup | null = null;

    for (const ag of result.animationGroups) {
        const name = ag.name;
        if (name === "Idle") idleAnim = ag;
        else if (name === "Walking") walkAnim = ag;
        else if (name === "Samba") runAnim = ag;
    }

    result.animationGroups.forEach((ag) => ag.stop());

    if (idleAnim) {
        idleAnim.start(true);
        idleAnim.setWeightForAllAnimatables(1.0);
    }
    if (walkAnim) {
        walkAnim.start(true);
        walkAnim.setWeightForAllAnimatables(0);
    }
    if (runAnim) {
        runAnim.start(true);
        runAnim.setWeightForAllAnimatables(0);
    }

    const headBaseY = 1.7 * (traits.scale / 0.1);

    // Froude-number-based walking speed: v ∝ √(height), +5% for male
    const heightFactor = traits.scale / 0.10;
    const genderFactor = traits.gender === "male" ? 1.025 : 0.975;
    const walkSpeed = 0.08 * Math.sqrt(heightFactor) * genderFactor;

    return {
        root: root as unknown as TransformNode,
        head: (headMesh ?? result.meshes[0]) as Mesh,
        headBaseY,
        idleAnim,
        walkAnim,
        runAnim,
        walkWeight: 0,
        walkSpeed,
    };
}

// ─── Chat bubble (3D speech bubble above avatar) ───

export function buildChatBubble(
    scene: Scene,
    parent: TransformNode,
    text: string,
): Mesh {
    const charWidth = 14;
    const maxChars = 30;
    const displayText = text.length > maxChars ? text.slice(0, maxChars - 1) + "…" : text;
    const textWidth = Math.max(displayText.length * charWidth, 80);
    const canvasWidth = Math.min(textWidth + 40, 512);
    const planeWidth = (canvasWidth / 512) * 3;

    const plane = MeshBuilder.CreatePlane("chatBubble", { width: planeWidth, height: 0.4 }, scene);
    plane.position.y = 3.0;
    plane.parent = parent;
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;

    const tex = new DynamicTexture("chatTex", { width: 512, height: 64 }, scene, false);
    tex.hasAlpha = true;
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 512, 64);

    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.beginPath();
    ctx.roundRect(4, 4, 504, 56, 28);
    ctx.fill();

    ctx.font = "bold 26px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(displayText, 256, 32);
    tex.update();

    const mat = new StandardMaterial("chatMat", scene);
    mat.diffuseTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.emissiveColor = Color3.White();
    mat.disableLighting = true;
    plane.material = mat;

    return plane;
}

// ─── Address label (3D text plane) ───

export function buildAddressLabel(
    scene: Scene,
    parent: TransformNode,
    address: string,
    isSelf = false,
): Mesh {
    const label = truncateAddress(address);
    const traits = addressToTraits(address);
    const plane = MeshBuilder.CreatePlane("label", { width: 2, height: 0.3 }, scene);
    plane.position.y = 2.5 * (traits.scale / 0.1);
    plane.parent = parent;
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;

    const tex = new DynamicTexture("labelTex", { width: 512, height: 64 }, scene, false);
    tex.hasAlpha = true;
    const labelCtx = tex.getContext() as unknown as CanvasRenderingContext2D;
    labelCtx.clearRect(0, 0, 512, 64);

    labelCtx.fillStyle = "rgba(0, 0, 0, 0.6)";
    labelCtx.beginPath();
    labelCtx.roundRect(8, 8, 496, 48, 24);
    labelCtx.fill();

    labelCtx.font = "bold 28px monospace";
    labelCtx.fillStyle = isSelf ? "#ff4444" : "#ffffff";
    labelCtx.textAlign = "center";
    labelCtx.textBaseline = "middle";
    labelCtx.fillText(label, 256, 32);
    tex.update();

    const mat = new StandardMaterial("labelMat", scene);
    mat.diffuseTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.emissiveColor = Color3.White();
    mat.disableLighting = true;
    plane.material = mat;
    return plane;
}
