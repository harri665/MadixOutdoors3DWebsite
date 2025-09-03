import React, { useRef, useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Text, Billboard } from "@react-three/drei";
import * as THREE from "three";
import { animationsBridge } from "../utils/animationsBridge";

/**
 * Preloaded single weight cube
 * - Initializes once when the GLTF group is available
 * - Starts far above the rack
 * - Listens for triggerWeightDrop to animate down (no new meshes created)
 * - Only visible during section 0
 */
export function WeightLayer() {
  const groupRef = useRef(null);
  const readyRef = useRef(false);
  const weightRef = useRef(null);
  const labelRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  // CONFIGURABLE: Final weight position offset (negative = deeper penetration)
  const WEIGHT_FINAL_POSITION_OFFSET = -9.2; // Change this value to adjust final position

  // Cached scene metrics and animation state
  const dataRef = useRef({
    x: 0,
    z: 0,
    topY: 0,
    maxDim: 1,
    size: 1,
    startY: 5,
    endY: 0,
    pounds: 1000,
    t: 0,
    dropping: false,
  });

  // Receive group once (from SceneContent)
  useEffect(() => {
    const unsub = animationsBridge.subscribe(({ group }) => {
      groupRef.current = group?.current ? group.current : null;
    });
    return unsub;
  }, []);

  // Listen for section visibility changes
  useEffect(() => {
    const onSectionChange = (e) => {
      const { section } = e.detail || {};
      console.log("Weight component received section change:", section, "isVisible will be:", section === 0);
      setIsVisible(section === 0);

      // If leaving section 0, reset weight position and stop any dropping animation
      if (section !== 0) {
        const d = dataRef.current;
        d.dropping = false;
        d.t = 0;
        if (weightRef.current && readyRef.current) {
          weightRef.current.position.set(d.x, d.startY, d.z);
          weightRef.current.scale.set(1, 1, 1);
        }
        if (labelRef.current && readyRef.current) {
          labelRef.current.position.set(d.x, d.startY + d.size * 0.8, d.z);
        }
      }
    };

    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("sectionChange", onSectionChange);
      return () => window.removeEventListener("sectionChange", onSectionChange);
    }
  }, []);

  // One-time initialization once the GLTF is ready
  useFrame(() => {
    if (readyRef.current) return;
    const root = groupRef.current;
    if (!root) return;

    // Compute world box ONCE at init
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const weightSize = (maxDim * 0.25) / 3; // 1/3 the original size
    const x = (box.min.x + box.max.x) / 2;
    const z = (box.min.z + box.max.z) / 2;
    const topY = box.max.y;
    const startY = topY + weightSize * 6.0; // REALLY far above
    const endY = topY - weightSize * 0.3 + maxDim * 0.01 + WEIGHT_FINAL_POSITION_OFFSET; // Use configurable offset

    Object.assign(dataRef.current, { x, z, topY, maxDim, size: weightSize, startY, endY, t: 0, dropping: false });

    // Position preloaded weight at startY
    if (weightRef.current) {
      weightRef.current.position.set(x, startY, z);
      weightRef.current.scale.set(1, 1, 1);
    }
    if (labelRef.current) {
      labelRef.current.position.set(x, startY + weightSize * 0.8, z);
    }

    readyRef.current = true;
  });

  // Respond to drop requests WITHOUT creating new meshes
  useEffect(() => {
    const onDrop = (e) => {
      const d = dataRef.current;
      if (!readyRef.current) return;
      const pounds = e.detail?.pounds ?? 1000;
      const endOffset = e.detail?.endOffset ?? WEIGHT_FINAL_POSITION_OFFSET; // Use configurable default
      d.pounds = pounds;
      d.endY = d.topY + d.size * endOffset + d.maxDim * 0.01; // use endOffset for positioning
      d.t = 0;
      d.dropping = true;
      // reset position to start height
      if (weightRef.current) weightRef.current.position.set(d.x, d.startY, d.z);
      if (labelRef.current) labelRef.current.position.set(d.x, d.startY + d.size * 0.8, d.z);
    };

    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("triggerWeightDrop", onDrop);
      return () => window.removeEventListener("triggerWeightDrop", onDrop);
    }
  }, []);

  // Animate if active; otherwise keep it hovering at its last y
  useFrame((_, delta) => {
    if (!readyRef.current || !weightRef.current) return;
    const d = dataRef.current;
    if (d.dropping) {
      d.t = Math.min(1, d.t + delta * 0.8);
      const e = 1 - Math.pow(1 - d.t, 3);
      const y = d.startY + (d.endY - d.startY) * e;
      weightRef.current.position.set(d.x, y, d.z);
      const squash = d.t >= 0.98 ? (d.t - 0.98) * 5 : 0; // tiny squash at end
      weightRef.current.scale.set(1 + squash, 1 - squash, 1 + squash);
      if (labelRef.current) labelRef.current.position.set(d.x, y + d.size * 0.8, d.z);
      if (d.t >= 1) d.dropping = false;
    }
  });

  if (!readyRef.current && !groupRef.current) return null;
  const d = dataRef.current;

  return (
    <group visible={isVisible}>
      <mesh ref={weightRef} castShadow receiveShadow position={[d.x, d.startY, d.z]}>
        <boxGeometry args={[d.size, d.size, d.size]} />
        <meshStandardMaterial color="#666666" metalness={0.3} roughness={0.6} />
      </mesh>
      <Billboard ref={labelRef} position={[d.x, d.startY + d.size * 0.8, d.z]}>
        <Text fontSize={d.size * 0.22} color="white" outlineWidth={0.02} outlineColor="black" anchorX="center" anchorY="middle">
          {`${d.pounds.toLocaleString()} lb`}
        </Text>
      </Billboard>
    </group>
  );
}
