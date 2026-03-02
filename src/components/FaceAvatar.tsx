/*
 * @Module: FaceAvatar
 * @Purpose: Renders a deterministic SVG human face from an Ethereum address
 * @Logic: Delegates face generation to faceAvatar utility, renders inline SVG
 * @Interfaces: default export FaceAvatar ({ address, size? })
 * @Constraints: UI-only wrapper — all logic lives in utils/faceAvatar.ts
 */
"use client";

import { useMemo } from "react";
import { generateFaceSvg } from "@/utils/faceAvatar";

interface FaceAvatarProps {
    address: string;
    size?: number;
}

export default function FaceAvatar({ address, size = 16 }: FaceAvatarProps) {
    const svg = useMemo(() => generateFaceSvg(address, size), [address, size]);

    return (
        <span
            className="inline-flex items-center justify-center shrink-0 rounded-full overflow-hidden"
            style={{ width: size, height: size }}
            dangerouslySetInnerHTML={{ __html: svg }}
            aria-hidden="true"
        />
    );
}
