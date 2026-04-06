/*
 * @Module: worldBuilder
 * @Purpose: Build realistic ground terrain with trees, rocks, grass, and insects
 * @Logic: Loads GLB tree models from Babylon.js CDN, creates instanced grass,
 *         PBR ground material, and animated insects.
 * @Interfaces: buildWorld(scene, shadow?) → Promise<WorldBuildResult>
 * @Constraints: Requires @babylonjs/core, @babylonjs/loaders
 */

import {
    Scene,
    MeshBuilder,
    StandardMaterial,
    PBRMaterial,
    Color3,
    Mesh,
    TransformNode,
    Vector3,
    ShadowGenerator,
} from "@babylonjs/core";

// ─── Types ───

export interface Collider {
    x: number;
    z: number;
    radius: number;
}

export interface WorldBuildResult {
    ground: Mesh;
    colliders: Collider[];
}

// ─── Seeded random (deterministic world layout) ───

function mulberry32(seed: number) {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ─── Procedural tree (fallback & variety) ───

function buildProceduralTree(
    scene: Scene,
    x: number,
    z: number,
    index: number,
    rand: () => number,
    shadow?: ShadowGenerator,
): void {
    const parent = new TransformNode(`tree${index}`, scene);
    parent.position.set(x, 0, z);

    const trunkHeight = 2.0 + rand() * 2.5;
    const trunkDiam = 0.2 + rand() * 0.15;

    // Trunk — tapered cylinder with bark-like PBR
    const trunk = MeshBuilder.CreateCylinder(
        `trunk${index}`,
        { height: trunkHeight, diameterTop: trunkDiam * 0.6, diameterBottom: trunkDiam, tessellation: 10 },
        scene,
    );
    trunk.position.y = trunkHeight / 2;
    trunk.parent = parent;
    const trunkMat = new PBRMaterial(`trunkMat${index}`, scene);
    trunkMat.albedoColor = new Color3(0.35 + rand() * 0.1, 0.22 + rand() * 0.05, 0.1);
    trunkMat.roughness = 0.95;
    trunkMat.metallic = 0;
    trunk.material = trunkMat;

    // Multiple leaf clusters for a fuller, more natural canopy
    const clusterCount = 3 + Math.floor(rand() * 4);
    const leafBaseY = trunkHeight * 0.75;
    const canopyRadius = 1.0 + rand() * 1.2;

    for (let c = 0; c < clusterCount; c++) {
        const size = canopyRadius * (0.6 + rand() * 0.5);
        const offsetX = (rand() - 0.5) * canopyRadius * 0.8;
        const offsetZ = (rand() - 0.5) * canopyRadius * 0.8;
        const offsetY = leafBaseY + rand() * canopyRadius * 0.7;

        const leaf = MeshBuilder.CreateSphere(
            `leaf${index}_${c}`,
            { diameter: size, segments: 8 },
            scene,
        );
        leaf.position.set(offsetX, offsetY, offsetZ);
        leaf.scaling.set(1 + rand() * 0.3, 0.6 + rand() * 0.4, 1 + rand() * 0.3);
        leaf.parent = parent;

        const leafMat = new PBRMaterial(`leafMat${index}_${c}`, scene);
        leafMat.albedoColor = new Color3(0.08 + rand() * 0.12, 0.35 + rand() * 0.25, 0.05 + rand() * 0.08);
        leafMat.roughness = 0.85;
        leafMat.metallic = 0;
        leaf.material = leafMat;

        if (shadow) {
            shadow.addShadowCaster(leaf);
            leaf.receiveShadows = true;
        }
    }

    if (shadow) {
        shadow.addShadowCaster(trunk);
        trunk.receiveShadows = true;
    }
}

// ─── Rock builder ───

function buildRock(
    scene: Scene,
    x: number,
    z: number,
    index: number,
    rand: () => number,
    shadow?: ShadowGenerator,
): number {
    const size = 0.3 + rand() * 0.8;
    const rock = MeshBuilder.CreateSphere(
        `rock${index}`,
        { diameter: size, segments: 6 },
        scene,
    );
    rock.position.set(x, size * 0.25, z);
    rock.scaling.set(
        0.8 + rand() * 0.5,
        0.3 + rand() * 0.4,
        0.8 + rand() * 0.5,
    );
    rock.rotation.y = rand() * Math.PI * 2;

    const rockMat = new PBRMaterial(`rockMat${index}`, scene);
    const shade = 0.3 + rand() * 0.2;
    rockMat.albedoColor = new Color3(shade, shade * 0.95, shade * 0.9);
    rockMat.roughness = 0.9;
    rockMat.metallic = 0.05;
    rock.material = rockMat;

    if (shadow) {
        shadow.addShadowCaster(rock);
        rock.receiveShadows = true;
    }

    return size > 0.7 ? size * 0.5 : 0;
}

// ─── Instanced grass ───

function buildGrass(
    scene: Scene,
    rand: () => number,
    count: number,
    shadow?: ShadowGenerator,
): void {
    // Create a base grass blade mesh (thin tapered plane)
    const blade = MeshBuilder.CreatePlane("grassBlade", { width: 0.06, height: 0.25 }, scene);
    blade.isVisible = false; // template mesh

    const grassMat = new PBRMaterial("grassMat", scene);
    grassMat.albedoColor = new Color3(0.18, 0.5, 0.12);
    grassMat.roughness = 0.9;
    grassMat.metallic = 0;
    grassMat.backFaceCulling = false;
    blade.material = grassMat;

    const darkGrassMat = new PBRMaterial("darkGrassMat", scene);
    darkGrassMat.albedoColor = new Color3(0.1, 0.38, 0.08);
    darkGrassMat.roughness = 0.9;
    darkGrassMat.metallic = 0;
    darkGrassMat.backFaceCulling = false;

    // Create grass tufts as clusters of thin instances
    for (let i = 0; i < count; i++) {
        const cx = (rand() - 0.5) * 190;
        const cz = (rand() - 0.5) * 190;
        const bladeCount = 4 + Math.floor(rand() * 6);

        for (let b = 0; b < bladeCount; b++) {
            const g = MeshBuilder.CreatePlane(
                `grass${i}_${b}`,
                { width: 0.04 + rand() * 0.03, height: 0.12 + rand() * 0.25 },
                scene,
            );
            const gx = cx + (rand() - 0.5) * 0.4;
            const gz = cz + (rand() - 0.5) * 0.4;
            const gh = 0.06 + rand() * 0.12;
            g.position.set(gx, gh, gz);
            g.rotation.y = rand() * Math.PI;
            g.rotation.x = -0.15 + rand() * 0.3;
            g.material = rand() > 0.4 ? grassMat : darkGrassMat;
            if (shadow) g.receiveShadows = true;
        }
    }

    blade.dispose();
}

// ─── Insect builder (animated) ───

export interface InsectData {
    node: TransformNode;
    centerX: number;
    centerZ: number;
    radius: number;
    speed: number;
    phase: number;
    heightOffset: number;
}

function buildInsect(
    scene: Scene,
    x: number,
    z: number,
    index: number,
    rand: () => number,
): InsectData {
    const node = new TransformNode(`insect${index}`, scene);

    const body = MeshBuilder.CreateSphere(
        `insectBody${index}`,
        { diameter: 0.04, segments: 4 },
        scene,
    );
    body.parent = node;
    const insectMat = new StandardMaterial(`insectMat${index}`, scene);
    insectMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
    insectMat.specularColor = Color3.Black();
    body.material = insectMat;

    for (let w = 0; w < 2; w++) {
        const wing = MeshBuilder.CreatePlane(
            `insectWing${index}_${w}`,
            { width: 0.04, height: 0.02 },
            scene,
        );
        wing.parent = node;
        wing.position.x = w === 0 ? -0.025 : 0.025;
        wing.position.y = 0.01;
        const wingMat = new StandardMaterial(`wingMat${index}_${w}`, scene);
        wingMat.diffuseColor = new Color3(0.7, 0.7, 0.7);
        wingMat.alpha = 0.4;
        wing.material = wingMat;
    }

    return {
        node,
        centerX: x,
        centerZ: z,
        radius: 0.5 + rand() * 2,
        speed: 1.5 + rand() * 2,
        phase: rand() * Math.PI * 2,
        heightOffset: 0.3 + rand() * 0.5,
    };
}

// ─── Main builder ───

export function buildWorld(
    scene: Scene,
    shadow?: ShadowGenerator,
): WorldBuildResult & { insects: InsectData[] } {
    const rand = mulberry32(42);

    // ── Ground with PBR material ──
    const ground = MeshBuilder.CreateGround(
        "ground",
        { width: 200, height: 200, subdivisions: 60 },
        scene,
    );
    const groundMat = new PBRMaterial("groundMat", scene);
    groundMat.albedoColor = new Color3(0.25, 0.48, 0.18);
    groundMat.roughness = 0.92;
    groundMat.metallic = 0;
    // Slight micro-surface variation for natural look
    groundMat.environmentIntensity = 0.4;
    ground.material = groundMat;
    ground.receiveShadows = true;

    const colliders: Collider[] = [];

    // ── Trees (30) — procedural with multi-cluster canopy ──
    const TREE_COLLISION_RADIUS = 0.6;
    for (let i = 0; i < 30; i++) {
        const x = (rand() - 0.5) * 160;
        const z = (rand() - 0.5) * 160;
        if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;

        buildProceduralTree(scene, x, z, i, rand, shadow);
        colliders.push({ x, z, radius: TREE_COLLISION_RADIUS });
    }

    // ── Rocks (60) ──
    for (let i = 0; i < 60; i++) {
        const x = (rand() - 0.5) * 180;
        const z = (rand() - 0.5) * 180;
        if (Math.abs(x) < 4 && Math.abs(z) < 4) continue;

        const collisionRadius = buildRock(scene, x, z, i, rand, shadow);
        if (collisionRadius > 0) {
            colliders.push({ x, z, radius: collisionRadius });
        }
    }

    // ── Grass tufts (250) ──
    buildGrass(scene, rand, 250, shadow);

    // ── Insects (15) ──
    const insects: InsectData[] = [];
    for (let i = 0; i < 15; i++) {
        const x = (rand() - 0.5) * 140;
        const z = (rand() - 0.5) * 140;
        insects.push(buildInsect(scene, x, z, i, rand));
    }

    return { ground, colliders, insects };
}

// ─── Insect animation (call in render loop) ───

export function animateInsects(insects: InsectData[]): void {
    const time = Date.now() / 1000;
    for (const insect of insects) {
        const t = time * insect.speed + insect.phase;
        insect.node.position.set(
            insect.centerX + Math.sin(t) * insect.radius,
            insect.heightOffset + Math.sin(t * 3) * 0.1,
            insect.centerZ + Math.cos(t) * insect.radius,
        );
        insect.node.rotation.y = t + Math.PI / 2;
    }
}
