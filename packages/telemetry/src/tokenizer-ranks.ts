/** Exact byte-string rank lookup with compact storage and collision checks. */

function forEachToken(definition: string, visit: (token: string, rank: number) => void): void {
  for (const line of definition.split("\n")) {
    if (!line) continue;
    const fields = line.split(" ");
    const offset = Number.parseInt(fields[1], 10);
    for (let i = 2; i < fields.length; i++) {
      visit(atob(fields[i]), offset + (i - 2));
    }
  }
}

function hashBytes(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193);
  }
  return hash >>> 0;
}

/** Build an exact lookup without retaining per-token strings or Map entries. */
export function buildTokenRanks(definition: string): {
  get(byteString: string): number | undefined;
  has(byteString: string): boolean;
  readonly size: number;
} {
  let tokenCount = 0;
  let byteCount = 0;
  forEachToken(definition, (token) => {
    tokenCount++;
    byteCount += token.length;
  });

  // At most half full, including duplicate definitions in the capacity bound.
  let capacity = 1;
  while (capacity < tokenCount * 2) capacity *= 2;
  const index = new Uint32Array(capacity);
  const mask = capacity - 1;
  const bytes = new Uint8Array(byteCount);
  const offsets = new Uint32Array(tokenCount + 1);
  // Preserve the reference parser's Number values without integer coercion.
  const ranks = new Float64Array(tokenCount);
  let size = 0;
  let usedBytes = 0;

  function matches(entry: number, key: string): boolean {
    const start = offsets[entry];
    if (offsets[entry + 1] - start !== key.length) return false;
    for (let i = 0; i < key.length; i++) {
      if (bytes[start + i] !== key.charCodeAt(i)) return false;
    }
    return true;
  }

  // Index entries are arena entry IDs + 1; zero marks an unused slot.
  function findSlot(key: string): number {
    let slot = hashBytes(key) & mask;
    while (index[slot] !== 0 && !matches(index[slot] - 1, key)) {
      slot = (slot + 1) & mask;
    }
    return slot;
  }

  forEachToken(definition, (token, rank) => {
    const slot = findSlot(token);
    if (index[slot] !== 0) {
      ranks[index[slot] - 1] = rank;
      return;
    }
    for (let i = 0; i < token.length; i++) {
      bytes[usedBytes++] = token.charCodeAt(i);
    }
    offsets[size + 1] = usedBytes;
    ranks[size] = rank;
    index[slot] = ++size;
  });

  return {
    get(byteString) {
      const entry = index[findSlot(byteString)];
      return entry === 0 ? undefined : ranks[entry - 1];
    },
    has(byteString) {
      return index[findSlot(byteString)] !== 0;
    },
    get size() {
      return size;
    },
  };
}
