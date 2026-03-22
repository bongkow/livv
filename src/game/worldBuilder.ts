/*
 * @Module: worldBuilder
 * @Purpose: Build the ground terrain with natural elements — rocks, grass tufts, insects
 * @Logic: Creates a textured ground, scatters trees/rocks/grass procedurally,
 *         and adds small animated insects for life.
 * @Interfaces: buildWorld(scene) → { ground, colliders }
 */

import {
    Scene,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Mesh,
    TransformNode,
    Vector3,
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

// ─── Materials cache ───

function createMaterials(scene: Scene) {
    const trunk = new StandardMaterial("treeTrunk", scene);
    trunk.diffuseColor = new Color3(0.4, 0.25, 0.13);
    trunk.specularColor = Color3.Black();

    const leaf = new StandardMaterial("treeLeaf", scene);
    leaf.diffuseColor = new Color3(0.15, 0.5, 0.15);
    leaf.specularColor = Color3.Black();

    const rock = new StandardMaterial("rockMat", scene);
    rock.diffuseColor = new Color3(0.45, 0.42, 0.38);
    rock.specularColor = new Color3(0.1, 0.1, 0.1);

    const darkRock = new StandardMaterial("darkRockMat", scene);
    darkRock.diffuseColor = new Color3(0.3, 0.28, 0.25);
    darkRock.specularColor = Color3.Black();

    const grassBlade = new StandardMaterial("grassBladeMat", scene);
    grassBlade.diffuseColor = new Color3(0.2, 0.55, 0.15);
    grassBlade.specularColor = Color3.Black();

    const darkGrass = new StandardMaterial("darkGrassMat", scene);
    darkGrass.diffuseColor = new Color3(0.12, 0.4, 0.1);
    darkGrass.specularColor = Color3.Black();

    const insectMat = new StandardMaterial("insectMat", scene);
    insectMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
    insectMat.specularColor = Color3.Black();

    return { trunk, leaf, rock, darkRock, grassBlade, darkGrass, insectMat };
}

// ─── Tree builder ───

function buildTree(
    scene: Scene,
    x: number,
    z: number,
    index: number,
    rand: () => number,
    mats: ReturnType<typeof createMaterials>,
): void {
    const heightVariation = 1.5 + rand() * 1.5; // 1.5 – 3.0
    const leafSize = 1.8 + rand() * 1.5;        // 1.8 – 3.3
    const trunkDiam = 0.3 + rand() * 0.2;

    const trunkMesh = MeshBuilder.CreateCylinder(
        `trunk${index}`,
        { height: heightVariation, diameter: trunkDiam, tessellation: 8 },
        scene,
    );
    trunkMesh.position.set(x, heightVariation / 2, z);
    trunkMesh.material = mats.trunk;

    const leavesMesh = MeshBuilder.CreateSphere(
        `leaves${index}`,
        { diameter: leafSize, segments: 8 },
        scene,
    );
    leavesMesh.position.set(x, heightVariation + leafSize * 0.35, z);
    leavesMesh.scaling.y = 0.7 + rand() * 0.3; // slightly squashed
    leavesMesh.material = mats.leaf;
}

// ─── Rock builder ───

function buildRock(
    scene: Scene,
    x: number,
    z: number,
    index: number,
    rand: () => number,
    mats: ReturnType<typeof createMaterials>,
): number {
    const size = 0.3 + rand() * 0.8; // 0.3 – 1.1 meters
    const rock = MeshBuilder.CreateSphere(
        `rock${index}`,
        { diameter: size, segments: 6 },
        scene,
    );
    rock.position.set(x, size * 0.3, z); // partially buried
    rock.scaling.set(
        0.8 + rand() * 0.5,
        0.4 + rand() * 0.4,
        0.8 + rand() * 0.5,
    );
    rock.rotation.y = rand() * Math.PI * 2;
    rock.material = rand() > 0.5 ? mats.rock : mats.darkRock;

    return size > 0.7 ? size * 0.5 : 0; // only big rocks are colliders
}

// ─── Grass tuft builder ───

function buildGrassTuft(
    scene: Scene,
    x: number,
    z: number,
    index: number,
    rand: () => number,
    mats: ReturnType<typeof createMaterials>,
): void {
    const bladeCount = 3 + Math.floor(rand() * 5); // 3 – 7 blades

    for (let b = 0; b < bladeCount; b++) {
        const blade = MeshBuilder.CreatePlane(
            `grass${index}_${b}`,
            { width: 0.05, height: 0.15 + rand() * 0.2 },
            scene,
        );
        blade.position.set(
            x + (rand() - 0.5) * 0.3,
            0.1 + rand() * 0.05,
            z + (rand() - 0.5) * 0.3,
        );
        blade.rotation.y = rand() * Math.PI;
        blade.rotation.x = -0.1 + rand() * 0.2; // slight lean
        blade.material = rand() > 0.4 ? mats.grassBlade : mats.darkGrass;
    }
}

// ─── Insect builder (animated) ───

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

    // Tiny body
    const body = MeshBuilder.CreateSphere(
        `insectBody${index}`,
        { diameter: 0.04, segments: 4 },
        scene,
    );
    body.parent = node;
    body.material = mats.insectMat;

    // Tiny wings
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

export function buildWorld(scene: Scene): WorldBuildResult & { insects: InsectData[] } {
    const rand = mulberry32(42); // deterministic seed

    // Ground plane
    const ground = MeshBuilder.CreateGround(
        "ground",
        { width: 200, height: 200, subdivisions: 40 },
        scene,
    );
    const groundMat = new StandardMaterial("groundMat", scene);
    groundMat.diffuseColor = new Color3(0.28, 0.55, 0.22);
    groundMat.specularColor = Color3.Black();
    ground.material = groundMat;
    ground.receiveShadows = true;

    const mats = createMaterials(scene);
    const colliders: Collider[] = [];

    // ── Trees (30) ──
    const TREE_COLLISION_RADIUS = 0.6;
    for (let i = 0; i < 30; i++) {
        const x = (rand() - 0.5) * 160;
        const z = (rand() - 0.5) * 160;
        if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;

        buildTree(scene, x, z, i, rand, mats);
        colliders.push({ x, z, radius: TREE_COLLISION_RADIUS });
    }

    // ── Rocks (60) ──
    for (let i = 0; i < 60; i++) {
        const x = (rand() - 0.5) * 180;
        const z = (rand() - 0.5) * 180;
        if (Math.abs(x) < 4 && Math.abs(z) < 4) continue;

        const collisionRadius = buildRock(scene, x, z, i, rand, mats);
        if (collisionRadius > 0) {
            colliders.push({ x, z, radius: collisionRadius });
        }
    }

    // ── Grass tufts (200) ──
    for (let i = 0; i < 200; i++) {
        const x = (rand() - 0.5) * 190;
        const z = (rand() - 0.5) * 190;
        buildGrassTuft(scene, x, z, i, rand, mats);
    }

    // ── Insects (15) ──
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
    const time = Date.now() / 1000; // shared clock across all clients
    for (const insect of insects) {
        const t = time * insect.speed + insect.phase;
        insect.node.position.set(
            insect.centerX + Math.sin(t) * insect.radius,
            insect.heightOffset + Math.sin(t * 3) * 0.1, // bobbing
            insect.centerZ + Math.cos(t) * insect.radius,
        );
        // Face direction of motion
        insect.node.rotation.y = t + Math.PI / 2;
    }
}
