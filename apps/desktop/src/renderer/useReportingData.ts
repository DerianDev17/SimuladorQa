import { useEffect, useState } from 'react';
import type { CatalogSnapshot } from '../../../../packages/domain/src/catalogs';
import type { LoadHistoryPage } from '../../../../packages/domain/src/load-history';
import type { LoadConfigurationAudit } from '../../../../packages/domain/src/load-configurations';
import type { SendConfigurationSnapshot } from '../../../../packages/domain/src/send-configuration';
import type { AppSnapshot } from '../../../../packages/shared/src/contracts';
import type { DesktopClient } from './desktop-client';

interface ReportingData {
  loading: boolean;
  catalog?: CatalogSnapshot;
  send?: SendConfigurationSnapshot;
  station?: AppSnapshot;
  loadAudit?: LoadConfigurationAudit[];
  loads?: LoadHistoryPage;
  issues: { source: string; message: string }[];
}
export function useReportingData(client: DesktopClient, enabled: boolean, revision: number) {
  const [data, setData] = useState<ReportingData>({ loading: true, issues: [] });
  useEffect(() => {
    let active = true;
    setData({ loading: enabled, issues: [] });
    if (enabled)
      void Promise.all([
        client.call((api) => api.getCatalog('QA')),
        client.call((api) => api.getSendConfiguration('QA')),
        client.call((api) => api.getSnapshot()),
        client.call((api) => api.getLoadConfigurationAudit()),
        client.call((api) => api.listLoadHistory({})),
      ]).then(([catalog, send, station, loadAudit, loads]) => {
        if (!active) return;
        const next: ReportingData = { loading: false, issues: [] };
        if (catalog.ok) next.catalog = catalog.value;
        if (send.ok) next.send = send.value;
        if (station.ok) next.station = station.value;
        if (loadAudit.ok) next.loadAudit = loadAudit.value;
        if (loads.ok) next.loads = loads.value;
        for (const [source, result] of [
          ['Catálogos', catalog],
          ['Configuración de envío', send],
          ['Ambiente', station],
          ['Auditoría de carga', loadAudit],
          ['Corridas', loads],
        ] as const)
          if (!result.ok) next.issues.push({ source, message: result.error.message });
        setData(next);
      });
    return () => {
      active = false;
    };
  }, [client, enabled, revision]);
  return data;
}
