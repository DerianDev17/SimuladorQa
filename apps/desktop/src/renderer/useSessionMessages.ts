import { useEffect, useState } from 'react';
import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import type { SessionMessages } from '../../../../packages/shared/src/session-messages';
import type { DesktopClient } from './desktop-client';

export function useSessionMessages(
  client: DesktopClient | undefined,
  execution: BalanceExecution,
  visible: boolean,
) {
  const [state, setState] = useState<{ value?: SessionMessages; error?: string }>({});
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    setState({});
    if (visible && client && execution.environment === 'QA') {
      void client
        .call((api) =>
          api.getSessionMessages({ environment: 'QA', requestId: execution.requestId }),
        )
        .then((result) => {
          if (!active) return;
          if (!result.ok) {
            setState({ error: result.error.message });
            return;
          }
          const remaining = result.value ? Date.parse(result.value.expiresAt) - Date.now() : 0;
          if (result.value && result.value.requestId === execution.requestId && remaining > 0) {
            setState({ value: result.value });
            expiry = setTimeout(() => setState({}), remaining);
          }
        });
    }
    return () => {
      active = false;
      clearTimeout(expiry);
    };
  }, [
    client,
    execution.requestId,
    execution.environment,
    execution.outcome,
    execution.finishedAt,
    execution.reversal?.outcome,
    visible,
    revision,
  ]);
  return {
    value:
      visible &&
      state.value?.requestId === execution.requestId &&
      Date.parse(state.value.expiresAt) > Date.now()
        ? state.value
        : undefined,
    error: state.error,
    refresh: () => setRevision((value) => value + 1),
  };
}
