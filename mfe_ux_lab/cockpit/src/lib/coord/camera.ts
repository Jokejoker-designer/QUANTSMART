// camera.ts — spherical orbit-camera math (ported from KIDI's domain-free core/camera.ts; pure geometry, no deps).
//   C = T + r · [ cosφ·cosθ , sinφ , cosφ·sinθ ]   (T target, r radius, θ azimuth, φ elevation)
// Used by the QuantLab 3D Surface Lab: pointer drag → (θ,φ), wheel → r.
export type Vec3 = [number, number, number];
export type CameraPreset = "iso" | "front" | "top" | "side";

export interface SphericalCamera { target: Vec3; radius: number; azimuth: number; elevation: number }

const HALF_PI = Math.PI / 2;
const EL_LIMIT = HALF_PI - 0.001;   // avoid gimbal lock at the poles
export const clampElevation = (phi: number) => Math.max(-EL_LIMIT, Math.min(EL_LIMIT, phi));

export function cameraPosition(cam: SphericalCamera): Vec3 {
  const { target, radius: r, azimuth: th, elevation: ph } = cam;
  return [target[0] + r * Math.cos(ph) * Math.cos(th), target[1] + r * Math.sin(ph), target[2] + r * Math.cos(ph) * Math.sin(th)];
}

const PRESET_ANGLES: Record<CameraPreset, { azimuth: number; elevation: number }> = {
  iso: { azimuth: Math.PI * 0.25, elevation: Math.PI * 0.2 },
  front: { azimuth: HALF_PI, elevation: 0.02 },
  top: { azimuth: HALF_PI, elevation: EL_LIMIT },
  side: { azimuth: 0.02, elevation: 0.02 },
};
export const presetCamera = (preset: CameraPreset, target: Vec3, radius: number): SphericalCamera => ({ target, radius, ...PRESET_ANGLES[preset] });
