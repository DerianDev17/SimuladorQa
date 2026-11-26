export function ComparisonHelp() {
  return (
    <div className="comparison-help">
      <ol>
        <li>
          <strong>Elige A, la referencia.</strong> Pulsa «Elegir transacción A». Busca por STAN,
          RRN, UUID o terminal en Recientes, o abre Todo el historial para filtrar por fechas y
          tipo.
        </li>
        <li>
          <strong>Elige B, la transacción a revisar.</strong> Inicialmente es la operación que
          abriste. Pulsa «Cambiar transacción B» para elegir otra. A y B deben ser distintas.
        </li>
        <li>
          <strong>Revisa un mensaje.</strong> Selecciona Solicitud, Respuesta o Reverso. Cada fila
          alinea el mismo campo o tag de A y B; todos los campos aparecen por defecto.
        </li>
        <li>
          <strong>Encuentra el cambio.</strong> El rojo marca caracteres retirados de A; el verde,
          caracteres incorporados en B. «Solo diferencias» filtra la tabla; Anterior/Siguiente
          diferencia enfoca la fila. «Intercambiar A y B» invierte la comparación.
        </li>
      </ol>
      <p>
        Igual compara el valor visible completo. No verificable significa que hay máscaras o falta
        un mensaje: no confirma igualdad. Ausente/Añadido describe presencia en B respecto de A.
      </p>
      <p>
        Los espacios modificados se muestran como · y los saltos como ↵. Se comparan caracteres del
        valor guardado, no bytes del protocolo. En campos largos se resalta el tramo completo entre
        el primer y el último cambio.
      </p>
      <p>
        Mostrar valores completos consulta el archivo cifrado local. Desactivarlo o salir de
        Mensajes retira los originales de la vista. Actualizar solo consulta; no reenvía la
        transacción. Las diferencias no certifican aprobación, débito ni dispensación.
      </p>
    </div>
  );
}
