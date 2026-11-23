"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Low-poly savannah at golden hour: rolling ground, acacia silhouettes, a low
 * sun and drifting dust. Camera parallaxes gently with the pointer.
 */

const GROUND_COLORS = ["#b7a15a", "#a8914c", "#c2ad63", "#9c8845"];

function Ground() {
  const geometry = useMemo(() => {
    const geo = new THREE.CircleGeometry(40, 96, 0, Math.PI * 2);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const d = Math.sqrt(x * x + z * z);
      // gentle rolling dunes that flatten toward the horizon line
      const h = (Math.sin(x * 0.35) + Math.cos(z * 0.3)) * 0.18 * Math.min(d / 6, 1);
      pos.setY(i, h);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(GROUND_COLORS[0]),
        roughness: 1,
        metalness: 0,
        flatShading: true,
      }),
    [],
  );

  return <mesh geometry={geometry} material={material} receiveShadow />;
}

function Acacia({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  const canopy = useMemo(
    () => new THREE.IcosahedronGeometry(1, 0),
    [],
  );
  const trunk = useMemo(() => new THREE.CylinderGeometry(0.06, 0.12, 1.6, 5), []);
  const bark = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#3b2a1d", roughness: 1, flatShading: true }),
    [],
  );
  const leaf = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#4a4423", roughness: 1, flatShading: true }),
    [],
  );

  return (
    <group position={position} scale={scale}>
      <mesh geometry={trunk} material={bark} position={[0, 0.8, 0]} />
      <mesh geometry={canopy} material={leaf} position={[0.2, 1.8, 0]} scale={[1.5, 0.42, 1.1]} />
      <mesh geometry={canopy} material={leaf} position={[-0.7, 1.6, 0.3]} scale={[0.9, 0.3, 0.7]} />
    </group>
  );
}

function Dust({ count = 260 }: { count?: number }) {
  const points = useRef<THREE.Points>(null);

  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 36;
      positions[i * 3 + 1] = Math.random() * 5 + 0.4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 36;
      speeds[i] = 0.05 + Math.random() * 0.18;
    }
    return { positions, speeds };
  }, [count]);

  useFrame((_, delta) => {
    if (!points.current) return;
    const attr = points.current.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      let x = attr.getX(i) + speeds[i] * delta;
      if (x > 18) x = -18;
      attr.setX(i, x);
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.08} color="#ffe6b0" transparent opacity={0.65} sizeAttenuation />
    </points>
  );
}

function CameraRig() {
  useFrame(({ camera, pointer }) => {
    const targetX = pointer.x * 1.4;
    const targetY = 1.6 + pointer.y * 0.5;
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.04);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.04);
    camera.lookAt(0, 1.2, -6);
  });
  return null;
}

export default function HeroScene({ paused = false }: { paused?: boolean }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 1.6, 8], fov: 42 }}
      gl={{ antialias: true, alpha: true }}
      frameloop={paused ? "never" : "always"}
      style={{ background: "transparent" }}
    >
      <fog attach="fog" args={["#f2c884", 10, 38]} />
      <hemisphereLight args={["#ffd9a0", "#4c452a", 1.15]} />
      <directionalLight position={[-6, 4, 2]} intensity={2.1} color="#ffb763" />

      {/* low sun on the horizon */}
      <mesh position={[-9, 2.2, -16]}>
        <sphereGeometry args={[2.1, 24, 24]} />
        <meshBasicMaterial color="#fff1cf" />
      </mesh>

      <Ground />
      <Acacia position={[3.6, 0, -3]} scale={1.15} />
      <Acacia position={[-5.2, 0, -6]} scale={0.9} />
      <Acacia position={[8.5, 0, -9]} scale={1.35} />
      <Acacia position={[-9.5, 0, -12]} scale={1.6} />
      <Dust />
      <CameraRig />
    </Canvas>
  );
}
