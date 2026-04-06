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
    CascadedShadowGenerator,
    DefaultRenderingPipeline,
    SSAO2RenderingPipeline,
} from "@babylonjs/core";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { buildAvatar, buildAddressLabel, clearMaterialCache } from "@/game/avatarBuilder";
import type { AvatarRig } from "@/game/avatarBuilder";
import { useGamePresenceStore } from "@/stores/useGamePresenceStore";
import { useWebSocketStore } from "@/stores/useWebSocketStore";

const AvatarDetailPanel = dynamic(() => import("@/components/AvatarDetailPanel"), {
    ssr: false,
});

// ─── Collision helpers ───

import type { Collider } from "@/game/worldBuilder";
import { buildWorld, animateInsects } from "@/game/worldBuilder";

const WORLD_HALF = 98;
const PLAYER_RADIUS = 0.3;

function isPositionBlocked(x: number, z: number, colliders: Collider[]): boolean {
    if (Math.abs(x) > WORLD_HALF || Math.abs(z) > WORLD_HALF) return true;

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
    const LEG_SWING = 0.45;
    const ARM_SWING = 0.35;
    const HEAD_BOB = 0.015;
    const BODY_BOB = 0.02;

    const t = intensity;

    rig.leftLegPivot.rotation.x = Math.sin(walkPhase) * LEG_SWING * t;
    rig.rightLegPivot.rotation.x = Math.sin(walkPhase + Math.PI) * LEG_SWING * t;

    rig.leftArmPivot.rotation.x = Math.sin(walkPhase + Math.PI) * ARM_SWING * t;
    rig.rightArmPivot.rotation.x = Math.sin(walkPhase) * ARM_SWING * t;

    rig.head.position.y = rig.headBaseY + Math.abs(Math.sin(walkPhase)) * HEAD_BOB * t;

    rig.root.position.y = Math.abs(Math.sin(walkPhase)) * BODY_BOB * t;
}

// ─── WebGPU / WebGL engine creation ───

async function createEngine(canvas: HTMLCanvasElement): Promise<{ engine: Engine | WebGPUEngine; isWebGPU: boolean }> {
    try {
        const webGPUSupported = await WebGPUEngine.IsSupportedAsync;
        if (webGPUSupported) {
            const engine = new WebGPUEngine(canvas, {
                stencil: true,
                antialias: true,
            });
            await engine.initAsync();
            return { engine, isWebGPU: true };
        }
    } catch {
        // WebGPU init failed, fall back to WebGL
    }
    const engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
    });
    return { engine, isWebGPU: false };
}

// ─── Main component ───

interface OpenWorldSceneProps {
    walletAddress: string;
}

