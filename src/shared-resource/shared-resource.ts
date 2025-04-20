export interface SharedResourceLike<GRef> {
  readonly ref: GRef;
  readonly close: CloseSharedResource;
}

export interface CloseSharedResource {
  (reason?: unknown): PromiseLike<void> | void;
}

/**
 * This is an _abstraction_ over a _shared resource_.
 *
 * A _shared resource_ is any _value_ having a lifetime (like a WebSocket, a FileHandle, etc...),
 * which is shared and used by many scripts concurrently.
 *
 * The goal is to allow concurrent scripts to access the same resource while handling properly its access and disposal.
 *
 * This kind of solution is actually pretty unsafe, but it solves many problems, thus, it should be used with extreme caution.
 */
export class SharedResource<GRef> implements AsyncDisposable, SharedResourceLike<GRef> {
  readonly #ref: GRef;
  readonly #close: CloseSharedResource;
  readonly #closed: boolean;

  constructor(ref: GRef, close: CloseSharedResource) {
    this.#ref = ref;
    this.#close = close;
    this.#closed = false;
  }

  get ref(): GRef {
    return this.#ref;
  }

  async close(reason?: unknown): Promise<void> {
    if (this.#closed) {
      throw new Error('Already closed.');
    }
    await this.#close(reason);
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }

  /**
   * @experimental
   */
  withPostponedClose(delay: number): SharedResource<GRef> {
    if (delay > 0) {
      return new SharedResource<GRef>(this.#ref, async (reason?: unknown): Promise<void> => {
        setTimeout((): void => {
          this.close(reason).catch((error: unknown): void => {
            reportError(error);
          });
        }, delay);
      });
    } else {
      return this;
    }
  }
}
