/*
 * @Module: AvatarBuilder
 * @Purpose: Shared 3D avatar builder — deterministic human-like Babylon.js character
 * @Logic: Parses address hex bytes to select skin tone, hair color, eye color, shirt hue,
 *         and facial feature proportions. Builds full 3D character with anatomical detail.
 *         Limbs use pivot TransformNodes for walk animation.
 * @Interfaces: buildAvatar(scene, address, shadow?) → AvatarRig, buildAddressLabel(scene, parent, address)
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

    // ── Gender & height (derived from address) ──
    const isFemale = bytes[1] % 2 === 0;
    const heightByte = bytes[14] ?? 128;
    const heightBase = isFemale ? 1.55 : 1.70;
    const heightRange = isFemale ? 0.20 : 0.20; // female: 1.55–1.75m, male: 1.70–1.90m
    const heightScale = (heightBase + (heightByte / 255) * heightRange) / 1.82;

    // ── Gender-dependent body proportions ──
    const shoulderX = isFemale ? 0.24 : 0.30;
    const hipX = isFemale ? 0.14 : 0.12;
    const limbScale = isFemale ? 0.85 : 1.0; // thinner limbs for female

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
    // Eye size varies by b[5]. Uses flattened ellipsoids (thin Z) so they
    // sit flush against the head surface instead of protruding.
    const eyeSizeVariant = bytes[5] % 4;
    const eyeScale = 0.06 + eyeSizeVariant * 0.006; // 0.06 – 0.078 (smaller range)
    const eyeSpacing = 0.09;  // tighter — keeps edges on the face
    const eyeYOffset = -0.02;
    const eyeZOffset = 0.24;  // right on the head surface

    const whiteMat = makeMat(scene, "eyeWhiteMat", Color3.White());
    whiteMat.specularColor = new Color3(0.3, 0.3, 0.3);
    const irisMat = makeMat(scene, "irisMat", eyeColor);
    const pupilMat = makeMat(scene, "pupilMat", new Color3(0.05, 0.05, 0.05));

    for (const side of [-1, 1]) {
        const prefix = side === -1 ? "left" : "right";
        const ex = side * eyeSpacing;

        // Sclera — compact disc, fully on the face
        const sclera = MeshBuilder.CreateSphere(`${prefix}Sclera`, {
            diameterX: eyeScale * 1.8,
            diameterY: eyeScale * 1.2,
            diameterZ: eyeScale * 0.35,
            segments: 10,
        }, scene);
        sclera.position.set(ex, headY + eyeYOffset, eyeZOffset);
        sclera.parent = root;
        sclera.material = whiteMat;

        // Iris — smaller disc sitting just in front of sclera
        const iris = MeshBuilder.CreateSphere(`${prefix}Iris`, {
            diameterX: eyeScale * 0.9,
            diameterY: eyeScale * 0.9,
            diameterZ: eyeScale * 0.2,
            segments: 10,
        }, scene);
        iris.position.set(ex, headY + eyeYOffset, eyeZOffset + eyeScale * 0.12);
        iris.parent = root;
        iris.material = irisMat;

        // Pupil — tiny disc on top of iris
        const pupil = MeshBuilder.CreateSphere(`${prefix}Pupil`, {
            diameterX: eyeScale * 0.45,
            diameterY: eyeScale * 0.45,
            diameterZ: eyeScale * 0.15,
            segments: 8,
        }, scene);
        pupil.position.set(ex, headY + eyeYOffset, eyeZOffset + eyeScale * 0.18);
        pupil.parent = root;
        pupil.material = pupilMat;
    }

    // ── Eyebrows ──
    // Multiple traits derived from address bytes:
    //   b[10] = shape (flat / arched / angled / furrowed)
    //   b[9]  = thickness
    //   b[11] = width
    //   b[13] = vertical offset
    const browShapeVariant = bytes[10] % 4; // 0=flat, 1=arched, 2=angled, 3=furrowed
    const browThicknessVariant = bytes[9] % 3; // 0=thin, 1=medium, 2=thick
    const browWidthVariant = bytes[11] % 3; // 0=narrow, 1=medium, 2=wide
    const browVerticalVariant = bytes[13] % 3; // 0=low, 1=mid, 2=high

    const browAngle =
        browShapeVariant === 1 ? -0.18 :  // arched — outer end tilts down
        browShapeVariant === 2 ? 0.15 :   // angled — outer end tilts up
        browShapeVariant === 3 ? 0.25 :   // furrowed — strong inward tilt
        0;                                // flat
    const browThickness = 0.012 + browThicknessVariant * 0.006; // 0.012 – 0.024
    const browWidth = 0.09 + browWidthVariant * 0.015;          // 0.09 – 0.12
    const browYExtra = -0.01 + browVerticalVariant * 0.01;      // -0.01 – 0.01

    const browMat = makeMat(scene, "browMat", hairCol.scale(0.7));

    for (const side of [-1, 1]) {
        const prefix = side === -1 ? "left" : "right";
        const brow = MeshBuilder.CreateBox(`${prefix}Brow`, {
            width: browWidth,
            height: browThickness,
            depth: 0.02,
        }, scene);
        brow.position.set(
            side * eyeSpacing,
            headY + eyeYOffset + eyeScale * 0.9 + browYExtra,
            eyeZOffset + 0.02,
        );
        brow.rotation.z = side * browAngle;
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

    const neckDiam = isFemale ? 0.12 : 0.16;
    createLimb(scene, "neck", root, skinMat, 0.16, neckDiam * 0.875, neckDiam, 0, 1.50, 0);

    // ═══════════════════════════════════════
    //  TORSO (y ≈ 0.95 – 1.45)
    //  Proportions differ by gender:
    //    Male:   broad shoulders → narrow waist
    //    Female: moderate shoulders → narrow waist → wider hips
    // ═══════════════════════════════════════

    // Upper torso
    const upperTorso = MeshBuilder.CreateCylinder(
        "upperTorso",
        {
            height: 0.30,
            diameterTop: isFemale ? 0.40 : 0.48,
            diameterBottom: isFemale ? 0.44 : 0.52,
            tessellation: 12,
        },
        scene,
    );
    upperTorso.position.y = 1.33;
    upperTorso.parent = root;
    upperTorso.material = shirtMat;

    // Mid torso — chest / core
    const midTorso = MeshBuilder.CreateCylinder(
        "midTorso",
        {
            height: 0.28,
            diameterTop: isFemale ? 0.44 : 0.52,
            diameterBottom: isFemale ? 0.36 : 0.44,
            tessellation: 12,
        },
        scene,
    );
    midTorso.position.y = 1.08;
    midTorso.parent = root;
    midTorso.material = shirtMat;

    // Lower torso / hips
    const lowerTorso = MeshBuilder.CreateCylinder(
        "lowerTorso",
        {
            height: 0.18,
            diameterTop: isFemale ? 0.38 : 0.44,
            diameterBottom: isFemale ? 0.46 : 0.46,
            tessellation: 12,
        },
        scene,
    );
    lowerTorso.position.y = 0.90;
    lowerTorso.parent = root;
    lowerTorso.material = pantsMat;

    // ═══════════════════════════════════════
    //  SHOULDERS (spherical joints)
    // ═══════════════════════════════════════

    const shoulderY = 1.40;
    const shoulderJointSize = isFemale ? 0.13 : 0.16;
    createJoint(scene, "leftShoulder", root, shirtMat, shoulderJointSize, -shoulderX, shoulderY, 0);
    createJoint(scene, "rightShoulder", root, shirtMat, shoulderJointSize, shoulderX, shoulderY, 0);

    // ═══════════════════════════════════════
    //  ARMS — pivot-based for walk animation
    //  Each arm is parented to a pivot at the shoulder so
    //  rotating the pivot swings the entire arm.
    // ═══════════════════════════════════════

    const armUpperLen = isFemale ? 0.26 : 0.30;
    const armLowerLen = isFemale ? 0.24 : 0.28;
    const armDiamScale = limbScale;

    const leftArmPivot = new TransformNode("leftArmPivot", scene);
    leftArmPivot.position.set(-shoulderX, shoulderY, 0);
    leftArmPivot.parent = root;

    const rightArmPivot = new TransformNode("rightArmPivot", scene);
    rightArmPivot.position.set(shoulderX, shoulderY, 0);
    rightArmPivot.parent = root;

    for (const side of [-1, 1]) {
        const prefix = side === -1 ? "left" : "right";
        const pivot = side === -1 ? leftArmPivot : rightArmPivot;

        // Upper arm — relative to pivot (0, down from shoulder, 0)
        createLimb(scene, `${prefix}UpperArm`, pivot, skinMat,
            armUpperLen, 0.12 * armDiamScale, 0.11 * armDiamScale,
            0, -armUpperLen / 2 - 0.06, 0);

        // Elbow joint
        const elbowRelY = -armUpperLen - 0.06;
        createJoint(scene, `${prefix}Elbow`, pivot, skinMat, 0.12 * armDiamScale, 0, elbowRelY, 0);

        // Forearm
        createLimb(scene, `${prefix}Forearm`, pivot, skinMat,
            armLowerLen, 0.10 * armDiamScale, 0.08 * armDiamScale,
            0, elbowRelY - armLowerLen / 2, 0);

        // Hand — flattened sphere
        const handRelY = elbowRelY - armLowerLen;
        const hand = MeshBuilder.CreateSphere(
            `${prefix}Hand`, {
                diameterX: 0.10 * limbScale,
                diameterY: 0.12 * limbScale,
                diameterZ: 0.06 * limbScale,
                segments: 8,
            }, scene,
        );
        hand.position.set(0, handRelY, 0);
        hand.parent = pivot;
        hand.material = skinMat;
    }

    // ═══════════════════════════════════════
    //  LEGS — pivot-based for walk animation
    //  Each leg is parented to a pivot at the hip.
    // ═══════════════════════════════════════

    const hipY = 0.82;
    const legUpperLen = 0.38;
    const legLowerLen = 0.36;

    const leftLegPivot = new TransformNode("leftLegPivot", scene);
    leftLegPivot.position.set(-hipX, hipY, 0);
    leftLegPivot.parent = root;

    const rightLegPivot = new TransformNode("rightLegPivot", scene);
    rightLegPivot.position.set(hipX, hipY, 0);
    rightLegPivot.parent = root;

    for (const side of [-1, 1]) {
        const prefix = side === -1 ? "left" : "right";
        const pivot = side === -1 ? leftLegPivot : rightLegPivot;

        // Hip joint — at pivot origin
        createJoint(scene, `${prefix}Hip`, pivot, pantsMat, 0.15 * limbScale, 0, 0, 0);

        // Upper leg (thigh) — relative to pivot
        createLimb(scene, `${prefix}Thigh`, pivot, pantsMat,
            legUpperLen, 0.15 * limbScale, 0.13 * limbScale,
            0, -legUpperLen / 2 - 0.04, 0);

        // Knee joint
        const kneeRelY = -legUpperLen - 0.04;
        createJoint(scene, `${prefix}Knee`, pivot, pantsMat, 0.13 * limbScale, 0, kneeRelY, 0);

        // Lower leg (shin)
        createLimb(scene, `${prefix}Shin`, pivot, pantsMat,
            legLowerLen, 0.12 * limbScale, 0.09 * limbScale,
            0, kneeRelY - legLowerLen / 2, 0);

        // Ankle
        const ankleRelY = kneeRelY - legLowerLen;
        createJoint(scene, `${prefix}Ankle`, pivot, skinMat, 0.09 * limbScale, 0, ankleRelY, 0);

        // Foot — elongated box, extends forward
        const foot = MeshBuilder.CreateBox(
            `${prefix}Foot`,
            { width: 0.12 * limbScale, height: 0.06, depth: 0.22 * limbScale },
            scene,
        );
        foot.position.set(0, ankleRelY - 0.03, 0.04);
        foot.parent = pivot;
        foot.material = shoeMat;
    }

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
