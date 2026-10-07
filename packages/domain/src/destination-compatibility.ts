import type { Environment } from './index';

export interface DestinationDraftContext {
  environment: Environment;
  terminalId: string | null;
  operationCode: string | null;
}
export interface DestinationCheck {
  id: string;
  label: string;
  status: 'MATCH' | 'MISMATCH' | 'NOT_CHECKED';
  description: string;
}
export interface DestinationCompatibility {
  source: {
    title: string;
    environment: Environment;
    inspectionId: string;
    inspectedAt: string;
    document: string;
  };
  checks: readonly DestinationCheck[];
}
// Inspeccion de evidencia, separada del catalogo local y de la ejecucion transaccional.
export interface DestinationInspector {
  assess(context: DestinationDraftContext): DestinationCompatibility | null;
}
