/*
 * @Module: FullBodyAvatar
 * @Purpose: Renders full-body avatar by stacking face SVG above body SVG
 * @Logic: Calls generateFaceSvg and generateBodySvg, stacks vertically with
 *         proportional sizing so they attach seamlessly at the neck.
 * @Interfaces: default export FullBodyAvatar ({ address, size? })
 * @Constraints: UI-only wrapper — all logic lives in utils/faceAvatar.ts & bodyAvatar.ts
 */
"use client";

import { useMemo } from "react";
import { generateFaceSvg } from "@/utils/faceAvatar";
import { generateBodySvg, BODY_VIEWBOX_WIDTH, BODY_VIEWBOX_HEIGHT } from "@/utils/bodyAvatar";

// Face viewBox is 64×64
const FACE_VB_SIZE = 64;

interface FullBodyAvatarProps {
    address: string;
    size?: number;   // Total height of the full avatar
}

export default function FullBodyAvatar({ address, size = 200 }: FullBodyAvatarProps) {
    const totalViewBoxHeight = FACE_VB_SIZE + BODY_VIEWBOX_HEIGHT;
    const faceRatio = FACE_VB_SIZE / totalViewBoxHeight;
    const bodyRatio = BODY_VIEWBOX_HEIGHT / totalViewBoxHeight;

    const faceHeight = Math.round(size * faceRatio);
    const bodyHeight = Math.round(size * bodyRatio);

    // Both SVGs share the same width base (64 viewBox units)
    const displayWidth = Math.round(size * (BODY_VIEWBOX_WIDTH / totalViewBoxHeight));

    const faceSvg = useMemo(
        () => generateFaceSvg(address, faceHeight),
        [address, faceHeight],
    );

    const bodySvg = useMemo(
        () => generateBodySvg(address, displayWidth),
        [address, displayWidth],
    );

    return (
        <div
            className="flex flex-col items-center shrink-0"
            style={{ width: displayWidth, height: size }}
        >
            {/* Face — overlaps body slightly so neck connects */}
            <span
                className="block shrink-0"
                style={{ width: displayWidth, height: faceHeight, marginBottom: -4 }}
                dangerouslySetInnerHTML={{ __html: faceSvg }}
                aria-hidden="true"
            />
            {/* Body */}
            <span
                className="block shrink-0"
                style={{ width: displayWidth, height: bodyHeight }}
                dangerouslySetInnerHTML={{ __html: bodySvg }}
                aria-hidden="true"
            />
        </div>
    );
}
