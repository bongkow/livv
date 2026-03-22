/*
 * @Module: AvatarBuilder
 * @Purpose: Shared 3D avatar builder — deterministic human-like Babylon.js character
 * @Logic: Parses address hex bytes to select skin tone, hair color, eye color, shirt hue,
 *         and facial feature proportions. Builds full 3D character with anatomical detail.
 * @Interfaces: buildAvatar(scene, address, shadow?), buildAddressLabel(scene, parent, address)
 * @Constraints: Requires @babylonjs/core.
 */

import {
    Scene,
    MeshBuilder,
    StandardMaterial,
    TransformNode,
    DynamicTexture,
    Color3,
    Mesh,
    ShadowGenerator,
} from "@babylonjs/core";
import { truncateAddress } from "@/utils/truncateAddress";

// ─── Palette (matches faceAvatar.ts / bodyAvatar.ts) ───

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

// ─── Material cache (avoids creating duplicate materials) ───

function makeMat(scene: Scene, name: string, color: Color3): StandardMaterial {
    const mat = new StandardMaterial(name, scene);
    mat.diffuseColor = color;
    mat.specularColor = new Color3(0.15, 0.15, 0.15);
    return mat;
}

// ─── Limb builder helpers ───

function createLimb(
    scene: Scene,
    name: string,
    parent: TransformNode,
    mat: StandardMaterial,
    height: number,
    diameterTop: number,
    diameterBottom: number,
    x: number,
    y: number,
    z: number,
): Mesh {
    const limb = MeshBuilder.CreateCylinder(
        name,
        { height, diameterTop, diameterBottom, tessellation: 12 },
        scene,
    );
    limb.position.set(x, y, z);
    limb.parent = parent;
    limb.material = mat;
    return limb;
}

function createJoint(
    scene: Scene,
    name: string,
    parent: TransformNode,
    mat: StandardMaterial,
    diameter: number,
    x: number,
    y: number,
    z: number,
): Mesh {
    const joint = MeshBuilder.CreateSphere(
        name,
        { diameter, segments: 8 },
        scene,
    );
    joint.position.set(x, y, z);
    joint.parent = parent;
    joint.material = mat;
    return joint;
}

// ─── Avatar builder ───

