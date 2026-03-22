/*
 * @Module: Avatar3D
 * @Purpose: Reusable 3D avatar rendered in a small Babylon.js canvas
 * @Logic: Creates a tiny Babylon engine, renders the shared buildAvatar character
 *         with fixed camera, soft lighting, transparent background, and slow idle rotation.
 * @Interfaces: default export Avatar3D ({ address, size? })
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
}

export default function Avatar3D({ address, size = 200 }: Avatar3DProps) {
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
            const camera = new ArcRotateCamera(
                "avatarCam",
                -Math.PI / 2,
                Math.PI / 2.8,
                4,
                new Vector3(0, 1.1, 0),
                scene,
            );
            camera.lowerRadiusLimit = 4;
            camera.upperRadiusLimit = 4;
            // No user interaction — display-only
            camera.inputs.clear();

            // ── Soft lighting ──
            const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0.3), scene);
            hemi.intensity = 1.0;

            // ── Build avatar ──
            const player = buildAvatar(scene, address);

            // ── Slow idle rotation ──
            let angle = 0;
            scene.onBeforeRenderObservable.add(() => {
                angle += 0.005;
                player.rotation.y = angle;
            });

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
        [address],
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
