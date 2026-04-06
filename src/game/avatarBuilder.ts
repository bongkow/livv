/*
 * @Module: AvatarBuilder
 * @Purpose: Shared 3D avatar builder — realistic human-like Babylon.js character
 * @Logic: Parses address hex bytes to select skin tone, hair color, eye color, shirt hue,
 *         and facial feature proportions. Builds character with capsule-based limbs,
 *         organic torso, and PBR materials for realistic appearance.
 * @Interfaces: buildAvatar(scene, address, shadow?) → AvatarRig, buildAddressLabel(scene, parent, address)
 * @Constraints: Requires @babylonjs/core.
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
} from "@babylonjs/core";
import { truncateAddress } from "@/utils/truncateAddress";

// ─── Palette ───

const SKIN_TONES = [
    "#FFDBB4", "#EDB98A", "#D08B5B", "#AE5D29",
    "#794528", "#613318", "#F5D6B8", "#C68642",
];

const HAIR_COLORS = [
    "#2C1B18", "#4A3728", "#8B6914", "#D4A03C",
    "#C0392B", "#E67E22", "#7F8C8D", "#F0E6D3",
];

function parseAddressBytes(address: string): number[] {
    const hex = address.replace(/^0x/i, "").toLowerCase();
    const bytes: number[] = [];
    for (let i = 0; i < hex.length && bytes.length < 20; i += 2) {
        bytes.push(parseInt(hex.substring(i, i + 2), 16));
    }
    return bytes;
}

// ─── PBR skin material ───

function makeSkinMat(scene: Scene, name: string, color: Color3): PBRMaterial {
    const mat = new PBRMaterial(name, scene);
    mat.albedoColor = color;
    mat.roughness = 0.65;
    mat.metallic = 0;
    mat.subSurface.isTranslucencyEnabled = true;
    mat.subSurface.translucencyIntensity = 0.3;
    mat.subSurface.tintColor = color.scale(0.8);
    return mat;
}

// ─── PBR cloth material ───

function makeClothMat(scene: Scene, name: string, color: Color3, roughness = 0.85): PBRMaterial {
    const mat = new PBRMaterial(name, scene);
    mat.albedoColor = color;
    mat.roughness = roughness;
    mat.metallic = 0;
    return mat;
}

// ─── Simple opaque material (for small details) ───

function makeMat(scene: Scene, name: string, color: Color3): StandardMaterial {
    const mat = new StandardMaterial(name, scene);
    mat.diffuseColor = color;
    mat.specularColor = new Color3(0.15, 0.15, 0.15);
    mat.alpha = 1.0;
    mat.transparencyMode = 0;
    return mat;
}

// ─── Capsule limb helper ───

function createCapsuleLimb(
    scene: Scene,
    name: string,
    parent: TransformNode,
    mat: PBRMaterial | StandardMaterial,
    height: number,
    radius: number,
    x: number,
    y: number,
    z: number,
): Mesh {
    const limb = MeshBuilder.CreateCapsule(
        name,
        { height, radius, tessellation: 16, subdivisions: 6, capSubdivisions: 8 },
        scene,
    );
    limb.position.set(x, y, z);
    limb.parent = parent;
    limb.material = mat;
    return limb;
}

// ─── Avatar rig interface ───

export interface AvatarRig {
    root: TransformNode;
    head: Mesh;
    headBaseY: number;
    leftArmPivot: TransformNode;
    rightArmPivot: TransformNode;
    leftLegPivot: TransformNode;
    rightLegPivot: TransformNode;
}

// ─── Avatar builder ───

export function buildAvatar(
    scene: Scene,
    address: string,
    shadow?: ShadowGenerator,
): AvatarRig {
    const bytes = parseAddressBytes(address);
    const skinTone = SKIN_TONES[bytes[0] % SKIN_TONES.length];
    const hairColor = HAIR_COLORS[bytes[2] % HAIR_COLORS.length];
    const skinColor = Color3.FromHexString(skinTone);
    const hairCol = Color3.FromHexString(hairColor);

    // ── Gender & height ──
    const isFemale = bytes[1] % 2 === 0;
    const heightByte = bytes[14] ?? 128;
    const heightBase = isFemale ? 1.55 : 1.70;
    const heightRange = 0.20;
    const heightScale = (heightBase + (heightByte / 255) * heightRange) / 1.82;

    // ── Gender-dependent body proportions ──
    const shoulderX = isFemale ? 0.22 : 0.28;
    const hipX = isFemale ? 0.13 : 0.11;
    const limbScale = isFemale ? 0.82 : 1.0;

    const root = new TransformNode("player", scene);

    // ── Materials ──
    const skinMat = makeSkinMat(scene, "skinMat", skinColor);
    const hairMat = makeClothMat(scene, "hairMat", hairCol, 0.7);
    const hue = ((bytes[12] ?? 128) / 255) * 360;
    const shirtColor = Color3.FromHSV(hue, 0.45, 0.7);
    const shirtMat = makeClothMat(scene, "shirtMat", shirtColor);
    const pantsMat = makeClothMat(scene, "pantsMat", new Color3(0.15, 0.15, 0.28));
    const shoeMat = makeClothMat(scene, "shoeMat", new Color3(0.22, 0.22, 0.22), 0.5);

    // ═══════════════════════════════════════
    //  HEAD — organic shape with jaw and chin
    // ═══════════════════════════════════════

    const headY = 1.82;

    // Cranium — slightly elongated sphere
    const head = MeshBuilder.CreateSphere("head", {
        diameterX: 0.50, diameterY: 0.56, diameterZ: 0.50, segments: 16,
    }, scene);
    head.position.y = headY;
    head.parent = root;
    head.material = skinMat;

    // Jaw — flattened sphere extending below the cranium
    const jaw = MeshBuilder.CreateSphere("jaw", {
        diameterX: 0.40, diameterY: 0.26, diameterZ: 0.38, segments: 12,
    }, scene);
    jaw.position.set(0, headY - 0.18, 0.02);
    jaw.parent = root;
    jaw.material = skinMat;

    // Chin
    const chin = MeshBuilder.CreateSphere("chin", {
        diameterX: 0.14, diameterY: 0.10, diameterZ: 0.12, segments: 8,
    }, scene);
    chin.position.set(0, headY - 0.26, 0.12);
    chin.parent = root;
    chin.material = skinMat;

    // ── Eyes ──
    const EYE_COLORS = [
        "#2E86C1", "#1B4F72", "#27AE60", "#6C3483",
        "#784212", "#1C1C1C",
    ];
    const eyeColorHex = EYE_COLORS[bytes[6] % EYE_COLORS.length];
    const eyeColor = Color3.FromHexString(eyeColorHex);

    const eyeSizeVariant = bytes[5] % 4;
    const eyeScale = 0.055 + eyeSizeVariant * 0.005;
    const eyeSpacing = 0.085;
    const eyeYOffset = -0.02;
    const eyeZOffset = 0.23;

    const whiteMat = makeMat(scene, "eyeWhiteMat", Color3.White());
    whiteMat.specularColor = new Color3(0.4, 0.4, 0.4);
    const irisMat = makeMat(scene, "irisMat", eyeColor);
    const pupilMat = makeMat(scene, "pupilMat", new Color3(0.02, 0.02, 0.02));

    for (const side of [-1, 1]) {
        const prefix = side === -1 ? "left" : "right";
        const ex = side * eyeSpacing;

        // Sclera
        const sclera = MeshBuilder.CreateSphere(`${prefix}Sclera`, {
            diameterX: eyeScale * 1.8,
            diameterY: eyeScale * 1.1,
            diameterZ: eyeScale * 0.35,
            segments: 12,
        }, scene);
        sclera.position.set(ex, headY + eyeYOffset, eyeZOffset);
        sclera.parent = root;
        sclera.material = whiteMat;

        // Iris
        const iris = MeshBuilder.CreateSphere(`${prefix}Iris`, {
            diameterX: eyeScale * 0.85,
            diameterY: eyeScale * 0.85,
            diameterZ: eyeScale * 0.2,
            segments: 12,
        }, scene);
        iris.position.set(ex, headY + eyeYOffset, eyeZOffset + eyeScale * 0.12);
        iris.parent = root;
        iris.material = irisMat;

        // Pupil
        const pupil = MeshBuilder.CreateSphere(`${prefix}Pupil`, {
            diameterX: eyeScale * 0.4,
            diameterY: eyeScale * 0.4,
            diameterZ: eyeScale * 0.12,
            segments: 10,
        }, scene);
        pupil.position.set(ex, headY + eyeYOffset, eyeZOffset + eyeScale * 0.18);
        pupil.parent = root;
        pupil.material = pupilMat;
    }

    // ── Eyebrows ──
    const browShapeVariant = bytes[10] % 4;
    const browThicknessVariant = bytes[9] % 3;
    const browWidthVariant = bytes[11] % 3;
    const browVerticalVariant = bytes[13] % 3;

    const browAngle =
        browShapeVariant === 1 ? -0.18 :
        browShapeVariant === 2 ? 0.15 :
        browShapeVariant === 3 ? 0.25 :
        0;
    const browThickness = 0.012 + browThicknessVariant * 0.005;
    const browWidth = 0.085 + browWidthVariant * 0.012;
    const browYExtra = -0.01 + browVerticalVariant * 0.01;

    const browMat = makeClothMat(scene, "browMat", hairCol.scale(0.7));

    for (const side of [-1, 1]) {
        const prefix = side === -1 ? "left" : "right";
        const brow = MeshBuilder.CreateCapsule(`${prefix}Brow`, {
            height: browWidth,
            radius: browThickness,
            tessellation: 8,
            subdivisions: 2,
            capSubdivisions: 4,
        }, scene);
        brow.position.set(
            side * eyeSpacing,
            headY + eyeYOffset + eyeScale * 0.9 + browYExtra,
            eyeZOffset + 0.02,
        );
        brow.rotation.z = Math.PI / 2 + side * browAngle;
        brow.parent = root;
        brow.material = browMat;
    }

    // ── Nose ──
    const noseVariant = bytes[7] % 4;
    const noseWidth = 0.035 + noseVariant * 0.005;
    const noseHeight = 0.045 + noseVariant * 0.004;
    const noseMat = makeSkinMat(scene, "noseMat", skinColor.scale(0.92));

    // Nose bridge
    const noseBridge = MeshBuilder.CreateCapsule("noseBridge", {
        height: noseHeight * 2,
        radius: noseWidth * 0.6,
        tessellation: 10,
        subdivisions: 3,
        capSubdivisions: 6,
    }, scene);
    noseBridge.position.set(0, headY - 0.05, eyeZOffset + 0.01);
    noseBridge.parent = root;
    noseBridge.material = noseMat;

    // Nose tip
    const noseTip = MeshBuilder.CreateSphere("noseTip", {
        diameterX: noseWidth * 2.2,
        diameterY: noseHeight * 1.2,
        diameterZ: 0.04,
        segments: 10,
    }, scene);
    noseTip.position.set(0, headY - 0.08, eyeZOffset + 0.04);
    noseTip.parent = root;
    noseTip.material = noseMat;

    // ── Mouth ──
    const mouthVariant = bytes[8] % 4;
    const mouthWidth = mouthVariant === 2 ? 0.09 : mouthVariant === 3 ? 0.045 : 0.065;
    const mouthMat = makeMat(scene, "mouthMat", new Color3(0.7, 0.2, 0.18));

    // Lips using capsule for smoother shape
    const upperLip = MeshBuilder.CreateCapsule("upperLip", {
        height: mouthWidth * 2,
        radius: 0.012,
        tessellation: 10,
        subdivisions: 2,
        capSubdivisions: 4,
    }, scene);
    upperLip.position.set(0, headY - 0.155, eyeZOffset - 0.01);
    upperLip.rotation.z = Math.PI / 2;
    upperLip.parent = root;
    upperLip.material = mouthMat;

    const lowerLip = MeshBuilder.CreateCapsule("lowerLip", {
        height: mouthWidth * 1.6,
        radius: 0.014,
        tessellation: 10,
        subdivisions: 2,
        capSubdivisions: 4,
    }, scene);
    lowerLip.position.set(0, headY - 0.175, eyeZOffset - 0.015);
    lowerLip.rotation.z = Math.PI / 2;
    lowerLip.parent = root;
    lowerLip.material = mouthMat;

    // ── Ears ──
    for (const side of [-1, 1]) {
        const ear = MeshBuilder.CreateSphere(side === -1 ? "leftEar" : "rightEar", {
            diameterX: 0.05, diameterY: 0.10, diameterZ: 0.035, segments: 8,
        }, scene);
        ear.position.set(side * 0.25, headY - 0.02, 0);
        ear.parent = root;
        ear.material = skinMat;
    }

    // ── Hair — overlapping spheres for natural cap ──
    const hairTop = MeshBuilder.CreateSphere("hairTop", {
        diameterX: 0.54, diameterY: 0.26, diameterZ: 0.54, segments: 12,
    }, scene);
    hairTop.position.set(0, headY + 0.20, -0.01);
    hairTop.parent = root;
    hairTop.material = hairMat;

    const hairBack = MeshBuilder.CreateSphere("hairBack", {
        diameterX: 0.52, diameterY: 0.48, diameterZ: 0.28, segments: 12,
    }, scene);
    hairBack.position.set(0, headY + 0.06, -0.16);
    hairBack.parent = root;
    hairBack.material = hairMat;

    for (const side of [-1, 1]) {
        const hairSide = MeshBuilder.CreateSphere(side === -1 ? "hairLeft" : "hairRight", {
            diameterX: 0.16, diameterY: 0.34, diameterZ: 0.40, segments: 10,
        }, scene);
        hairSide.position.set(side * 0.21, headY + 0.08, -0.06);
        hairSide.parent = root;
        hairSide.material = hairMat;
    }

    // Front fringe
    const hairFront = MeshBuilder.CreateSphere("hairFront", {
        diameterX: 0.48, diameterY: 0.12, diameterZ: 0.20, segments: 10,
    }, scene);
    hairFront.position.set(0, headY + 0.18, 0.12);
    hairFront.parent = root;
    hairFront.material = hairMat;

    // ═══════════════════════════════════════
    //  NECK — capsule for smooth connection
    // ═══════════════════════════════════════

    const neckDiam = isFemale ? 0.06 : 0.075;
    createCapsuleLimb(scene, "neck", root, skinMat, 0.22, neckDiam, 0, 1.52, 0);

    // ═══════════════════════════════════════
    //  TORSO — overlapping spheres for organic shape
    // ═══════════════════════════════════════

    // Upper chest
    const chest = MeshBuilder.CreateSphere("chest", {
        diameterX: isFemale ? 0.42 : 0.50,
        diameterY: 0.32,
        diameterZ: isFemale ? 0.30 : 0.32,
        segments: 14,
    }, scene);
    chest.position.y = 1.32;
    chest.parent = root;
    chest.material = shirtMat;

    // Mid torso
    const midTorso = MeshBuilder.CreateSphere("midTorso", {
        diameterX: isFemale ? 0.38 : 0.46,
        diameterY: 0.28,
        diameterZ: isFemale ? 0.26 : 0.30,
        segments: 14,
    }, scene);
    midTorso.position.y = 1.12;
    midTorso.parent = root;
    midTorso.material = shirtMat;

    // Waist connector
    const waist = MeshBuilder.CreateSphere("waist", {
        diameterX: isFemale ? 0.32 : 0.40,
        diameterY: 0.20,
        diameterZ: isFemale ? 0.24 : 0.28,
        segments: 12,
    }, scene);
    waist.position.y = 0.98;
    waist.parent = root;
    waist.material = shirtMat;

    // Hips
    const hips = MeshBuilder.CreateSphere("hips", {
        diameterX: isFemale ? 0.42 : 0.40,
        diameterY: 0.22,
        diameterZ: isFemale ? 0.30 : 0.28,
        segments: 12,
    }, scene);
    hips.position.y = 0.87;
    hips.parent = root;
    hips.material = pantsMat;

    // ═══════════════════════════════════════
    //  SHOULDERS — smooth spherical joints
    // ═══════════════════════════════════════

    const shoulderY = 1.38;
    const shoulderSize = isFemale ? 0.10 : 0.13;
    for (const side of [-1, 1]) {
        const shoulder = MeshBuilder.CreateSphere(
            side === -1 ? "leftShoulder" : "rightShoulder",
            { diameter: shoulderSize, segments: 10 },
            scene,
        );
        shoulder.position.set(side * shoulderX, shoulderY, 0);
        shoulder.parent = root;
        shoulder.material = shirtMat;
    }

    // ═══════════════════════════════════════
    //  ARMS — capsule-based for smooth rounded limbs
    // ═══════════════════════════════════════

    const armUpperLen = isFemale ? 0.30 : 0.34;
    const armLowerLen = isFemale ? 0.28 : 0.32;
    const armRadius = 0.045 * limbScale;

    const leftArmPivot = new TransformNode("leftArmPivot", scene);
    leftArmPivot.position.set(-shoulderX, shoulderY, 0);
    leftArmPivot.parent = root;

    const rightArmPivot = new TransformNode("rightArmPivot", scene);
    rightArmPivot.position.set(shoulderX, shoulderY, 0);
    rightArmPivot.parent = root;

    for (const side of [-1, 1]) {
        const prefix = side === -1 ? "left" : "right";
        const pivot = side === -1 ? leftArmPivot : rightArmPivot;

        // Upper arm — capsule
        createCapsuleLimb(scene, `${prefix}UpperArm`, pivot, skinMat,
            armUpperLen, armRadius,
            0, -armUpperLen / 2 - 0.04, 0);

        // Forearm — capsule (slightly thinner)
        const elbowRelY = -armUpperLen - 0.04;
        createCapsuleLimb(scene, `${prefix}Forearm`, pivot, skinMat,
            armLowerLen, armRadius * 0.88,
            0, elbowRelY - armLowerLen / 2, 0);

        // Hand — organic sphere
        const handRelY = elbowRelY - armLowerLen;
        const hand = MeshBuilder.CreateSphere(
            `${prefix}Hand`, {
                diameterX: 0.08 * limbScale,
                diameterY: 0.10 * limbScale,
                diameterZ: 0.05 * limbScale,
                segments: 10,
            }, scene,
        );
        hand.position.set(0, handRelY, 0);
        hand.parent = pivot;
        hand.material = skinMat;
    }

    // ═══════════════════════════════════════
    //  LEGS — capsule-based for smooth rounded limbs
    // ═══════════════════════════════════════

    const hipY = 0.82;
    const legUpperLen = 0.40;
    const legLowerLen = 0.38;
    const legRadius = 0.055 * limbScale;

    const leftLegPivot = new TransformNode("leftLegPivot", scene);
    leftLegPivot.position.set(-hipX, hipY, 0);
    leftLegPivot.parent = root;

    const rightLegPivot = new TransformNode("rightLegPivot", scene);
    rightLegPivot.position.set(hipX, hipY, 0);
    rightLegPivot.parent = root;

    for (const side of [-1, 1]) {
        const prefix = side === -1 ? "left" : "right";
        const pivot = side === -1 ? leftLegPivot : rightLegPivot;

        // Thigh — capsule
        createCapsuleLimb(scene, `${prefix}Thigh`, pivot, pantsMat,
            legUpperLen, legRadius,
            0, -legUpperLen / 2 - 0.02, 0);

        // Shin — capsule (slightly thinner)
        const kneeRelY = -legUpperLen - 0.02;
        createCapsuleLimb(scene, `${prefix}Shin`, pivot, pantsMat,
            legLowerLen, legRadius * 0.85,
            0, kneeRelY - legLowerLen / 2, 0);

        // Foot — capsule oriented forward
        const ankleRelY = kneeRelY - legLowerLen;
        const foot = MeshBuilder.CreateCapsule(
            `${prefix}Foot`,
            { height: 0.20 * limbScale, radius: 0.04, tessellation: 10, subdivisions: 3, capSubdivisions: 6 },
            scene,
        );
        foot.position.set(0, ankleRelY - 0.02, 0.04);
        foot.rotation.x = Math.PI / 2; // orient forward
        foot.parent = pivot;
        foot.material = shoeMat;
    }

    // ── Ensure all meshes are fully opaque ──
    root.getChildMeshes().forEach((m) => {
        m.hasVertexAlpha = false;
    });

    // ── Shadows ──
    if (shadow) {
        root.getChildMeshes().forEach((m) => {
            shadow.addShadowCaster(m as Mesh);
            m.receiveShadows = true;
        });
    }

    // ── Height scaling ──
    root.scaling.setAll(heightScale);

    return { root, head, headBaseY: headY, leftArmPivot, rightArmPivot, leftLegPivot, rightLegPivot };
}

// ─── Address label (3D text plane) ───

export function buildAddressLabel(
    scene: Scene,
    parent: TransformNode,
    address: string,
    isSelf = false,
): Mesh {
    const label = truncateAddress(address);
    const plane = MeshBuilder.CreatePlane("label", { width: 2, height: 0.3 }, scene);
    plane.position.y = 2.5;
    plane.parent = parent;
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;

    const tex = new DynamicTexture("labelTex", { width: 512, height: 64 }, scene, false);
    tex.hasAlpha = true;
    const labelCtx = tex.getContext() as unknown as CanvasRenderingContext2D;
    labelCtx.clearRect(0, 0, 512, 64);

    // Background pill
    labelCtx.fillStyle = "rgba(0, 0, 0, 0.6)";
    labelCtx.beginPath();
    labelCtx.roundRect(8, 8, 496, 48, 24);
    labelCtx.fill();

    // Text — red for self, white for others
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
