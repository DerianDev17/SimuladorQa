export function TransactionError({
  error,
}: {
  error: { code: string; message: string } | undefined;
}) {
  if (!error) return null;
  return (
    <div className="inline-error" role="alert">
      <strong>{error.message}</strong>
      <details>
        <summary>Detalle técnico</summary>
        <code>{error.code}</code>
      </details>
    </div>
  );
}
