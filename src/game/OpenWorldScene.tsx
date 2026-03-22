"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import dynamic from "next/dynamic";
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
import type { AvatarRig } from "@/game/avatarBuilder";
import { useGamePresenceStore } from "@/stores/useGamePresenceStore";
import { useWebSocketStore } from "@/stores/useWebSocketStore";

const AvatarDetailPanel = dynamic(() => import("@/components/AvatarDetailPanel"), {
    ssr: false,
});

// ─── Collision helpers ───

import type { Collider } from "@/game/worldBuilder";
import { buildWorld, animateInsects } from "@/game/worldBuilder";

const WORLD_HALF = 98; // world boundary (ground is 200×200, keep 2 units of margin)
const PLAYER_RADIUS = 0.3;

function isPositionBlocked(x: number, z: number, colliders: Collider[]): boolean {
    // World boundary check
    if (Math.abs(x) > WORLD_HALF || Math.abs(z) > WORLD_HALF) return true;

    // Object collision check (circle vs circle in XZ)
    for (const c of colliders) {
        const dx = x - c.x;
        const dz = z - c.z;
        const minDist = PLAYER_RADIUS + c.radius;
        if (dx * dx + dz * dz < minDist * minDist) return true;
    }
    return false;
}

// ─── Walk animation helper ───

function animateWalkCycle(rig: AvatarRig, walkPhase: number, intensity: number) {
    const LEG_SWING = 0.45;   // max leg rotation (radians)
    const ARM_SWING = 0.35;   // max arm rotation (radians)
    const HEAD_BOB = 0.015;   // vertical head bobbing amount
    const BODY_BOB = 0.02;    // vertical body bounce amount

    const t = intensity; // 0 = standing, 1 = full walk

    // Legs swing in opposition: left forward = right backward
    rig.leftLegPivot.rotation.x = Math.sin(walkPhase) * LEG_SWING * t;
    rig.rightLegPivot.rotation.x = Math.sin(walkPhase + Math.PI) * LEG_SWING * t;

    // Arms swing opposite to same-side leg (natural gait)
    rig.leftArmPivot.rotation.x = Math.sin(walkPhase + Math.PI) * ARM_SWING * t;
    rig.rightArmPivot.rotation.x = Math.sin(walkPhase) * ARM_SWING * t;

    // Head bobs at double frequency (two steps per cycle)
    rig.head.position.y = rig.headBaseY + Math.abs(Math.sin(walkPhase)) * HEAD_BOB * t;

    // Body bounces up slightly at mid-stride
    rig.root.position.y = Math.abs(Math.sin(walkPhase)) * BODY_BOB * t;
}

// ─── Main component ───

interface OpenWorldSceneProps {
    walletAddress: string;
}

