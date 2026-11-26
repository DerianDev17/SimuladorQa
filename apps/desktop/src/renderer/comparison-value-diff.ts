export interface ValueSegment {
  text: string;
  changed: boolean;
}
export interface ValueDifference {
  reference: ValueSegment[];
  current: ValueSegment[];
}

// Compare display characters, never interpret encodings or financial semantics.
// Bound the quadratic part; large private fields retain a linear changed-span diff.
export function compareDisplayValues(left: string, right: string): ValueDifference {
  const a = Array.from(left);
  const b = Array.from(right);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  )
    end++;
  const x = a.slice(start, a.length - end);
  const y = b.slice(start, b.length - end);
  const result: ValueDifference = { reference: [], current: [] };
  function append(target: ValueSegment[], text: string, changed: boolean) {
    if (!text) return;
    const last = target.at(-1);
    if (last?.changed === changed) last.text += text;
    else target.push({ text, changed });
  }
  append(result.reference, a.slice(0, start).join(''), false);
  append(result.current, b.slice(0, start).join(''), false);
  if (x.length * y.length > 16384 || !x.length || !y.length) {
    append(result.reference, x.join(''), true);
    append(result.current, y.join(''), true);
  } else {
    const width = y.length + 1;
    const table = new Uint16Array((x.length + 1) * width);
    for (let i = x.length - 1; i >= 0; i--)
      for (let j = y.length - 1; j >= 0; j--)
        table[i * width + j] =
          x[i] === y[j]
            ? 1 + table[(i + 1) * width + j + 1]!
            : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    let i = 0;
    let j = 0;
    while (i < x.length || j < y.length) {
      if (i < x.length && j < y.length && x[i] === y[j]) {
        append(result.reference, x[i++]!, false);
        append(result.current, y[j++]!, false);
      } else if (
        i < x.length &&
        (j === y.length || table[(i + 1) * width + j]! >= table[i * width + j + 1]!)
      ) {
        append(result.reference, x[i++]!, true);
      } else append(result.current, y[j++]!, true);
    }
  }
  append(result.reference, a.slice(a.length - end).join(''), false);
  append(result.current, b.slice(b.length - end).join(''), false);
  return result;
}
