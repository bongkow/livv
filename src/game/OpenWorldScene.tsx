"use client";

import { useEffect, useRef, useCallback } from "react";
import {
    Engine,
    Scene,
    ArcRotateCamera,
    HemisphericLight,
    DirectionalLight,
    Vector3,
    Color3,
    Color4,
    MeshBuilder,
    StandardMaterial,
    TransformNode,
    DynamicTexture,
    ShadowGenerator,
    Mesh,
} from "@babylonjs/core";
import { generateFaceSvg } from "@/utils/faceAvatar";
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

// ─── Avatar builder ───

function buildAvatar(
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

    // ── Head ──
    const head = MeshBuilder.CreateSphere("head", { diameter: 0.7 }, scene);
    head.position.y = 1.85;
    head.parent = root;

    // Render face SVG onto a dynamic texture and apply to the front hemisphere
    const headMat = new StandardMaterial("headMat", scene);
    headMat.diffuseColor = skinColor;

    const faceSvg = generateFaceSvg(address, 256);
    const svgDataUrl =
        "data:image/svg+xml;charset=utf-8," + encodeURIComponent(faceSvg);
    const faceTex = new DynamicTexture("faceTex", 256, scene, true);
    const ctx = faceTex.getContext();
    const img = new Image();
    img.onload = () => {
        ctx.drawImage(img, 0, 0, 256, 256);
        faceTex.update();
    };
    img.src = svgDataUrl;
    headMat.diffuseTexture = faceTex;
    head.material = headMat;

    // ── Hair ──
    const hair = MeshBuilder.CreateSphere("hair", { diameter: 0.75 }, scene);
    hair.position.y = 2.1;
    hair.scaling.set(1, 0.45, 1);
    hair.parent = root;
    const hairMat = new StandardMaterial("hairMat", scene);
    hairMat.diffuseColor = hairCol;
    hair.material = hairMat;

    // ── Torso ──
    const torso = MeshBuilder.CreateCylinder(
        "torso",
        { height: 0.9, diameterTop: 0.6, diameterBottom: 0.5 },
        scene,
    );
    torso.position.y = 1.2;
    torso.parent = root;
    const torsoMat = new StandardMaterial("torsoMat", scene);
    // Shirt color from address byte 12
    const hue = ((bytes[12] ?? 128) / 255) * 360;
    torsoMat.diffuseColor = Color3.FromHSV(hue, 0.5, 0.75);
    torso.material = torsoMat;

    // ── Arms ──
    const armMat = new StandardMaterial("armMat", scene);
    armMat.diffuseColor = skinColor;

    for (const side of [-1, 1]) {
        const arm = MeshBuilder.CreateCylinder(
            side === -1 ? "leftArm" : "rightArm",
            { height: 0.7, diameter: 0.18 },
            scene,
        );
        arm.position.set(side * 0.4, 1.15, 0);
        arm.parent = root;
        arm.material = armMat;
    }

    // ── Legs ──
    const legMat = new StandardMaterial("legMat", scene);
    legMat.diffuseColor = new Color3(0.15, 0.15, 0.3);

    for (const side of [-1, 1]) {
        const leg = MeshBuilder.CreateCylinder(
            side === -1 ? "leftLeg" : "rightLeg",
            { height: 0.7, diameter: 0.22 },
            scene,
        );
        leg.position.set(side * 0.15, 0.35, 0);
        leg.parent = root;
        leg.material = legMat;
    }

    // ── Feet ──
    const footMat = new StandardMaterial("footMat", scene);
    footMat.diffuseColor = new Color3(0.2, 0.2, 0.2);

    for (const side of [-1, 1]) {
        const foot = MeshBuilder.CreateBox(
            side === -1 ? "leftFoot" : "rightFoot",
            { width: 0.2, height: 0.1, depth: 0.35 },
            scene,
        );
        foot.position.set(side * 0.15, 0.05, 0.05);
        foot.parent = root;
        foot.material = footMat;
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

// ─── Ground with simple grid ───

function buildGround(scene: Scene): Mesh {
    const ground = MeshBuilder.CreateGround(
        "ground",
        { width: 200, height: 200, subdivisions: 40 },
        scene,
    );
    const mat = new StandardMaterial("groundMat", scene);
    mat.diffuseColor = new Color3(0.28, 0.55, 0.22);
    mat.specularColor = Color3.Black();
    ground.material = mat;
    ground.receiveShadows = true;

    // Scatter a few simple trees
    const treeMat = new StandardMaterial("treeTrunk", scene);
    treeMat.diffuseColor = new Color3(0.4, 0.25, 0.13);
    const leafMat = new StandardMaterial("treeLeaf", scene);
    leafMat.diffuseColor = new Color3(0.15, 0.5, 0.15);

    for (let i = 0; i < 30; i++) {
        const x = (Math.random() - 0.5) * 160;
        const z = (Math.random() - 0.5) * 160;
        // Skip trees too close to spawn
        if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;

        const trunk = MeshBuilder.CreateCylinder(
            `trunk${i}`,
            { height: 2, diameter: 0.4 },
            scene,
        );
        trunk.position.set(x, 1, z);
        trunk.material = treeMat;

        const leaves = MeshBuilder.CreateSphere(
            `leaves${i}`,
            { diameter: 2.5 },
            scene,
        );
        leaves.position.set(x, 2.8, z);
        leaves.material = leafMat;
    }

    return ground;
}

// ─── Address label (3D text plane) ───

function buildAddressLabel(
    scene: Scene,
    parent: TransformNode,
    address: string,
): void {
    const label = truncateAddress(address);
    const plane = MeshBuilder.CreatePlane("label", { width: 2, height: 0.3 }, scene);
    plane.position.y = 2.7;
    plane.parent = parent;
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;

    const tex = new DynamicTexture("labelTex", { width: 512, height: 64 }, scene, false);
    tex.hasAlpha = true;
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 512, 64);

    // Background pill
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.beginPath();
    ctx.roundRect(8, 8, 496, 48, 24);
    ctx.fill();

    // Text
    ctx.font = "bold 28px monospace";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 256, 32);
    tex.update();

    const mat = new StandardMaterial("labelMat", scene);
    mat.diffuseTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.emissiveColor = Color3.White();
    mat.disableLighting = true;
    plane.material = mat;
}

