/**
 * camera.ts — spherical orbit-camera helpers for the 3D surface (pure math).
 * Ported/adapted from the TimeParadox lab's core/camera.ts (generic, physics-free).
 *
 *   C = T + r · [ cosφ·cosθ , sinφ , cosφ·sinθ ]
 */
export type Vec3 = [number, number, number];
export type CameraPreset = "iso" | "front" | "top" | "side";

export interface SphericalCamera {
  target: Vec3;
  radius: number;
  azimuth: number; // θ
  elevation: number; // φ
}

const HALF_PI = Math.PI / 2;
const EL_LIMIT = HALF_PI - 0.001;

export function clampElevation(phi: number): number {
  return Math.max(-EL_LIMIT, Math.min(EL_LIMIT, phi));
}

export function cameraPosition(cam: SphericalCamera): Vec3 {
  const { target, radius: r, azimuth: th, elevation: ph } = cam;
  return [
    target[0] + r * Math.cos(ph) * Math.cos(th),
    target[1] + r * Math.sin(ph),
    target[2] + r * Math.cos(ph) * Math.sin(th),
  ];
}

const PRESET_ANGLES: Record<CameraPreset, { azimuth: number; elevation: number }> = {
  iso: { azimuth: Math.PI * 0.25, elevation: Math.PI * 0.2 },
  front: { azimuth: HALF_PI, elevation: 0.04 },
  top: { azimuth: HALF_PI, elevation: EL_LIMIT },
  side: { azimuth: 0, elevation: 0.04 },
};

export function presetCamera(preset: CameraPreset, target: Vec3, radius: number): SphericalCamera {
  const a = PRESET_ANGLES[preset] ?? PRESET_ANGLES.iso;
  return { target, radius, azimuth: a.azimuth, elevation: clampElevation(a.elevation) };
}

export function isValidCamera(cam: SphericalCamera): boolean {
  const finite =
    cam.target.every(Number.isFinite) &&
    Number.isFinite(cam.radius) &&
    Number.isFinite(cam.azimuth) &&
    Number.isFinite(cam.elevation);
  return finite && cam.radius > 0 && Math.abs(cam.elevation) <= HALF_PI;
}

export const ALL_PRESETS: CameraPreset[] = ["iso", "front", "top", "side"];
