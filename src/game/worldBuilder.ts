/*
 * @Module: worldBuilder
 * @Purpose: Build the ground terrain with natural elements — rocks, grass tufts, insects
 * @Logic: Creates a textured ground, scatters trees/rocks/grass procedurally,
 *         and adds small animated insects for life.
 *         Uses thin instances for grass/rocks/trees to minimize draw calls.
 *         Uses PBR materials for physically-based lighting.
 * @Interfaces: buildWorld(scene, shadowGen?) → { ground, colliders, insects }
 */

import {
    Scene,
    MeshBuilder,
    PBRMaterial,
    Color3,
    Mesh,
    TransformNode,
    Vector3,
    Matrix,
    Quaternion,
    ShadowGenerator,
    CascadedShadowGenerator,
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

// ─── PBR Materials ───

function createMaterials(scene: Scene) {
    const trunk = new PBRMaterial("treeTrunk", scene);
    trunk.albedoColor = new Color3(0.4, 0.25, 0.13);
    trunk.metallic = 0.0;
    trunk.roughness = 0.9;

    const leaf = new PBRMaterial("treeLeaf", scene);
    leaf.albedoColor = new Color3(0.15, 0.5, 0.15);
    leaf.metallic = 0.0;
    leaf.roughness = 0.7;

    const rock = new PBRMaterial("rockMat", scene);
    rock.albedoColor = new Color3(0.45, 0.42, 0.38);
    rock.metallic = 0.0;
    rock.roughness = 0.85;

    const darkRock = new PBRMaterial("darkRockMat", scene);
    darkRock.albedoColor = new Color3(0.3, 0.28, 0.25);
    darkRock.metallic = 0.0;
    darkRock.roughness = 0.9;

    const grassBlade = new PBRMaterial("grassBladeMat", scene);
    grassBlade.albedoColor = new Color3(0.2, 0.55, 0.15);
    grassBlade.metallic = 0.0;
    grassBlade.roughness = 0.6;

    const darkGrass = new PBRMaterial("darkGrassMat", scene);
    darkGrass.albedoColor = new Color3(0.12, 0.4, 0.1);
    darkGrass.metallic = 0.0;
    darkGrass.roughness = 0.65;

    const insectMat = new PBRMaterial("insectMat", scene);
    insectMat.albedoColor = new Color3(0.1, 0.1, 0.1);
    insectMat.metallic = 0.3;
    insectMat.roughness = 0.4;

    const wingMat = new PBRMaterial("wingMat", scene);
    wingMat.albedoColor = new Color3(0.7, 0.7, 0.7);
    wingMat.alpha = 0.4;
    wingMat.metallic = 0.0;
    wingMat.roughness = 0.2;

    return { trunk, leaf, rock, darkRock, grassBlade, darkGrass, insectMat, wingMat };
}

// ─── Insect builder (animated — kept as individual meshes) ───

interface InsectData {
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
    mats: ReturnType<typeof createMaterials>,
): InsectData {
    const node = new TransformNode(`insect${index}`, scene);

    const body = MeshBuilder.CreateSphere(
        `insectBody${index}`,
        { diameter: 0.04, segments: 4 },
        scene,
    );
    body.parent = node;
    body.material = mats.insectMat;

    for (let w = 0; w < 2; w++) {
        const wing = MeshBuilder.CreatePlane(
            `insectWing${index}_${w}`,
            { width: 0.04, height: 0.02 },
            scene,
        );
        wing.parent = node;
        wing.position.x = w === 0 ? -0.025 : 0.025;
        wing.position.y = 0.01;
        wing.material = mats.wingMat;
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
    shadowGen?: ShadowGenerator | CascadedShadowGenerator,
): WorldBuildResult & { insects: InsectData[] } {
    const rand = mulberry32(42); // deterministic seed

    // ── Ground ──
    const ground = MeshBuilder.CreateGround(
        "ground",
        { width: 200, height: 200, subdivisions: 40 },
        scene,
    );
    const groundMat = new PBRMaterial("groundMat", scene);
    groundMat.albedoColor = new Color3(0.28, 0.55, 0.22);
    groundMat.metallic = 0.0;
    groundMat.roughness = 0.85;
    ground.material = groundMat;
    ground.receiveShadows = true;

    const mats = createMaterials(scene);
    const colliders: Collider[] = [];

    // ── Trees (thin instances) ──
    const DEFAULT_TRUNK_HEIGHT = 1;
    const DEFAULT_TRUNK_DIAM = 0.3;
    const masterTrunk = MeshBuilder.CreateCylinder(
        "masterTrunk",
        { height: DEFAULT_TRUNK_HEIGHT, diameter: DEFAULT_TRUNK_DIAM, tessellation: 8 },
        scene,
    );
    masterTrunk.material = mats.trunk;
    masterTrunk.isVisible = false; // hidden until thin instances are added

    const DEFAULT_LEAF_DIAM = 1;
    const masterLeaf = MeshBuilder.CreateSphere(
        "masterLeaf",
        { diameter: DEFAULT_LEAF_DIAM, segments: 8 },
        scene,
    );
    masterLeaf.material = mats.leaf;
    masterLeaf.isVisible = false;

    const TREE_COLLISION_RADIUS = 0.6;
    const identityQuat = Quaternion.Identity();

    for (let i = 0; i < 30; i++) {
        const x = (rand() - 0.5) * 160;
        const z = (rand() - 0.5) * 160;
        if (Math.abs(x) < 6 && Math.abs(z) < 6) {
            // Consume the same random calls to keep determinism
            rand(); rand(); rand();
            continue;
        }

        const heightVariation = 1.5 + rand() * 1.5;
        const leafSize = 1.8 + rand() * 1.5;
        const trunkDiam = 0.3 + rand() * 0.2;

        // Trunk: scale to match varied height & diameter
        const trunkScaleX = trunkDiam / DEFAULT_TRUNK_DIAM;
        const trunkScaleY = heightVariation / DEFAULT_TRUNK_HEIGHT;
        const trunkScaleZ = trunkScaleX;
        const trunkMatrix = Matrix.Compose(
            new Vector3(trunkScaleX, trunkScaleY, trunkScaleZ),
            identityQuat,
            new Vector3(x, heightVariation / 2, z),
        );
        masterTrunk.thinInstanceAdd(trunkMatrix);

        // Leaves: scale to match varied size, with squash
        const leafSquash = 0.7 + rand() * 0.3;
        const leafScaleXZ = leafSize / DEFAULT_LEAF_DIAM;
        const leafScaleY = leafSquash * leafSize / DEFAULT_LEAF_DIAM;
        const leafMatrix = Matrix.Compose(
            new Vector3(leafScaleXZ, leafScaleY, leafScaleXZ),
            identityQuat,
            new Vector3(x, heightVariation + leafSize * 0.35, z),
        );
        masterLeaf.thinInstanceAdd(leafMatrix);

        colliders.push({ x, z, radius: TREE_COLLISION_RADIUS });
    }

    masterTrunk.isVisible = true;
    masterLeaf.isVisible = true;
    masterTrunk.thinInstanceRefreshBoundingInfo();
    masterLeaf.thinInstanceRefreshBoundingInfo();

    if (shadowGen) {
        shadowGen.addShadowCaster(masterTrunk);
        shadowGen.addShadowCaster(masterLeaf);
    }

    // ── Rocks (thin instances, 2 material groups) ──
    const DEFAULT_ROCK_DIAM = 1;
    const masterRock = MeshBuilder.CreateSphere(
        "masterRock",
        { diameter: DEFAULT_ROCK_DIAM, segments: 6 },
        scene,
    );
    masterRock.material = mats.rock;
    masterRock.isVisible = false;

    const masterDarkRock = MeshBuilder.CreateSphere(
        "masterDarkRock",
        { diameter: DEFAULT_ROCK_DIAM, segments: 6 },
        scene,
    );
    masterDarkRock.material = mats.darkRock;
    masterDarkRock.isVisible = false;

    for (let i = 0; i < 60; i++) {
        const x = (rand() - 0.5) * 180;
        const z = (rand() - 0.5) * 180;
        if (Math.abs(x) < 4 && Math.abs(z) < 4) {
            // Consume random calls for determinism
            rand(); rand(); rand(); rand(); rand();
            continue;
        }

        const size = 0.3 + rand() * 0.8;
        const scaleX = (0.8 + rand() * 0.5) * size;
        const scaleY = (0.4 + rand() * 0.4) * size;
        const scaleZ = (0.8 + rand() * 0.5) * size;
        const rotY = rand() * Math.PI * 2;
        const isDark = rand() > 0.5;

        const rotQuat = Quaternion.FromEulerAngles(0, rotY, 0);
        const matrix = Matrix.Compose(
            new Vector3(scaleX, scaleY, scaleZ),
            rotQuat,
            new Vector3(x, size * 0.3, z),
        );

        if (isDark) {
            masterDarkRock.thinInstanceAdd(matrix);
        } else {
            masterRock.thinInstanceAdd(matrix);
        }

        if (size > 0.7) {
            colliders.push({ x, z, radius: size * 0.5 });
        }
    }

    masterRock.isVisible = true;
    masterDarkRock.isVisible = true;
    masterRock.thinInstanceRefreshBoundingInfo();
    masterDarkRock.thinInstanceRefreshBoundingInfo();

    if (shadowGen) {
        shadowGen.addShadowCaster(masterRock);
        shadowGen.addShadowCaster(masterDarkRock);
    }

    // ── Grass (thin instances, 2 material groups) ──
    const masterGrass = MeshBuilder.CreatePlane(
        "masterGrass",
        { width: 0.05, height: 0.25 },
        scene,
    );
    masterGrass.material = mats.grassBlade;
    masterGrass.isVisible = false;

    const masterDarkGrass = MeshBuilder.CreatePlane(
        "masterDarkGrass",
        { width: 0.05, height: 0.25 },
        scene,
    );
    masterDarkGrass.material = mats.darkGrass;
    masterDarkGrass.isVisible = false;

    const DEFAULT_BLADE_HEIGHT = 0.25;

    for (let i = 0; i < 200; i++) {
        const x = (rand() - 0.5) * 190;
        const z = (rand() - 0.5) * 190;

        const bladeCount = 3 + Math.floor(rand() * 5);
        for (let b = 0; b < bladeCount; b++) {
            const bladeHeight = 0.15 + rand() * 0.2;
            const bx = x + (rand() - 0.5) * 0.3;
            const by = 0.1 + rand() * 0.05;
            const bz = z + (rand() - 0.5) * 0.3;
            const rotYVal = rand() * Math.PI;
            const rotXVal = -0.1 + rand() * 0.2;
            const isDark = rand() <= 0.4;

            const heightScale = bladeHeight / DEFAULT_BLADE_HEIGHT;
            const rotQuat = Quaternion.FromEulerAngles(rotXVal, rotYVal, 0);
            const matrix = Matrix.Compose(
                new Vector3(1, heightScale, 1),
                rotQuat,
                new Vector3(bx, by, bz),
            );

            if (isDark) {
                masterDarkGrass.thinInstanceAdd(matrix);
            } else {
                masterGrass.thinInstanceAdd(matrix);
            }
        }
    }

    masterGrass.isVisible = true;
    masterDarkGrass.isVisible = true;
    masterGrass.thinInstanceRefreshBoundingInfo();
    masterDarkGrass.thinInstanceRefreshBoundingInfo();

    // ── Insects (15, individual meshes for per-frame animation) ──
    const insects: InsectData[] = [];
    for (let i = 0; i < 15; i++) {
        const x = (rand() - 0.5) * 140;
        const z = (rand() - 0.5) * 140;
        insects.push(buildInsect(scene, x, z, i, rand, mats));
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
