/*
 * @Module: worldBuilder
 * @Purpose: Build realistic world using Babylon.js CDN assets (villagePack GLB models)
 * @Logic: Loads tree, bush, and rock GLB models from assets.babylonjs.com,
 *         clones them across the terrain with random scale/rotation.
 *         Falls back to procedural geometry if CDN load fails.
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
    SceneLoader,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";

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

// ─── CDN asset URLs ───

const CDN = "https://assets.babylonjs.com/meshes/villagePack/";

const TREE_MODELS = ["tree1/tree1.glb", "tree2/tree2.glb", "tree3/tree3.glb", "tree4/tree4.glb"];
const BUSH_MODELS = ["bush1/bush1.glb", "bush2/bush2.glb", "bush3/bush3.glb"];
const ROCK_MODELS = ["rocks1/rocks1.glb", "rocks2/rocks2.glb", "rocks3/rocks3.glb"];

// ─── Load a GLB template from CDN ───

async function loadTemplate(
    scene: Scene,
    url: string,
    name: string,
): Promise<TransformNode | null> {
    try {
        const result = await SceneLoader.ImportMeshAsync("", CDN, url, scene);
        if (result.meshes.length === 0) return null;

        // Wrap all loaded meshes under one parent
        const root = new TransformNode(`${name}_template`, scene);
        for (const m of result.meshes) {
            if (!m.parent || m.parent === scene) {
                m.parent = root;
            }
        }
        // Hide the template — we'll clone from it
        root.setEnabled(false);
        return root;
    } catch {
        return null;
    }
}

// ─── Clone a template at a position with random transform ───

function placeClone(
    template: TransformNode,
    name: string,
    x: number,
    z: number,
    scale: number,
    rotY: number,
    shadow?: ShadowGenerator,
): void {
    const clone = template.clone(name, null);
    if (!clone) return;
    clone.setEnabled(true);
    clone.position.set(x, 0, z);
    clone.scaling.setAll(scale);
    clone.rotation.y = rotY;

    if (shadow) {
        clone.getChildMeshes().forEach((m) => {
            shadow.addShadowCaster(m as Mesh);
            m.receiveShadows = true;
        });
    }
}

// ─── Procedural fallback tree ───

function buildFallbackTree(
    scene: Scene,
    x: number,
    z: number,
    index: number,
    rand: () => number,
    shadow?: ShadowGenerator,
): void {
    const parent = new TransformNode(`tree_fb_${index}`, scene);
    parent.position.set(x, 0, z);

    const trunkHeight = 2.0 + rand() * 2.5;
    const trunkDiam = 0.2 + rand() * 0.15;

    const trunk = MeshBuilder.CreateCylinder(
        `trunk_fb_${index}`,
        { height: trunkHeight, diameterTop: trunkDiam * 0.6, diameterBottom: trunkDiam, tessellation: 10 },
        scene,
    );
    trunk.position.y = trunkHeight / 2;
    trunk.parent = parent;
    const trunkMat = new PBRMaterial(`trunkMat_fb_${index}`, scene);
    trunkMat.albedoColor = new Color3(0.35 + rand() * 0.1, 0.22 + rand() * 0.05, 0.1);
    trunkMat.roughness = 0.95;
    trunkMat.metallic = 0;
    trunk.material = trunkMat;

    const clusterCount = 3 + Math.floor(rand() * 4);
    const leafBaseY = trunkHeight * 0.75;
    const canopyRadius = 1.0 + rand() * 1.2;

    for (let c = 0; c < clusterCount; c++) {
        const size = canopyRadius * (0.6 + rand() * 0.5);
        const leaf = MeshBuilder.CreateSphere(`leaf_fb_${index}_${c}`, { diameter: size, segments: 8 }, scene);
        leaf.position.set(
            (rand() - 0.5) * canopyRadius * 0.8,
            leafBaseY + rand() * canopyRadius * 0.7,
            (rand() - 0.5) * canopyRadius * 0.8,
        );
        leaf.scaling.set(1 + rand() * 0.3, 0.6 + rand() * 0.4, 1 + rand() * 0.3);
        leaf.parent = parent;
        const leafMat = new PBRMaterial(`leafMat_fb_${index}_${c}`, scene);
        leafMat.albedoColor = new Color3(0.08 + rand() * 0.12, 0.35 + rand() * 0.25, 0.05 + rand() * 0.08);
        leafMat.roughness = 0.85;
        leafMat.metallic = 0;
        leaf.material = leafMat;
        if (shadow) { shadow.addShadowCaster(leaf); leaf.receiveShadows = true; }
    }

    if (shadow) { shadow.addShadowCaster(trunk); trunk.receiveShadows = true; }
}

// ─── Procedural fallback rock ───

function buildFallbackRock(
    scene: Scene,
    x: number,
    z: number,
    index: number,
    rand: () => number,
    shadow?: ShadowGenerator,
): number {
    const size = 0.3 + rand() * 0.8;
    const rock = MeshBuilder.CreateSphere(`rock_fb_${index}`, { diameter: size, segments: 6 }, scene);
    rock.position.set(x, size * 0.25, z);
    rock.scaling.set(0.8 + rand() * 0.5, 0.3 + rand() * 0.4, 0.8 + rand() * 0.5);
    rock.rotation.y = rand() * Math.PI * 2;
    const rockMat = new PBRMaterial(`rockMat_fb_${index}`, scene);
    const shade = 0.3 + rand() * 0.2;
    rockMat.albedoColor = new Color3(shade, shade * 0.95, shade * 0.9);
    rockMat.roughness = 0.9;
    rockMat.metallic = 0.05;
    rock.material = rockMat;
    if (shadow) { shadow.addShadowCaster(rock); rock.receiveShadows = true; }
    return size > 0.7 ? size * 0.5 : 0;
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

    const body = MeshBuilder.CreateSphere(`insectBody${index}`, { diameter: 0.04, segments: 4 }, scene);
    body.parent = node;
    const insectMat = new StandardMaterial(`insectMat${index}`, scene);
    insectMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
    insectMat.specularColor = Color3.Black();
    body.material = insectMat;

    for (let w = 0; w < 2; w++) {
        const wing = MeshBuilder.CreatePlane(`insectWing${index}_${w}`, { width: 0.04, height: 0.02 }, scene);
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
        centerX: x, centerZ: z,
        radius: 0.5 + rand() * 2,
        speed: 1.5 + rand() * 2,
        phase: rand() * Math.PI * 2,
        heightOffset: 0.3 + rand() * 0.5,
    };
}

// ─── Grass with PBR ───

function buildGrass(
    scene: Scene,
    rand: () => number,
    count: number,
    bushTemplates: TransformNode[],
    shadow?: ShadowGenerator,
): void {
    const grassMat = new PBRMaterial("grassMat", scene);
    grassMat.albedoColor = new Color3(0.18, 0.5, 0.12);
    grassMat.roughness = 0.9;
    grassMat.metallic = 0;
    grassMat.backFaceCulling = false;

    const darkGrassMat = new PBRMaterial("darkGrassMat", scene);
    darkGrassMat.albedoColor = new Color3(0.1, 0.38, 0.08);
    darkGrassMat.roughness = 0.9;
    darkGrassMat.metallic = 0;
    darkGrassMat.backFaceCulling = false;

    for (let i = 0; i < count; i++) {
        const cx = (rand() - 0.5) * 190;
        const cz = (rand() - 0.5) * 190;

        // 30% chance to place a bush model instead of grass blades (if available)
        if (bushTemplates.length > 0 && rand() < 0.3) {
            const tmpl = bushTemplates[Math.floor(rand() * bushTemplates.length)];
            const scale = 0.3 + rand() * 0.4;
            placeClone(tmpl, `bush_clone_${i}`, cx, cz, scale, rand() * Math.PI * 2, shadow);
            continue;
        }

        const bladeCount = 4 + Math.floor(rand() * 6);
        for (let b = 0; b < bladeCount; b++) {
            const g = MeshBuilder.CreatePlane(
                `grass${i}_${b}`,
                { width: 0.04 + rand() * 0.03, height: 0.12 + rand() * 0.25 },
                scene,
            );
            g.position.set(
                cx + (rand() - 0.5) * 0.4,
                0.06 + rand() * 0.12,
                cz + (rand() - 0.5) * 0.4,
            );
            g.rotation.y = rand() * Math.PI;
            g.rotation.x = -0.15 + rand() * 0.3;
            g.material = rand() > 0.4 ? grassMat : darkGrassMat;
            if (shadow) g.receiveShadows = true;
        }
    }
}

// ─── Main builder ───

export async function buildWorld(
    scene: Scene,
    shadow?: ShadowGenerator,
): Promise<WorldBuildResult & { insects: InsectData[] }> {
    const rand = mulberry32(42);

    // ── Ground ──
    const ground = MeshBuilder.CreateGround("ground", { width: 200, height: 200, subdivisions: 60 }, scene);
    const groundMat = new PBRMaterial("groundMat", scene);
    groundMat.albedoColor = new Color3(0.25, 0.48, 0.18);
    groundMat.roughness = 0.92;
    groundMat.metallic = 0;
    groundMat.environmentIntensity = 0.4;
    ground.material = groundMat;
    ground.receiveShadows = true;

    // ── Load GLB templates from Babylon.js CDN (in parallel) ──
    const [treeTemplates, bushTemplates, rockTemplates] = await Promise.all([
        Promise.all(TREE_MODELS.map((url, i) => loadTemplate(scene, url, `tree${i}`))),
        Promise.all(BUSH_MODELS.map((url, i) => loadTemplate(scene, url, `bush${i}`))),
        Promise.all(ROCK_MODELS.map((url, i) => loadTemplate(scene, url, `rock${i}`))),
    ]);

    const validTrees = treeTemplates.filter((t): t is TransformNode => t !== null);
    const validBushes = bushTemplates.filter((t): t is TransformNode => t !== null);
    const validRocks = rockTemplates.filter((t): t is TransformNode => t !== null);

    const colliders: Collider[] = [];

    // ── Trees (30) — GLB clones or procedural fallback ──
    const TREE_COLLISION_RADIUS = 0.6;
    for (let i = 0; i < 30; i++) {
        const x = (rand() - 0.5) * 160;
        const z = (rand() - 0.5) * 160;
        if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;

        if (validTrees.length > 0) {
            const tmpl = validTrees[Math.floor(rand() * validTrees.length)];
            const scale = 0.8 + rand() * 0.8; // 0.8 – 1.6
            placeClone(tmpl, `tree_clone_${i}`, x, z, scale, rand() * Math.PI * 2, shadow);
        } else {
            buildFallbackTree(scene, x, z, i, rand, shadow);
        }
        colliders.push({ x, z, radius: TREE_COLLISION_RADIUS });
    }

    // ── Rocks (60) — GLB clones or procedural fallback ──
    for (let i = 0; i < 60; i++) {
        const x = (rand() - 0.5) * 180;
        const z = (rand() - 0.5) * 180;
        if (Math.abs(x) < 4 && Math.abs(z) < 4) continue;

        if (validRocks.length > 0) {
            const tmpl = validRocks[Math.floor(rand() * validRocks.length)];
            const scale = 0.4 + rand() * 0.8;
            placeClone(tmpl, `rock_clone_${i}`, x, z, scale, rand() * Math.PI * 2, shadow);
            if (scale > 0.7) {
                colliders.push({ x, z, radius: scale * 0.4 });
            }
        } else {
            const collisionRadius = buildFallbackRock(scene, x, z, i, rand, shadow);
            if (collisionRadius > 0) {
                colliders.push({ x, z, radius: collisionRadius });
            }
        }
    }

    // ── Grass & bushes (250 clusters) ──
    buildGrass(scene, rand, 250, validBushes, shadow);

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
