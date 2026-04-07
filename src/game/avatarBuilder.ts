/*
 * @Module: AvatarBuilder
 * @Purpose: Load pre-built HVGirl.glb character from Babylon.js asset library
 * @Logic: Loads the animated character model, sets up Idle/Walk/Run animation groups,
 *         and provides blending functions for smooth transitions.
 * @Interfaces: buildAvatar(scene, address, shadow?) → Promise<AvatarRig>
 * @Constraints: Requires @babylonjs/core, @babylonjs/loaders
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

// ─── Deterministic traits from Ethereum address ───

interface AvatarTraits {
    scale: number;           // overall height (0.08–0.12)
    skinColor: Color3;       // skin tone
    hairColor: Color3;       // hair color
    topColor: Color3;        // upper clothing
    bottomColor: Color3;     // lower clothing / shoes
    headScaleY: number;      // head vertical stretch (0.9–1.1)
}

function addressToBytes(address: string): number[] {
    const hex = address.replace("0x", "").toLowerCase();
    const bytes: number[] = [];
    for (let i = 0; i < hex.length && i < 40; i += 2) {
        bytes.push(parseInt(hex.slice(i, i + 2), 16));
    }
    return bytes;
}

function addressToTraits(address: string): AvatarTraits {
    const b = addressToBytes(address);

    // Scale: 0.08–0.12 (short to tall)
    const scale = 0.08 + (b[0] / 255) * 0.04;

    // Skin tone: diverse range from light to dark
    const skinIdx = b[1] % 8;
    const skinPalette: [number, number, number][] = [
        [1.0, 0.87, 0.77],   // fair
        [0.96, 0.80, 0.69],  // light
        [0.87, 0.72, 0.53],  // medium light
        [0.78, 0.61, 0.43],  // medium
        [0.66, 0.49, 0.33],  // olive
        [0.55, 0.38, 0.26],  // tan
        [0.44, 0.30, 0.20],  // brown
        [0.33, 0.22, 0.15],  // dark
    ];
    const [sr, sg, sb] = skinPalette[skinIdx];
    const skinColor = new Color3(sr, sg, sb);

    // Hair color
    const hairIdx = b[2] % 7;
    const hairPalette: [number, number, number][] = [
        [0.10, 0.07, 0.05],  // black
        [0.35, 0.22, 0.12],  // dark brown
        [0.55, 0.35, 0.15],  // brown
        [0.75, 0.55, 0.25],  // light brown / auburn
        [0.90, 0.75, 0.40],  // blonde
        [0.85, 0.30, 0.15],  // red
        [0.45, 0.45, 0.50],  // grey
    ];
    const [hr, hg, hb] = hairPalette[hairIdx];
    const hairColor = new Color3(hr, hg, hb);

    // Clothing: fully use address bytes for vibrant colors
    const topColor = new Color3(
        0.15 + (b[3] / 255) * 0.85,
        0.15 + (b[4] / 255) * 0.85,
        0.15 + (b[5] / 255) * 0.85,
    );
    const bottomColor = new Color3(
        0.1 + (b[6] / 255) * 0.5,
        0.1 + (b[7] / 255) * 0.5,
        0.1 + (b[8] / 255) * 0.5,
    );

    // Head scale: slight variation (0.92–1.08)
    const headScaleY = 0.92 + (b[9] / 255) * 0.16;

    return { scale, skinColor, hairColor, topColor, bottomColor, headScaleY };
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

// ─── Avatar builder (loads HVGirl.glb from Babylon.js CDN) ───

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

    // Scale down — varied by address (canonical ~0.1, now 0.08–0.12)
    root.scaling.setAll(traits.scale);

    // GLB models use rotationQuaternion by default — clear it so Euler .rotation.y works
    root.rotationQuaternion = null;

    // Find a head-ish mesh for camera targeting
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

    // Apply head scale variation
    if (headMesh) {
        headMesh.scaling.y = traits.headScaleY;
    }

    // Set up shadows
    if (shadow) {
        result.meshes.forEach((m) => {
            shadow.addShadowCaster(m as Mesh);
            m.receiveShadows = true;
        });
    }

    // Ensure meshes are opaque & apply address-deterministic colors
    result.meshes.forEach((m) => {
        m.hasVertexAlpha = false;

        // Clone material so each avatar instance has its own
        if (m.material) {
            const cloned = m.material.clone(m.material.name + "_" + address.slice(2, 8));
            if (cloned) {
                m.material = cloned;
                const name = m.name.toLowerCase();
                const isSkin = name.includes("body") || name.includes("skin") || name.includes("head") || name.includes("face") || name.includes("arm") || name.includes("hand");
                const isHair = name.includes("hair") || name.includes("bangs") || name.includes("ponytail");
                const isBottom = name.includes("bottom") || name.includes("pant") || name.includes("leg") || name.includes("shoe") || name.includes("foot");

                let tintColor: Color3;
                if (isSkin) tintColor = traits.skinColor;
                else if (isHair) tintColor = traits.hairColor;
                else if (isBottom) tintColor = traits.bottomColor;
                else tintColor = traits.topColor; // everything else = top/clothing

                if (cloned instanceof PBRMaterial) {
                    cloned.albedoColor = tintColor;
                } else if (cloned instanceof StandardMaterial) {
                    cloned.diffuseColor = tintColor;
                }
            }
        }
    });

    // Animation groups in HVGirl.glb:
    //   [0] "Idle", [1] "Samba", [2] "Walking", [3] "WalkingBack"
    let idleAnim: AnimationGroup | null = null;
    let walkAnim: AnimationGroup | null = null;
    let runAnim: AnimationGroup | null = null;

    for (const ag of result.animationGroups) {
        const name = ag.name;
        if (name === "Idle") idleAnim = ag;
        else if (name === "Walking") walkAnim = ag;
        else if (name === "Samba") runAnim = ag; // use Samba as "run" variant
    }

    // Stop all animations first, then start with blending
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

    // headBaseY scales with avatar size (1.7 at scale 0.1)
    const headBaseY = 1.7 * (traits.scale / 0.1);

    return {
        root: root as unknown as TransformNode,
        head: (headMesh ?? result.meshes[0]) as Mesh,
        headBaseY,
        idleAnim,
        walkAnim,
        runAnim,
        walkWeight: 0,
    };
}

// ─── Chat bubble (3D speech bubble above avatar) ───

export function buildChatBubble(
    scene: Scene,
    parent: TransformNode,
    text: string,
): Mesh {
    // Measure text to size the bubble
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

    // Background pill
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.beginPath();
    ctx.roundRect(4, 4, 504, 56, 28);
    ctx.fill();

    // Text
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
