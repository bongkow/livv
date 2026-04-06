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
import { buildAvatar, buildAddressLabel, blendWalkAnimation } from "@/game/avatarBuilder";
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

// ─── Main component ───

interface OpenWorldSceneProps {
    walletAddress: string;
}

export default function OpenWorldScene({ walletAddress }: OpenWorldSceneProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<Engine | null>(null);
    const coordRef = useRef<HTMLSpanElement>(null);
    const viewModeRef = useRef<HTMLSpanElement>(null);
    const rendererRef = useRef<HTMLSpanElement>(null);
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
            scene.environmentIntensity = 0.6;

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
            camera.lowerRadiusLimit = 0.1;
            camera.upperRadiusLimit = 0.1;
            camera.radius = 0.1;
            camera.upperBetaLimit = Math.PI / 2.05;
            camera.wheelPrecision = 30;
            camera.panningSensibility = 0;
            // Disable built-in keyboard inputs — we handle WASD/arrows ourselves
            camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");

            // ── Lights ──
            const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
            hemi.intensity = 0.7;

            const sun = new DirectionalLight("sun", new Vector3(-1, -2, 1), scene);
            sun.intensity = 1.0;
            sun.position = new Vector3(20, 40, -20);

            const shadowGen = new ShadowGenerator(2048, sun);
            shadowGen.useBlurExponentialShadowMap = true;
            shadowGen.blurKernel = 32;

            // ── World ──
            const { colliders, insects } = buildWorld(scene, shadowGen);

            // ── Movement state ──
            const keys: Record<string, boolean> = {};
            const SPEED = 0.08;
            const BROADCAST_INTERVAL = 0.1;
            let positionBroadcastTimer = 0;
            let isFirstPerson = true;
            const THIRD_PERSON_RADIUS = 8;
            const FIRST_PERSON_RADIUS = 0.1;

            // ── Remote avatar tracking ──
            const remoteAvatars = new Map<string, {
                rig: AvatarRig;
                prevX: number;
                prevZ: number;
            }>();

            // ── Rig placeholder (filled when GLB loads) ──
            let rig: AvatarRig | null = null;
            let labelMesh: Mesh | null = null;

            // Show renderer type
            if (rendererRef.current) {
                const isWebGPU = !!(engine as unknown as Record<string, unknown>)._adapter;
                rendererRef.current.textContent = isWebGPU ? "WebGPU" : "WebGL";
            }

            // ── Load player avatar (async) ──
            const POSITION_STORAGE_KEY = `livv:lastPosition:${walletAddress.toLowerCase()}`;
            let savedPos = { x: 0, z: 0, rotY: 0 };
            try {
                const stored = localStorage.getItem(POSITION_STORAGE_KEY);
                if (stored) savedPos = JSON.parse(stored);
            } catch { /* ignore */ }

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

            buildAvatar(scene, walletAddress, shadowGen).then((loadedRig) => {
                rig = loadedRig;
                rig.root.position.x = spawnX;
                rig.root.position.z = spawnZ;
                rig.root.rotation.y = savedPos.rotY;

                useGamePresenceStore.getState().setLocalPosition(spawnX, spawnZ, savedPos.rotY);

                labelMesh = buildAddressLabel(scene, rig.root, walletAddress, true);
                labelMesh.isPickable = true;

                // Hide in first-person mode
                if (isFirstPerson) {
                    rig.root.getChildMeshes().forEach((m) => { m.isVisible = false; });
                    labelMesh.isVisible = false;
                }
            });

            // ── Label click handler ──
            scene.onPointerDown = (_evt, pickResult) => {
                if (pickResult?.hit && pickResult.pickedMesh?.name === "label") {
                    const clickedRoot = pickResult.pickedMesh.parent;
                    if (rig && clickedRoot === rig.root) {
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

            function setAvatarVisibility(visible: boolean) {
                if (!rig) return;
                rig.root.getChildMeshes().forEach((m) => {
                    m.isVisible = visible;
                });
                if (labelMesh) labelMesh.isVisible = visible;
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

                // Wait for avatar to load
                if (!rig) {
                    animateInsects(insects);
                    return;
                }

                // ── Arrow keys control camera orbit/tilt ──
                const CAM_ROTATE_SPEED = 2.0;
                const CAM_TILT_SPEED = 1.5;
                if (keys["arrowleft"]) camera.alpha += CAM_ROTATE_SPEED * dt;
                if (keys["arrowright"]) camera.alpha -= CAM_ROTATE_SPEED * dt;
                if (keys["arrowup"]) camera.beta = Math.max(0.3, camera.beta - CAM_TILT_SPEED * dt);
                if (keys["arrowdown"]) camera.beta = Math.min(Math.PI / 2.05, camera.beta + CAM_TILT_SPEED * dt);

                // ── A/D turn the character ──
                const TURN_SPEED = 2.5; // radians per second
                if (keys["a"]) rig.root.rotation.y -= TURN_SPEED * dt;
                if (keys["d"]) rig.root.rotation.y += TURN_SPEED * dt;

                // ── W/S move forward/backward in character's facing direction ──
                const facingAngle = rig.root.rotation.y;
                const charForward = new Vector3(Math.sin(facingAngle), 0, Math.cos(facingAngle));

                const move = Vector3.Zero();
                if (keys["w"]) move.addInPlace(charForward);
                if (keys["s"]) move.subtractInPlace(charForward);

                const isMoving = move.length() > 0.001;

                if (isMoving) {
                    move.normalize().scaleInPlace(SPEED);

                    // Build dynamic collider list
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

                }

                // Camera always follows player (needed for arrow key rotation while standing)
                camera.target.x = rig.root.position.x;
                camera.target.y = isFirstPerson ? rig.headBaseY * 0.95 : 1.5;
                camera.target.z = rig.root.position.z;

                // Blend walk/idle animations
                blendWalkAnimation(rig, isMoving, dt);

                // Animate insects
                animateInsects(insects);

                // Update coordinate display
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
                    const px = rig.root.position.x;
                    const pz = rig.root.position.z;
                    const pRotY = rig.root.rotation.y;

                    useGamePresenceStore.getState().setLocalPosition(px, pz, pRotY);

                    try {
                        localStorage.setItem(
                            `livv:lastPosition:${walletAddress.toLowerCase()}`,
                            JSON.stringify({ x: px, z: pz, rotY: pRotY }),
                        );
                    } catch { /* quota exceeded */ }

                    const wsStore = useWebSocketStore.getState();
                    wsStore.sendMessage("broadcastToChannel", {
                        type: "position",
                        x: px,
                        z: pz,
                        rotY: pRotY,
                    });
                }

                // ── Remote avatars: spawn / despawn / lerp ──
                const presenceStore = useGamePresenceStore.getState();
                const remotePlayers = presenceStore.remotePlayers;

                // Spawn new remote avatars (async)
                for (const [addr, player] of remotePlayers) {
                    if (remoteAvatars.has(addr)) continue;
                    // Mark as pending to avoid duplicate spawns
                    remoteAvatars.set(addr, { rig: null as unknown as AvatarRig, prevX: player.x, prevZ: player.z });

                    buildAvatar(scene, player.address, shadowGen).then((remoteRig) => {
                        const remoteLabelMesh = buildAddressLabel(scene, remoteRig.root, player.address);
                        remoteLabelMesh.isPickable = true;
                        remoteRig.root.position.x = player.x;
                        remoteRig.root.position.z = player.z;
                        remoteRig.root.rotation.y = player.rotY;
                        remoteAvatars.set(addr, {
                            rig: remoteRig,
                            prevX: player.x,
                            prevZ: player.z,
                        });
                    });
                }

                // Despawn removed remote avatars
                for (const [addr, remote] of remoteAvatars) {
                    if (!remotePlayers.has(addr)) {
                        if (remote.rig) remote.rig.root.dispose();
                        remoteAvatars.delete(addr);
                    }
                }

                // Lerp existing remote avatars
                const LERP_SPEED = 8;
                for (const [addr, remote] of remoteAvatars) {
                    if (!remote.rig) continue; // still loading
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

                    blendWalkAnimation(remote.rig, remoteIsMoving, dt);

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
                    if (remote.rig) remote.rig.root.dispose();
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
            <div className="absolute bottom-4 right-4 flex flex-col items-end gap-1">
                <div className="rounded bg-black/60 px-3 py-1.5 text-xs text-white/80 backdrop-blur-sm">
                    <span ref={viewModeRef}>1st Person (V)</span>
                </div>
                <div className="rounded bg-black/60 px-3 py-1.5 font-mono text-xs text-white/80 backdrop-blur-sm">
                    <span ref={rendererRef}>WebGL</span>
                </div>
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