export default function OpenWorldScene({ walletAddress }: OpenWorldSceneProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<Engine | WebGPUEngine | null>(null);
    const coordRef = useRef<HTMLSpanElement>(null);
    const viewModeRef = useRef<HTMLSpanElement>(null);
    const engineBadgeRef = useRef<HTMLSpanElement>(null);
    const [showDetail, setShowDetail] = useState(false);
    const [detailAddress, setDetailAddress] = useState("");

    const setup = useCallback(
        async (canvas: HTMLCanvasElement) => {
            const { engine, isWebGPU } = await createEngine(canvas);
            engineRef.current = engine;

            // Show engine type in HUD
            if (engineBadgeRef.current) {
                engineBadgeRef.current.textContent = isWebGPU ? "WebGPU" : "WebGL";
            }

            const scene = new Scene(engine);
            scene.clearColor = new Color4(0.53, 0.81, 0.98, 1);

            // ── Atmospheric fog ──
            scene.fogMode = Scene.FOGMODE_EXP2;
            scene.fogColor = new Color3(0.53, 0.81, 0.98);
            scene.fogDensity = 0.008;

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
            camera.upperBetaLimit = Math.PI / 2.05;
            camera.wheelPrecision = 30;
            camera.panningSensibility = 0;

            // ── Lights ──
            const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
            hemi.intensity = 0.6;

            const sun = new DirectionalLight("sun", new Vector3(-1, -2, 1), scene);
            sun.intensity = 0.8;
            sun.position = new Vector3(20, 40, -20);

            // ── Cascaded Shadow Maps ──
            const shadowGen = new CascadedShadowGenerator(2048, sun);
            shadowGen.useBlurExponentialShadowMap = true;
            shadowGen.numCascades = 4;
            shadowGen.cascadeBlendPercentage = 0.1;
            shadowGen.autoCalcDepthBounds = true;

            // ── Post-processing pipeline ──
            const pipeline = new DefaultRenderingPipeline("default", true, scene, [camera]);
            pipeline.bloomEnabled = true;
            pipeline.bloomThreshold = 0.8;
            pipeline.bloomWeight = 0.3;
            pipeline.bloomScale = 0.5;
            pipeline.fxaaEnabled = true;
            pipeline.imageProcessingEnabled = true;
            pipeline.imageProcessing.toneMappingEnabled = true;
            pipeline.imageProcessing.contrast = 1.1;
            pipeline.imageProcessing.exposure = 1.0;

            // ── SSAO (ambient occlusion) ──
            const ssao = new SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [camera], true);
            ssao.radius = 8;
            ssao.totalStrength = 0.8;
            ssao.expensiveBlur = true;

            // ── World ──
            const { colliders, insects } = buildWorld(scene, shadowGen);

            // ── Player ──
            const rig = buildAvatar(scene, walletAddress, shadowGen);

            // Restore last position from localStorage
            const POSITION_STORAGE_KEY = `livv:lastPosition:${walletAddress.toLowerCase()}`;
            let savedPos = { x: 0, z: 0, rotY: 0 };
            try {
                const stored = localStorage.getItem(POSITION_STORAGE_KEY);
                if (stored) savedPos = JSON.parse(stored);
            } catch { /* ignore corrupt data */ }

            // Avoid spawning on top of existing players
            const existingPlayers = useGamePresenceStore.getState().remotePlayers;
            let spawnX = savedPos.x, spawnZ = savedPos.z;
            const SPAWN_CLEAR_RADIUS = 1.0;
            for (let attempt = 0; attempt < 10; attempt++) {
                let blocked = false;
                for (const [, p] of existingPlayers) {
                    const dx = spawnX - p.x;
                    const dz = spawnZ - p.z;
                    if (dx * dx + dz * dz < SPAWN_CLEAR_RADIUS * SPAWN_CLEAR_RADIUS) {
                        blocked = true;
                        break;
                    }
                }
                if (!blocked) break;
                const angle = Math.random() * Math.PI * 2;
                spawnX += Math.cos(angle) * 2;
                spawnZ += Math.sin(angle) * 2;
            }
            rig.root.position.x = spawnX;
            rig.root.position.z = spawnZ;
            rig.root.rotation.y = savedPos.rotY;

            useGamePresenceStore.getState().setLocalPosition(spawnX, spawnZ, savedPos.rotY);

            const labelMesh = buildAddressLabel(scene, rig.root, walletAddress, true);

            // ── Make label clickable ──
            labelMesh.isPickable = true;
            scene.onPointerDown = (_evt, pickResult) => {
                if (pickResult?.hit && pickResult.pickedMesh?.name === "label") {
                    const clickedRoot = pickResult.pickedMesh.parent;
                    if (clickedRoot === rig.root) {
                        setDetailAddress(walletAddress);
                    } else {
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
            const WALK_CYCLE_SPEED = 8;
            let walkPhase = 0;
            let walkIntensity = 0;

            // ── Remote avatar tracking ──
            const remoteAvatars = new Map<string, {
                rig: AvatarRig;
                walkPhase: number;
                walkIntensity: number;
                prevX: number;
                prevZ: number;
            }>();
            const BROADCAST_INTERVAL = 0.05; // seconds (~20Hz)
            let positionBroadcastTimer = 0;
            let lastBroadcastX = 0;
            let lastBroadcastZ = 0;
            let lastBroadcastTime = 0;
            let wasBroadcasting = false;

            // ── First-person / Third-person toggle ──
            let isFirstPerson = false;
            const THIRD_PERSON_RADIUS = 8;
            const FIRST_PERSON_RADIUS = 0.1;

            function setAvatarVisibility(visible: boolean) {
                rig.root.getChildMeshes().forEach((m) => {
                    m.isVisible = visible;
                });
                labelMesh.isVisible = visible;
            }

            function toggleViewMode() {
                isFirstPerson = !isFirstPerson;
                if (isFirstPerson) {
                    camera.radius = FIRST_PERSON_RADIUS;
                    camera.lowerRadiusLimit = FIRST_PERSON_RADIUS;
                    camera.upperRadiusLimit = FIRST_PERSON_RADIUS;
                    setAvatarVisibility(false);
                } else {
                    camera.radius = THIRD_PERSON_RADIUS;
                    camera.lowerRadiusLimit = 3;
                    camera.upperRadiusLimit = 25;
                    setAvatarVisibility(true);
                }
                if (viewModeRef.current) {
                    viewModeRef.current.textContent = isFirstPerson ? "1st Person (V)" : "3rd Person (V)";
                }
            }

            const onKeyDown = (e: KeyboardEvent) => {
                if (e.key.toLowerCase() === "v") {
                    toggleViewMode();
                    return;
                }
                keys[e.key.toLowerCase()] = true;
            };
            const onKeyUp = (e: KeyboardEvent) => {
                keys[e.key.toLowerCase()] = false;
            };
            window.addEventListener("keydown", onKeyDown);
            window.addEventListener("keyup", onKeyUp);

            scene.onBeforeRenderObservable.add(() => {
                const dt = engine.getDeltaTime() / 1000;

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

                    const allColliders = [...colliders];
                    const curX = rig.root.position.x;
                    const curZ = rig.root.position.z;
                    for (const [, remote] of remoteAvatars) {
                        const rx = remote.rig.root.position.x;
                        const rz = remote.rig.root.position.z;
                        const dx = curX - rx;
                        const dz = curZ - rz;
                        const minDist = PLAYER_RADIUS * 2;
                        if (dx * dx + dz * dz >= minDist * minDist) {
                            allColliders.push({ x: rx, z: rz, radius: PLAYER_RADIUS });
                        }
                    }

                    const newX = curX + move.x;
                    const newZ = curZ + move.z;

                    if (!isPositionBlocked(newX, newZ, allColliders)) {
                        rig.root.position.x = newX;
                        rig.root.position.z = newZ;
                    } else if (!isPositionBlocked(newX, curZ, allColliders)) {
                        rig.root.position.x = newX;
                    } else if (!isPositionBlocked(curX, newZ, allColliders)) {
                        rig.root.position.z = newZ;
                    }

                    const angle = Math.atan2(move.x, move.z);
                    rig.root.rotation.y = angle;

                    camera.target.x = rig.root.position.x;
                    camera.target.y = isFirstPerson ? rig.headBaseY * 0.95 : 1.5;
                    camera.target.z = rig.root.position.z;

                    walkPhase += WALK_CYCLE_SPEED * dt;
                    walkIntensity = Math.min(1, walkIntensity + dt * 6);
                } else {
                    walkIntensity = Math.max(0, walkIntensity - dt * 6);
                }

                animateWalkCycle(rig, walkPhase, walkIntensity);
                animateInsects(insects);

                if (coordRef.current) {
                    const px = rig.root.position.x.toFixed(1);
                    const py = rig.root.position.y.toFixed(1);
                    const pz = rig.root.position.z.toFixed(1);
                    coordRef.current.textContent = `X: ${px}  Y: ${py}  Z: ${pz}`;
                }

                // ── Broadcast local position (throttled ~20Hz) ──
                positionBroadcastTimer += dt;
                const shouldBroadcast = isMoving && positionBroadcastTimer >= BROADCAST_INTERVAL;
                const shouldSendStop = !isMoving && wasBroadcasting;

                if (shouldBroadcast || shouldSendStop) {
                    positionBroadcastTimer = 0;
                    const px = rig.root.position.x;
                    const pz = rig.root.position.z;
                    const pRotY = rig.root.rotation.y;

                    // Compute velocity (units/sec)
                    const now = performance.now() / 1000;
                    const elapsed = lastBroadcastTime > 0 ? now - lastBroadcastTime : BROADCAST_INTERVAL;
                    const vx = elapsed > 0 ? (px - lastBroadcastX) / elapsed : 0;
                    const vz = elapsed > 0 ? (pz - lastBroadcastZ) / elapsed : 0;
                    lastBroadcastX = px;
                    lastBroadcastZ = pz;
                    lastBroadcastTime = now;

                    // Save locally so i_am_here replies include our position
                    useGamePresenceStore.getState().setLocalPosition(px, pz, pRotY);

                    try {
                        localStorage.setItem(
                            `livv:lastPosition:${walletAddress.toLowerCase()}`,
                            JSON.stringify({ x: px, z: pz, rotY: pRotY }),
                        );
                    } catch { /* quota exceeded — ignore */ }

                    const wsStore = useWebSocketStore.getState();
                    wsStore.sendMessage("broadcastToChannel", {
                        type: "position",
                        x: px,
                        z: pz,
                        rotY: pRotY,
                        vx: shouldSendStop ? 0 : vx,
                        vz: shouldSendStop ? 0 : vz,
                    });
                }
                wasBroadcasting = isMoving;

                // ── Remote avatars: spawn / despawn / lerp ──
                const presenceStore = useGamePresenceStore.getState();
                const remotePlayers = presenceStore.remotePlayers;

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

                for (const [addr, remote] of remoteAvatars) {
                    if (!remotePlayers.has(addr)) {
                        remote.rig.root.dispose();
                        remoteAvatars.delete(addr);
                    }
                }

                // Lerp existing remote avatars toward extrapolated targets (dead reckoning)
                const LERP_SPEED = 10;
                const MAX_EXTRAP_TIME = 0.2; // cap extrapolation at 200ms
                for (const [addr, remote] of remoteAvatars) {
                    const playerData = remotePlayers.get(addr);
                    if (!playerData) continue;

                    // Extrapolate target using velocity
                    let goalX = playerData.targetX;
                    let goalZ = playerData.targetZ;
                    if (playerData.vx !== 0 || playerData.vz !== 0) {
                        const elapsed = Math.min(
                            (Date.now() - playerData.lastUpdateTime) / 1000,
                            MAX_EXTRAP_TIME,
                        );
                        goalX += playerData.vx * elapsed;
                        goalZ += playerData.vz * elapsed;
                    }

                    const lerpFactor = Math.min(1, dt * LERP_SPEED);
                    const oldX = remote.rig.root.position.x;
                    const oldZ = remote.rig.root.position.z;

                    remote.rig.root.position.x += (goalX - oldX) * lerpFactor;
                    remote.rig.root.position.z += (goalZ - oldZ) * lerpFactor;
                    remote.rig.root.rotation.y += (playerData.targetRotY - remote.rig.root.rotation.y) * lerpFactor;

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
                for (const [, remote] of remoteAvatars) {
                    remote.rig.root.dispose();
                }
                remoteAvatars.clear();
                pipeline.dispose();
                ssao.dispose();
                clearMaterialCache();
                scene.dispose();
                engine.dispose();
                engineRef.current = null;
            };
        },
        [walletAddress],
    );

    useEffect(() => {
        if (!canvasRef.current) return;
        let cancelled = false;
        let cleanup: (() => void) | undefined;
        setup(canvasRef.current).then((fn) => {
            if (cancelled) { fn(); return; }
            cleanup = fn;
        });
        return () => {
            cancelled = true;
            cleanup?.();
        };
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
            <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded bg-black/60 px-3 py-1.5 text-xs text-white/80 backdrop-blur-sm">
                <span ref={engineBadgeRef} className="rounded bg-emerald-600/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white" />
                <span ref={viewModeRef}>3rd Person (V)</span>
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