export default function OpenWorldScene({ walletAddress }: OpenWorldSceneProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<Engine | null>(null);
    const coordRef = useRef<HTMLSpanElement>(null);
    const [showDetail, setShowDetail] = useState(false);
    const [detailAddress, setDetailAddress] = useState("");

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
            camera.upperBetaLimit = Math.PI / 2.05; // prevent camera from going below ground
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
            const { colliders, insects } = buildWorld(scene);
            let elapsedTime = 0;

            // ── Player ──
            const rig = buildAvatar(scene, walletAddress, shadowGen);
            const labelMesh = buildAddressLabel(scene, rig.root, walletAddress, true);

            // ── Make label clickable ──
            labelMesh.isPickable = true;
            scene.onPointerDown = (_evt, pickResult) => {
                if (pickResult?.hit && pickResult.pickedMesh?.name === "label") {
                    // Determine whose label was clicked
                    const clickedRoot = pickResult.pickedMesh.parent;
                    if (clickedRoot === rig.root) {
                        setDetailAddress(walletAddress);
                    } else {
                        // Find remote player by root reference
                        for (const [addr, remote] of remoteAvatars) {
                            if (remote.rig.root === clickedRoot) {
                                setDetailAddress(addr);
                                break;
                            }
                        }
                    }
                    setShowDetail(true);
                }
            };

            // ── Movement (WASD / arrows) + walk animation ──
            const keys: Record<string, boolean> = {};
            const SPEED = 0.08;
            const WALK_CYCLE_SPEED = 8; // how fast the walk cycle plays
            let walkPhase = 0;
            let walkIntensity = 0; // lerps 0→1 when moving, 1→0 when stopping

            // ── Remote avatar tracking ──
            const remoteAvatars = new Map<string, {
                rig: AvatarRig;
                walkPhase: number;
                walkIntensity: number;
                prevX: number;
                prevZ: number;
            }>();
            const BROADCAST_INTERVAL = 0.1; // seconds (~10Hz)
            let positionBroadcastTimer = 0;

            const onKeyDown = (e: KeyboardEvent) => {
                keys[e.key.toLowerCase()] = true;
            };
            const onKeyUp = (e: KeyboardEvent) => {
                keys[e.key.toLowerCase()] = false;
            };
            window.addEventListener("keydown", onKeyDown);
            window.addEventListener("keyup", onKeyUp);

            scene.onBeforeRenderObservable.add(() => {
                const dt = engine.getDeltaTime() / 1000; // seconds

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

                const isMoving = move.length() > 0.001;

                if (isMoving) {
                    move.normalize().scaleInPlace(SPEED);

                    const curX = rig.root.position.x;
                    const curZ = rig.root.position.z;
                    const newX = curX + move.x;
                    const newZ = curZ + move.z;

                    // Try full move first; if blocked, try axis-separated (wall sliding)
                    if (!isPositionBlocked(newX, newZ, colliders)) {
                        rig.root.position.x = newX;
                        rig.root.position.z = newZ;
                    } else if (!isPositionBlocked(newX, curZ, colliders)) {
                        rig.root.position.x = newX;
                    } else if (!isPositionBlocked(curX, newZ, colliders)) {
                        rig.root.position.z = newZ;
                    }
                    // else: fully blocked, don't move

                    // Rotate avatar to face movement direction
                    const angle = Math.atan2(move.x, move.z);
                    rig.root.rotation.y = angle;

                    // Camera follows
                    camera.target.x = rig.root.position.x;
                    camera.target.y = 1.5;
                    camera.target.z = rig.root.position.z;

                    // Advance walk phase
                    walkPhase += WALK_CYCLE_SPEED * dt;

                    // Smoothly ramp up walk intensity
                    walkIntensity = Math.min(1, walkIntensity + dt * 6);
                } else {
                    // Smoothly ramp down walk intensity
                    walkIntensity = Math.max(0, walkIntensity - dt * 6);
                }

                // Animate limbs (lerps back to standing when stopped)
                animateWalkCycle(rig, walkPhase, walkIntensity);

                // Animate insects
                elapsedTime += dt;
                animateInsects(insects, elapsedTime);

                // Update coordinate display (direct DOM for perf)
                if (coordRef.current) {
                    const px = rig.root.position.x.toFixed(1);
                    const py = rig.root.position.y.toFixed(1);
                    const pz = rig.root.position.z.toFixed(1);
                    coordRef.current.textContent = `X: ${px}  Y: ${py}  Z: ${pz}`;
                }

                // ── Broadcast local position (throttled ~10Hz) ──
                positionBroadcastTimer += dt;
                if (isMoving && positionBroadcastTimer >= BROADCAST_INTERVAL) {
                    positionBroadcastTimer = 0;
                    const wsStore = useWebSocketStore.getState();
                    wsStore.sendMessage("broadcastToChannel", {
                        type: "position",
                        x: rig.root.position.x,
                        z: rig.root.position.z,
                        rotY: rig.root.rotation.y,
                    });
                }

                // ── Remote avatars: spawn / despawn / lerp ──
                const presenceStore = useGamePresenceStore.getState();
                const remotePlayers = presenceStore.remotePlayers;

                // Spawn new remote avatars
                for (const [addr, player] of remotePlayers) {
                    if (remoteAvatars.has(addr)) continue;

                    const remoteRig = buildAvatar(scene, player.address, shadowGen);
                    const remoteLabelMesh = buildAddressLabel(scene, remoteRig.root, player.address);
                    remoteLabelMesh.isPickable = true;
                    remoteRig.root.position.x = player.x;
                    remoteRig.root.position.z = player.z;
                    remoteRig.root.rotation.y = player.rotY;
                    remoteAvatars.set(addr, {
                        rig: remoteRig,
                        walkPhase: 0,
                        walkIntensity: 0,
                        prevX: player.x,
                        prevZ: player.z,
                    });
                }

                // Despawn removed remote avatars
                for (const [addr, remote] of remoteAvatars) {
                    if (!remotePlayers.has(addr)) {
                        remote.rig.root.dispose();
                        remoteAvatars.delete(addr);
                    }
                }

                // Lerp existing remote avatars toward their targets
                const LERP_SPEED = 8; // units / second interpolation factor
                for (const [addr, remote] of remoteAvatars) {
                    const playerData = remotePlayers.get(addr);
                    if (!playerData) continue;

                    const lerpFactor = Math.min(1, dt * LERP_SPEED);
                    const oldX = remote.rig.root.position.x;
                    const oldZ = remote.rig.root.position.z;

                    remote.rig.root.position.x += (playerData.targetX - oldX) * lerpFactor;
                    remote.rig.root.position.z += (playerData.targetZ - oldZ) * lerpFactor;
                    remote.rig.root.rotation.y += (playerData.targetRotY - remote.rig.root.rotation.y) * lerpFactor;

                    // Detect movement for walk animation
                    const dx = remote.rig.root.position.x - remote.prevX;
                    const dz = remote.rig.root.position.z - remote.prevZ;
                    const remoteIsMoving = (dx * dx + dz * dz) > 0.00001;

                    if (remoteIsMoving) {
                        remote.walkPhase += WALK_CYCLE_SPEED * dt;
                        remote.walkIntensity = Math.min(1, remote.walkIntensity + dt * 6);
                    } else {
                        remote.walkIntensity = Math.max(0, remote.walkIntensity - dt * 6);
                    }
                    animateWalkCycle(remote.rig, remote.walkPhase, remote.walkIntensity);

                    remote.prevX = remote.rig.root.position.x;
                    remote.prevZ = remote.rig.root.position.z;
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
                // Clean up remote avatars
                for (const [, remote] of remoteAvatars) {
                    remote.rig.root.dispose();
                }
                remoteAvatars.clear();
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
        <div className="relative h-full w-full">
            <canvas
                ref={canvasRef}
                className="h-full w-full outline-none"
                onContextMenu={(e) => e.preventDefault()}
            />
            <div className="absolute bottom-4 left-4 rounded bg-black/60 px-3 py-1.5 font-mono text-xs text-white/80 backdrop-blur-sm">
                <span ref={coordRef}>X: 0.0  Y: 0.0  Z: 0.0</span>
            </div>
            {showDetail && detailAddress && (
                <AvatarDetailPanel
                    address={detailAddress}
                    onClose={() => setShowDetail(false)}
                />
            )}
        </div>
    );
}