export function buildAvatar(
    scene: Scene,
    address: string,
    shadow?: ShadowGenerator,
): TransformNode {
    const bytes = parseAddressBytes(address);
    const skinTone = SKIN_TONES[bytes[0] % SKIN_TONES.length];
    const hairColor = HAIR_COLORS[bytes[2] % HAIR_COLORS.length];
    const skinColor = Color3.FromHexString(skinTone);
    const hairCol = Color3.FromHexString(hairColor);

    const root = new TransformNode("player", scene);

    // ── Materials ──
    const skinMat = makeMat(scene, "skinMat", skinColor);
    const hairMat = makeMat(scene, "hairMat", hairCol);
    const hue = ((bytes[12] ?? 128) / 255) * 360;
    const shirtColor = Color3.FromHSV(hue, 0.45, 0.7);
    const shirtMat = makeMat(scene, "shirtMat", shirtColor);
    const pantsMat = makeMat(scene, "pantsMat", new Color3(0.15, 0.15, 0.28));
    const shoeMat = makeMat(scene, "shoeMat", new Color3(0.22, 0.22, 0.22));

    // ═══════════════════════════════════════
    //  HEAD — fully 3D face from address bytes
    //  b[5]=eye shape, b[6]=eye color, b[7]=nose,
    //  b[8]=mouth, b[11]=accessory
    // ═══════════════════════════════════════

    const headY = 1.82;
    const EYE_COLORS = [
        "#2E86C1", "#1B4F72", "#27AE60", "#6C3483",
        "#784212", "#1C1C1C",
    ];
    const eyeColorHex = EYE_COLORS[bytes[6] % EYE_COLORS.length];
    const eyeColor = Color3.FromHexString(eyeColorHex);

    // Cranium
    const head = MeshBuilder.CreateSphere("head", { diameterX: 0.52, diameterY: 0.58, diameterZ: 0.52, segments: 12 }, scene);
    head.position.y = headY;
    head.parent = root;
    head.material = skinMat;

    // ── Eyes ──
    // Eye size varies by b[5]
    const eyeSizeVariant = bytes[5] % 4;
    const eyeScale = 0.07 + eyeSizeVariant * 0.008; // 0.07 – 0.094
    const eyeSpacing = 0.10;
    const eyeYOffset = -0.02;
    const eyeZOffset = 0.20;

    const whiteMat = makeMat(scene, "eyeWhiteMat", Color3.White());
    whiteMat.specularColor = new Color3(0.3, 0.3, 0.3);
    const irisMat = makeMat(scene, "irisMat", eyeColor);
    const pupilMat = makeMat(scene, "pupilMat", new Color3(0.05, 0.05, 0.05));

    for (const side of [-1, 1]) {
        const prefix = side === -1 ? "left" : "right";
        const ex = side * eyeSpacing;

        // Sclera (white)
        const sclera = MeshBuilder.CreateSphere(`${prefix}Sclera`, { diameter: eyeScale * 2, segments: 8 }, scene);
        sclera.position.set(ex, headY + eyeYOffset, eyeZOffset);
        sclera.parent = root;
        sclera.material = whiteMat;

        // Iris (colored) — sits just in front of sclera
        const iris = MeshBuilder.CreateSphere(`${prefix}Iris`, { diameter: eyeScale * 1.1, segments: 8 }, scene);
        iris.position.set(ex, headY + eyeYOffset, eyeZOffset + eyeScale * 0.4);
        iris.parent = root;
        iris.material = irisMat;

        // Pupil (black dot) — sits just in front of iris
        const pupil = MeshBuilder.CreateSphere(`${prefix}Pupil`, { diameter: eyeScale * 0.55, segments: 6 }, scene);
        pupil.position.set(ex, headY + eyeYOffset, eyeZOffset + eyeScale * 0.6);
        pupil.parent = root;
        pupil.material = pupilMat;
    }

    // ── Eyebrows ──
    // Angle varies by b[10]
    const browVariant = bytes[10] % 3; // 0=flat, 1=arched, 2=angled
    const browRotX = browVariant === 1 ? -0.15 : browVariant === 2 ? 0.12 : 0;
    const browMat = makeMat(scene, "browMat", hairCol.scale(0.7));

    for (const side of [-1, 1]) {
        const prefix = side === -1 ? "left" : "right";
        const brow = MeshBuilder.CreateBox(`${prefix}Brow`, { width: 0.10, height: 0.015, depth: 0.025 }, scene);
        brow.position.set(side * eyeSpacing, headY + eyeYOffset + eyeScale * 2.2, eyeZOffset + 0.01);
        brow.rotation.z = side * browRotX;
        brow.parent = root;
        brow.material = browMat;
    }

    // ── Nose ──
    // Size varies by b[7]
    const noseVariant = bytes[7] % 4;
    const noseWidth = 0.04 + noseVariant * 0.006;
    const noseHeight = 0.05 + noseVariant * 0.005;
    const noseMat = makeMat(scene, "noseMat", skinColor.scale(0.88));

    const nose = MeshBuilder.CreateSphere("nose", {
        diameterX: noseWidth * 2,
        diameterY: noseHeight * 2,
        diameterZ: 0.05,
        segments: 8,
    }, scene);
    nose.position.set(0, headY - 0.07, eyeZOffset + 0.03);
    nose.parent = root;
    nose.material = noseMat;

    // ── Mouth ──
    // Shape varies by b[8]: 0=smile, 1=neutral, 2=wide smile, 3=small
    const mouthVariant = bytes[8] % 4;
    const mouthWidth = mouthVariant === 2 ? 0.10 : mouthVariant === 3 ? 0.05 : 0.07;
    const mouthMat = makeMat(scene, "mouthMat", new Color3(0.75, 0.22, 0.18));

    const mouth = MeshBuilder.CreateBox("mouth", {
        width: mouthWidth,
        height: 0.015,
        depth: 0.02,
    }, scene);
    mouth.position.set(0, headY - 0.14, eyeZOffset);
    mouth.parent = root;
    mouth.material = mouthMat;

    // Smile curve — slight rotation for smile variants
    if (mouthVariant === 0 || mouthVariant === 2) {
        // Add small spheres at corners angled down for a smile
        for (const side of [-1, 1]) {
            const corner = MeshBuilder.CreateSphere(`mouthCorner${side}`, { diameter: 0.018, segments: 6 }, scene);
            corner.position.set(side * (mouthWidth / 2 + 0.005), headY - 0.145, eyeZOffset);
            corner.parent = root;
            corner.material = mouthMat;
        }
    }

    // ── Ears ──
    for (const side of [-1, 1]) {
        const ear = MeshBuilder.CreateSphere(side === -1 ? "leftEar" : "rightEar", {
            diameterX: 0.06, diameterY: 0.10, diameterZ: 0.04, segments: 6,
        }, scene);
        ear.position.set(side * 0.26, headY - 0.02, 0);
        ear.parent = root;
        ear.material = skinMat;
    }

    // ── Hair — multiple overlapping spheres for a natural cap ──
    // Top of head
    const hairTop = MeshBuilder.CreateSphere("hairTop", { diameterX: 0.56, diameterY: 0.28, diameterZ: 0.56, segments: 10 }, scene);
    hairTop.position.set(0, headY + 0.20, 0);
    hairTop.parent = root;
    hairTop.material = hairMat;

    // Back of head
    const hairBack = MeshBuilder.CreateSphere("hairBack", { diameterX: 0.54, diameterY: 0.50, diameterZ: 0.30, segments: 10 }, scene);
    hairBack.position.set(0, headY + 0.06, -0.16);
    hairBack.parent = root;
    hairBack.material = hairMat;

    // Sides
    for (const side of [-1, 1]) {
        const hairSide = MeshBuilder.CreateSphere(side === -1 ? "hairLeft" : "hairRight", {
            diameterX: 0.18, diameterY: 0.36, diameterZ: 0.42, segments: 8,
        }, scene);
        hairSide.position.set(side * 0.22, headY + 0.08, -0.06);
        hairSide.parent = root;
        hairSide.material = hairMat;
    }

    // ═══════════════════════════════════════
    //  NECK (y ≈ 1.45 – 1.58)
    // ═══════════════════════════════════════

    createLimb(scene, "neck", root, skinMat, 0.16, 0.14, 0.16, 0, 1.50, 0);

    // ═══════════════════════════════════════
    //  TORSO (y ≈ 0.95 – 1.45)
    // ═══════════════════════════════════════

    // Upper torso — broader at shoulders
    const upperTorso = MeshBuilder.CreateCylinder(
        "upperTorso",
        { height: 0.30, diameterTop: 0.48, diameterBottom: 0.52, tessellation: 12 },
        scene,
    );
    upperTorso.position.y = 1.33;
    upperTorso.parent = root;
    upperTorso.material = shirtMat;

    // Mid torso — chest / core
    const midTorso = MeshBuilder.CreateCylinder(
        "midTorso",
        { height: 0.28, diameterTop: 0.52, diameterBottom: 0.44, tessellation: 12 },
        scene,
    );
    midTorso.position.y = 1.08;
    midTorso.parent = root;
    midTorso.material = shirtMat;

    // Lower torso / hips — widens slightly for pelvis
    const lowerTorso = MeshBuilder.CreateCylinder(
        "lowerTorso",
        { height: 0.18, diameterTop: 0.44, diameterBottom: 0.46, tessellation: 12 },
        scene,
    );
    lowerTorso.position.y = 0.90;
    lowerTorso.parent = root;
    lowerTorso.material = pantsMat;

    // ═══════════════════════════════════════
    //  SHOULDERS (spherical joints)
    // ═══════════════════════════════════════

    const shoulderY = 1.40;
    const shoulderX = 0.30;
    createJoint(scene, "leftShoulder", root, shirtMat, 0.16, -shoulderX, shoulderY, 0);
    createJoint(scene, "rightShoulder", root, shirtMat, 0.16, shoulderX, shoulderY, 0);

    // ═══════════════════════════════════════
    //  ARMS (upper arm → elbow → forearm → hand)
    // ═══════════════════════════════════════

    const armUpperLen = 0.30;
    const armLowerLen = 0.28;

    for (const side of [-1, 1]) {
        const prefix = side === -1 ? "left" : "right";
        const sx = side * shoulderX;

        // Upper arm
        createLimb(scene, `${prefix}UpperArm`, root, skinMat,
            armUpperLen, 0.12, 0.11,
            sx, shoulderY - armUpperLen / 2 - 0.06, 0);

        // Elbow joint
        const elbowY = shoulderY - armUpperLen - 0.06;
        createJoint(scene, `${prefix}Elbow`, root, skinMat, 0.12, sx, elbowY, 0);

        // Forearm
        createLimb(scene, `${prefix}Forearm`, root, skinMat,
            armLowerLen, 0.10, 0.08,
            sx, elbowY - armLowerLen / 2, 0);

        // Hand — flattened sphere
        const handY = elbowY - armLowerLen;
        const hand = MeshBuilder.CreateSphere(
            `${prefix}Hand`, { diameterX: 0.10, diameterY: 0.12, diameterZ: 0.06, segments: 8 }, scene,
        );
        hand.position.set(sx, handY, 0);
        hand.parent = root;
        hand.material = skinMat;
    }

    // ═══════════════════════════════════════
    //  LEGS (upper leg → knee → lower leg → foot)
    // ═══════════════════════════════════════

    const hipY = 0.82;
    const hipX = 0.12;
    const legUpperLen = 0.38;
    const legLowerLen = 0.36;

    for (const side of [-1, 1]) {
        const prefix = side === -1 ? "left" : "right";
        const lx = side * hipX;

        // Hip joint
        createJoint(scene, `${prefix}Hip`, root, pantsMat, 0.15, lx, hipY, 0);

        // Upper leg (thigh)
        createLimb(scene, `${prefix}Thigh`, root, pantsMat,
            legUpperLen, 0.15, 0.13,
            lx, hipY - legUpperLen / 2 - 0.04, 0);

        // Knee joint
        const kneeY = hipY - legUpperLen - 0.04;
        createJoint(scene, `${prefix}Knee`, root, pantsMat, 0.13, lx, kneeY, 0);

        // Lower leg (shin)
        createLimb(scene, `${prefix}Shin`, root, pantsMat,
            legLowerLen, 0.12, 0.09,
            lx, kneeY - legLowerLen / 2, 0);

        // Ankle
        const ankleY = kneeY - legLowerLen;
        createJoint(scene, `${prefix}Ankle`, root, skinMat, 0.09, lx, ankleY, 0);

        // Foot — elongated box, extends forward
        const foot = MeshBuilder.CreateBox(
            `${prefix}Foot`,
            { width: 0.12, height: 0.06, depth: 0.22 },
            scene,
        );
        foot.position.set(lx, ankleY - 0.03, 0.04);
        foot.parent = root;
        foot.material = shoeMat;
    }

    // ── Shadows ──
    if (shadow) {
        root.getChildMeshes().forEach((m) => {
            shadow.addShadowCaster(m as Mesh);
            m.receiveShadows = true;
        });
    }

    return root;
}

// ─── Address label (3D text plane) ───

export function buildAddressLabel(
    scene: Scene,
    parent: TransformNode,
    address: string,
): void {
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

    // Text
    labelCtx.font = "bold 28px monospace";
    labelCtx.fillStyle = "#ffffff";
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
}