// ─── Main component ───

interface OpenWorldSceneProps {
    walletAddress: string;
}

export default function OpenWorldScene({ walletAddress }: OpenWorldSceneProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<Engine | null>(null);

    const setup = useCallback(
        (canvas: HTMLCanvasElement) => {
            const engine = new Engine(canvas, true, {
                preserveDrawingBuffer: true,
                stencil: true,
            });
            engineRef.current = engine;

            const scene = new Scene(engine);
            scene.clearColor = new Color4(0.53, 0.81, 0.98, 1);

            // ── Camera ──
            const camera = new ArcRotateCamera(
                "cam",
                -Math.PI / 2,
                Math.PI / 3.5,
                8,
                new Vector3(0, 1.5, 0),
                scene,
            );
            camera.attachControl(canvas, true);
            camera.lowerRadiusLimit = 3;
            camera.upperRadiusLimit = 25;
            camera.wheelPrecision = 30;
            camera.panningSensibility = 0; // disable panning

            // ── Lights ──
            const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
            hemi.intensity = 0.6;

            const sun = new DirectionalLight("sun", new Vector3(-1, -2, 1), scene);
            sun.intensity = 0.8;
            sun.position = new Vector3(20, 40, -20);

            const shadowGen = new ShadowGenerator(1024, sun);
            shadowGen.useBlurExponentialShadowMap = true;

            // ── World ──
            buildGround(scene);

            // ── Player ──
            const player = buildAvatar(scene, walletAddress, shadowGen);
            buildAddressLabel(scene, player, walletAddress);

            // ── Movement (WASD / arrows) ──
            const keys: Record<string, boolean> = {};
            const SPEED = 0.08;

            const onKeyDown = (e: KeyboardEvent) => {
                keys[e.key.toLowerCase()] = true;
            };
            const onKeyUp = (e: KeyboardEvent) => {
                keys[e.key.toLowerCase()] = false;
            };
            window.addEventListener("keydown", onKeyDown);
            window.addEventListener("keyup", onKeyUp);

            scene.onBeforeRenderObservable.add(() => {
                // Derive forward/right from camera orientation (projected onto XZ)
                const forward = camera.getForwardRay().direction;
                forward.y = 0;
                forward.normalize();
                const right = Vector3.Cross(forward, Vector3.Up()).normalize();

                const move = Vector3.Zero();
                if (keys["w"] || keys["arrowup"]) move.addInPlace(forward);
                if (keys["s"] || keys["arrowdown"]) move.subtractInPlace(forward);
                if (keys["a"] || keys["arrowleft"]) move.addInPlace(right);
                if (keys["d"] || keys["arrowright"]) move.subtractInPlace(right);

                if (move.length() > 0.001) {
                    move.normalize().scaleInPlace(SPEED);
                    player.position.addInPlace(move);

                    // Rotate avatar to face movement direction
                    const angle = Math.atan2(move.x, move.z);
                    player.rotation.y = angle;

                    // Camera follows
                    camera.target.x = player.position.x;
                    camera.target.y = 1.5;
                    camera.target.z = player.position.z;
                }
            });

            // ── Render loop ──
            engine.runRenderLoop(() => scene.render());

            const onResize = () => engine.resize();
            window.addEventListener("resize", onResize);

            return () => {
                window.removeEventListener("keydown", onKeyDown);
                window.removeEventListener("keyup", onKeyUp);
                window.removeEventListener("resize", onResize);
                scene.dispose();
                engine.dispose();
                engineRef.current = null;
            };
        },
        [walletAddress],
    );

    useEffect(() => {
        if (!canvasRef.current) return;
        const cleanup = setup(canvasRef.current);
        return cleanup;
    }, [setup]);

    return (
        <canvas
            ref={canvasRef}
            className="h-full w-full outline-none"
            onContextMenu={(e) => e.preventDefault()}
        />
    );
}
