import { isRecord } from './index';

export interface VirtualCardFixture {
  id: string;
  scheme: 'VISA';
  reference: string;
  createdAt: string;
  scope: 'LOCAL_SIMULATION_ONLY';
}

export interface VirtualCardGenerationRequest {
  count: number;
}

export function parseVirtualCardGenerationRequest(
  value: unknown,
): VirtualCardGenerationRequest | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    !Number.isInteger(value.count) ||
    (value.count as number) < 1 ||
    (value.count as number) > 20
  )
    return undefined;
  return { count: value.count as number };
}

export function createVirtualCardFixtures(
  count: number,
  uuid: () => string,
  now: () => string,
): VirtualCardFixture[] {
  return Array.from({ length: count }, () => {
    const id = uuid();
    return {
      id,
      scheme: 'VISA',
      reference: `QA-VISA-${id.replaceAll('-', '').slice(-8).toUpperCase()}`,
      createdAt: now(),
      scope: 'LOCAL_SIMULATION_ONLY',
    };
  });
}
