/*
 * @Module: Avatar3D
 * @Purpose: Reusable 3D avatar rendered in a small Babylon.js canvas
 * @Logic: Creates a tiny Babylon engine, renders the shared buildAvatar character
 *         with fixed camera, soft lighting, transparent background, and slow idle rotation.
 *         When `interactive` is true, the camera can be orbited and zoomed with the mouse.
 * @Interfaces: default export Avatar3D ({ address, size?, interactive? })
 * @Constraints: Client-only (uses canvas). Disposes engine on unmount.
 */
"use client";

import { useEffect, useRef, useCallback } from "react";
import {
    Engine,
    Scene,
    ArcRotateCamera,
    HemisphericLight,
    Vector3,
    Color4,
} from "@babylonjs/core";
import { buildAvatar } from "@/game/avatarBuilder";

interface Avatar3DProps {
    address: string;
    size?: number;
    interactive?: boolean;
    faceOnly?: boolean;
}

export default function Avatar3D({ address, size = 200, interactive = false, faceOnly = false }: Avatar3DProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<Engine | null>(null);

    const setup = useCallback(
        (canvas: HTMLCanvasElement) => {
            const engine = new Engine(canvas, true, {
                preserveDrawingBuffer: true,
                stencil: true,
                alpha: true,
            });
            engineRef.current = engine;

            const scene = new Scene(engine);
            scene.clearColor = new Color4(0, 0, 0, 0);

            // ── Camera — framing the avatar ──
            const camRadius = faceOnly ? 1.3 : 4;
            const camTargetY = faceOnly ? 1.75 : 1.1;
            const camBeta = faceOnly ? Math.PI / 2 : Math.PI / 2.8;
            const camera = new ArcRotateCamera(
                "avatarCam",
                Math.PI / 2,
                camBeta,
                camRadius,
                new Vector3(0, camTargetY, 0),
                scene,
            );

            if (interactive) {
                // Allow orbit + zoom with mouse
                camera.attachControl(canvas, true);
                camera.lowerRadiusLimit = 2.5;
                camera.upperRadiusLimit = 7;
                camera.lowerBetaLimit = 0.3;
                camera.upperBetaLimit = Math.PI - 0.3;
                camera.panningSensibility = 0; // disable panning
            } else {
                camera.lowerRadiusLimit = camRadius;
                camera.upperRadiusLimit = camRadius;
                // No user interaction — display-only
                camera.inputs.clear();
            }

            // ── Soft lighting ──
            const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0.3), scene);
            hemi.intensity = 1.0;

            // ── Build avatar ──
            const rig = buildAvatar(scene, address);

            // ── Slow idle rotation (disabled when interactive or faceOnly) ──
            if (!interactive && !faceOnly) {
                let angle = 0;
                scene.onBeforeRenderObservable.add(() => {
                    angle += 0.005;
                    rig.root.rotation.y = angle;
                });
            }

            // ── Render loop ──
            engine.runRenderLoop(() => scene.render());

            const onResize = () => engine.resize();
            window.addEventListener("resize", onResize);

            return () => {
                window.removeEventListener("resize", onResize);
                scene.dispose();
                engine.dispose();
                engineRef.current = null;
            };
        },
        [address, interactive, faceOnly],
    );

    useEffect(() => {
        if (!canvasRef.current) return;
        const cleanup = setup(canvasRef.current);
        return cleanup;
    }, [setup]);

    return (
        <canvas
            ref={canvasRef}
            width={size}
            height={size}
            className="block"
            style={{ width: size, height: size }}
        />
    );
}
