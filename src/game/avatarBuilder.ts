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

    // Scale down — HVGirl is large by default (canonical scale is 0.1)
    root.scaling.setAll(0.1);

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

    // Set up shadows
    if (shadow) {
        result.meshes.forEach((m) => {
            shadow.addShadowCaster(m as Mesh);
            m.receiveShadows = true;
        });
    }

    // Ensure meshes are opaque
    result.meshes.forEach((m) => {
        m.hasVertexAlpha = false;
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

    return {
        root: root as unknown as TransformNode,
        head: (headMesh ?? result.meshes[0]) as Mesh,
        headBaseY: 1.7,
        idleAnim,
        walkAnim,
        runAnim,
        walkWeight: 0,
    };
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
