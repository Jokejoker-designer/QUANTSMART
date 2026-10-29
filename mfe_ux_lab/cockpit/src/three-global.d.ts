// Ambient declaration for the vendored Three.js UMD global. loadThreeGlobal.ts injects the
// local script only when Surface 3D is mounted.
declare const THREE: any;
interface Window { THREE: any }
