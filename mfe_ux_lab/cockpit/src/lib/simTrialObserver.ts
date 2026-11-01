// Optional research instrumentation. No persistence, broker API or execution authority.
export interface SimulationTrialDefinition {
  modules: string[];
  autoRR: boolean;
  configuration: unknown;
  customModules: unknown;
  coefficients: unknown;
}
type TrialObserver = (definition: SimulationTrialDefinition) => void;
let observer: TrialObserver | undefined;
export function setSimulationTrialObserver(next: TrialObserver) {
  const previous = observer; observer = next;
  return () => { observer = previous; };
}
export function observeSimulationTrial(definition: SimulationTrialDefinition) { observer?.(definition); }
