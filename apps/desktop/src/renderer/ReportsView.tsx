import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';

export type ReportsPage = 'load' | 'send-audit' | 'catalog-audit' | 'mediator';

const sections: { id: ReportsPage; label: string; icon: IconName }[] = [
  { id: 'load', label: 'Informes de carga', icon: 'file' },
  { id: 'send-audit', label: 'Auditoría de envío', icon: 'history' },
  { id: 'catalog-audit', label: 'Auditoría de catálogos', icon: 'entity' },
  { id: 'mediator', label: 'Consulta de Mediator', icon: 'database' },
];

export function ReportsView({
  page,
  onPageChange,
  children,
}: {
  page: ReportsPage;
  onPageChange(page: ReportsPage): void;
  children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  const previousPage = useRef(page);
  useEffect(() => {
    if (previousPage.current === page) return;
    previousPage.current = page;
    content.current?.focus({ preventScroll: true });
  }, [page]);
  return (
    <div className="settings-workspace">
      <header className="settings-heading">
        <div>
          <h1>Reportes y auditoría</h1>
          <p>Informes de carga, cambios registrados y consulta de transacciones de Mediator.</p>
        </div>
      </header>
      <div className="settings-layout">
        <aside className="settings-sidebar">
          <nav aria-label="Secciones de reportes y auditoría">
            {sections.map((section) => (
              <button
                key={section.id}
                aria-current={page === section.id ? 'page' : undefined}
                aria-controls="reports-content"
                onClick={() => onPageChange(section.id)}
              >
                <Icon name={section.icon} size={18} />
                {section.label}
              </button>
            ))}
          </nav>
        </aside>
        <div
          id="reports-content"
          className="settings-content"
          role="region"
          aria-label={`Reportes: ${sections.find((section) => section.id === page)?.label}`}
          ref={content}
          tabIndex={-1}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
