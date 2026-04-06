/*
 * @Module: worldBuilder
 * @Purpose: Build realistic ground terrain with trees, rocks, grass, and insects
 * @Logic: Creates PBR-shaded procedural terrain with multi-layer tree canopies,
 *         natural rock formations, dense grass, and animated insects.
 * @Interfaces: buildWorld(scene, shadow?) → WorldBuildResult
 * @Constraints: Requires @babylonjs/core
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

// ─── Shared PBR material factory ───

function pbrMat(scene: Scene, name: string, albedo: Color3, roughness: number, metallic = 0): PBRMaterial {
    const mat = new PBRMaterial(name, scene);
    mat.albedoColor = albedo;
    mat.roughness = roughness;
    mat.metallic = metallic;
    return mat;
}

// ─── Tree builder ───

function buildTree(
    scene: Scene,
    x: number,
    z: number,
    index: number,
    rand: () => number,
    shadow?: ShadowGenerator,
): void {
    const parent = new TransformNode(`tree${index}`, scene);
    parent.position.set(x, 0, z);

    // Trunk — tapered, slightly curved via two stacked segments
    const trunkHeight = 2.5 + rand() * 3.0;
    const trunkDiam = 0.18 + rand() * 0.14;
    const tiltX = (rand() - 0.5) * 0.06;
    const tiltZ = (rand() - 0.5) * 0.06;

    // Lower trunk
    const lowerH = trunkHeight * 0.55;
    const lower = MeshBuilder.CreateCylinder(`trunkLo${index}`, {
        height: lowerH, diameterTop: trunkDiam * 0.78, diameterBottom: trunkDiam * 1.15, tessellation: 10,
    }, scene);
    lower.position.set(0, lowerH / 2, 0);
    lower.parent = parent;

    // Upper trunk (slight lean for natural look)
    const upperH = trunkHeight * 0.5;
    const upper = MeshBuilder.CreateCylinder(`trunkHi${index}`, {
        height: upperH, diameterTop: trunkDiam * 0.45, diameterBottom: trunkDiam * 0.78, tessellation: 10,
    }, scene);
    upper.position.set(tiltX, lowerH + upperH / 2, tiltZ);
    upper.parent = parent;

    const barkShade = 0.28 + rand() * 0.12;
    const trunkMat = pbrMat(scene, `bark${index}`,
        new Color3(barkShade, barkShade * 0.65, barkShade * 0.35), 0.95);
    lower.material = trunkMat;
    upper.material = trunkMat;

    // Root flare — wide, flat cylinder at base
    const rootFlare = MeshBuilder.CreateCylinder(`rootFlare${index}`, {
        height: 0.12, diameterTop: trunkDiam * 1.15, diameterBottom: trunkDiam * 1.6, tessellation: 8,
    }, scene);
    rootFlare.position.y = 0.06;
    rootFlare.parent = parent;
    rootFlare.material = trunkMat;

    // Canopy — multiple overlapping spheres in layers
    const canopyBaseY = trunkHeight * 0.65;
    const canopyRadius = 1.2 + rand() * 1.6;
    const layers = 2 + Math.floor(rand() * 2); // 2-3 vertical layers
    const clustersPerLayer = 3 + Math.floor(rand() * 3); // 3-5 per layer

    // Base green with per-tree variation
    const baseG = 0.32 + rand() * 0.18;
    const baseR = 0.06 + rand() * 0.08;
    const baseB = 0.04 + rand() * 0.06;

    for (let layer = 0; layer < layers; layer++) {
        const layerY = canopyBaseY + layer * canopyRadius * 0.4;
        const layerSpread = canopyRadius * (1 - layer * 0.2); // narrower higher up

        for (let c = 0; c < clustersPerLayer; c++) {
            const angle = (c / clustersPerLayer) * Math.PI * 2 + rand() * 0.5;
            const dist = layerSpread * (0.2 + rand() * 0.5);
            const size = canopyRadius * (0.45 + rand() * 0.4);

            const leaf = MeshBuilder.CreateSphere(`leaf${index}_${layer}_${c}`, {
                diameter: size, segments: 10,
            }, scene);
            leaf.position.set(
                Math.cos(angle) * dist + tiltX * (layer + 1),
                layerY + rand() * canopyRadius * 0.3,
                Math.sin(angle) * dist + tiltZ * (layer + 1),
            );
            leaf.scaling.set(
                0.9 + rand() * 0.3,
                0.5 + rand() * 0.35,
                0.9 + rand() * 0.3,
            );
            leaf.parent = parent;

            // Subtle color variation per cluster
            const leafMat = pbrMat(scene, `lf${index}_${layer}_${c}`,
                new Color3(
                    baseR + (rand() - 0.5) * 0.04,
                    baseG + (rand() - 0.5) * 0.08,
                    baseB + (rand() - 0.5) * 0.03,
                ), 0.82);
            leaf.material = leafMat;

            if (shadow) { shadow.addShadowCaster(leaf); leaf.receiveShadows = true; }
        }
    }

    // Top cap sphere — gives a rounded crown
    const topCap = MeshBuilder.CreateSphere(`topCap${index}`, {
        diameter: canopyRadius * 0.7, segments: 10,
    }, scene);
    topCap.position.set(tiltX * 3, canopyBaseY + layers * canopyRadius * 0.4 + canopyRadius * 0.15, tiltZ * 3);
    topCap.scaling.y = 0.5;
    topCap.parent = parent;
    topCap.material = pbrMat(scene, `topLf${index}`,
        new Color3(baseR, baseG + 0.06, baseB), 0.82);
    if (shadow) { shadow.addShadowCaster(topCap); topCap.receiveShadows = true; }

    if (shadow) {
        shadow.addShadowCaster(lower);
        shadow.addShadowCaster(upper);
        shadow.addShadowCaster(rootFlare);
        lower.receiveShadows = true;
        upper.receiveShadows = true;
        rootFlare.receiveShadows = true;
    }
}

// ─── Bush builder ───

function buildBush(
    scene: Scene,
    x: number,
    z: number,
    index: number,
    rand: () => number,
    shadow?: ShadowGenerator,
): void {
    const parent = new TransformNode(`bush${index}`, scene);
    parent.position.set(x, 0, z);

    const clusterCount = 3 + Math.floor(rand() * 3);
    const bushSize = 0.3 + rand() * 0.5;
    const g = 0.28 + rand() * 0.22;

    for (let c = 0; c < clusterCount; c++) {
        const s = bushSize * (0.6 + rand() * 0.5);
        const sphere = MeshBuilder.CreateSphere(`bushLf${index}_${c}`, { diameter: s, segments: 8 }, scene);
        sphere.position.set(
            (rand() - 0.5) * bushSize * 0.8,
            s * 0.35 + rand() * 0.1,
            (rand() - 0.5) * bushSize * 0.8,
        );
        sphere.scaling.y = 0.55 + rand() * 0.3;
        sphere.parent = parent;
        sphere.material = pbrMat(scene, `bushMat${index}_${c}`,
            new Color3(0.06 + rand() * 0.06, g + (rand() - 0.5) * 0.06, 0.04 + rand() * 0.04), 0.85);
        if (shadow) { shadow.addShadowCaster(sphere); sphere.receiveShadows = true; }
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
    const parent = new TransformNode(`rock${index}`, scene);
    parent.position.set(x, 0, z);

    // Main rock body
    const main = MeshBuilder.CreateSphere(`rockMain${index}`, { diameter: size, segments: 7 }, scene);
    main.position.y = size * 0.22;
    main.scaling.set(0.8 + rand() * 0.5, 0.3 + rand() * 0.35, 0.8 + rand() * 0.5);
    main.rotation.y = rand() * Math.PI * 2;
    main.rotation.x = (rand() - 0.5) * 0.3;
    main.parent = parent;

    const shade = 0.35 + rand() * 0.2;
    const rockMat = pbrMat(scene, `rockMat${index}`,
        new Color3(shade, shade * 0.94, shade * 0.88), 0.88, 0.05);
    main.material = rockMat;

    // Add 1-2 smaller accent rocks for natural cluster
    const accentCount = Math.floor(rand() * 2) + 1;
    for (let a = 0; a < accentCount; a++) {
        const as = size * (0.25 + rand() * 0.3);
        const accent = MeshBuilder.CreateSphere(`rockAcc${index}_${a}`, { diameter: as, segments: 6 }, scene);
        accent.position.set(
            (rand() - 0.5) * size * 0.6,
            as * 0.2,
            (rand() - 0.5) * size * 0.6,
        );
        accent.scaling.set(0.7 + rand() * 0.5, 0.3 + rand() * 0.3, 0.7 + rand() * 0.5);
        accent.rotation.y = rand() * Math.PI * 2;
        accent.parent = parent;
        accent.material = rockMat;
        if (shadow) { shadow.addShadowCaster(accent); accent.receiveShadows = true; }
    }

    if (shadow) { shadow.addShadowCaster(main); main.receiveShadows = true; }

    return size > 0.7 ? size * 0.5 : 0;
}

// ─── Grass builder ───

function buildGrass(
    scene: Scene,
    rand: () => number,
    count: number,
    shadow?: ShadowGenerator,
): void {
    const grassMat = pbrMat(scene, "grassMat", new Color3(0.16, 0.48, 0.10), 0.9);
    grassMat.backFaceCulling = false;
    const darkGrassMat = pbrMat(scene, "darkGrassMat", new Color3(0.10, 0.36, 0.07), 0.9);
    darkGrassMat.backFaceCulling = false;
    const yellowGrassMat = pbrMat(scene, "yellowGrassMat", new Color3(0.35, 0.42, 0.10), 0.9);
    yellowGrassMat.backFaceCulling = false;

    const mats = [grassMat, grassMat, grassMat, darkGrassMat, darkGrassMat, yellowGrassMat];

    for (let i = 0; i < count; i++) {
        const cx = (rand() - 0.5) * 190;
        const cz = (rand() - 0.5) * 190;
        const bladeCount = 5 + Math.floor(rand() * 7);

        for (let b = 0; b < bladeCount; b++) {
            const h = 0.10 + rand() * 0.28;
            const w = 0.02 + rand() * 0.025;
            const g = MeshBuilder.CreatePlane(`g${i}_${b}`, { width: w, height: h }, scene);
            g.position.set(
                cx + (rand() - 0.5) * 0.5,
                h * 0.48,
                cz + (rand() - 0.5) * 0.5,
            );
            g.rotation.y = rand() * Math.PI;
            g.rotation.x = -0.1 + rand() * 0.2;
            g.material = mats[Math.floor(rand() * mats.length)];
            if (shadow) g.receiveShadows = true;
        }
    }
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

// ─── Main builder ───

export function buildWorld(
    scene: Scene,
    shadow?: ShadowGenerator,
): WorldBuildResult & { insects: InsectData[] } {
    const rand = mulberry32(42);

    // ── Ground ──
    const ground = MeshBuilder.CreateGround("ground", { width: 200, height: 200, subdivisions: 60 }, scene);
    const groundMat = pbrMat(scene, "groundMat", new Color3(0.24, 0.46, 0.17), 0.92);
    groundMat.environmentIntensity = 0.4;
    ground.material = groundMat;
    ground.receiveShadows = true;

    const colliders: Collider[] = [];

    // ── Trees (35) ──
    const TREE_COLLISION_RADIUS = 0.6;
    for (let i = 0; i < 35; i++) {
        const x = (rand() - 0.5) * 160;
        const z = (rand() - 0.5) * 160;
        if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;
        buildTree(scene, x, z, i, rand, shadow);
        colliders.push({ x, z, radius: TREE_COLLISION_RADIUS });
    }

    // ── Bushes (40) ──
    for (let i = 0; i < 40; i++) {
        const x = (rand() - 0.5) * 170;
        const z = (rand() - 0.5) * 170;
        if (Math.abs(x) < 4 && Math.abs(z) < 4) continue;
        buildBush(scene, x, z, i, rand, shadow);
    }

    // ── Rocks (50) ──
    for (let i = 0; i < 50; i++) {
        const x = (rand() - 0.5) * 180;
        const z = (rand() - 0.5) * 180;
        if (Math.abs(x) < 4 && Math.abs(z) < 4) continue;
        const collisionRadius = buildRock(scene, x, z, i, rand, shadow);
        if (collisionRadius > 0) {
            colliders.push({ x, z, radius: collisionRadius });
        }
    }

    // ── Grass (300 clusters) ──
    buildGrass(scene, rand, 300, shadow);

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
