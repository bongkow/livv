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
    ShadowGenerator,
    Mesh,
} from "@babylonjs/core";
import { buildAvatar, buildAddressLabel } from "@/game/avatarBuilder";

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
