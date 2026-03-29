declare global {
  interface Array<T> {
    toSorted(compareFn?: (a: T, b: T) => number): T[];
  }

  interface ReadonlyArray<T> {
    toSorted(compareFn?: (a: T, b: T) => number): T[];
  }
}

export type __ArrayMethodsModule = true;
