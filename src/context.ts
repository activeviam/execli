export type SharedContext = Readonly<{
  debug: boolean;
}>;

export type Context<CustomContext> = SharedContext & Readonly<CustomContext>;

export type ContextLike<V = unknown> = { [key: string]: V };

export type InternalOptionsContext = Context<{
  dryRun: boolean;
  from: string | undefined;
  only: readonly string[];
  skip: readonly string[];
  tag: readonly string[];
  until: string | undefined;
}>;

export type InternalContext = InternalOptionsContext &
  Readonly<{
    secrets: readonly string[];
  }>;

export const getUserContext = <CustomContext>(
  context: Context<CustomContext> & InternalContext,
): Context<CustomContext> => {
  const {
    // @ts-expect-error: Private.
    $0: _0,
    // @ts-expect-error: Private.
    _: _1,
    // @ts-expect-error: Private.
    "dry-run": _2,
    dryRun,
    from,
    only,
    secrets,
    skip,
    tag,
    until,
    ...userContext
  } = context;
  // @ts-expect-error: The context has been stripped of the private properties.
  return userContext;
};

/** Hold a mutable reference to some context to prevent destructuring it too early. */
export type ContextHolder<C> = Readonly<{
  add: (addedContext: Readonly<ContextLike>) => void;
  addSecret: (secret: string) => void;
  copy: () => ContextHolder<C>;
  get: () => Context<C> & InternalContext;
}>;

export const createContextHolder = <C>(
  initialContext: Context<C> & InternalContext,
) => {
  let context = { ...initialContext, secrets: initialContext.secrets || [] };

  const contextHolder: ContextHolder<C> = {
    add(addedContext) {
      const { debug: _debug, ...cleanedAddedContext } = getUserContext(
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        addedContext,
      );
      context = {
        ...context,
        ...cleanedAddedContext,
      };
    },
    addSecret(secret) {
      context = { ...context, secrets: [...context.secrets, secret] };
    },
    copy() {
      return createContextHolder(context);
    },
    get() {
      return context;
    },
  };

  return contextHolder;
};

export const hideSecrets = (
  { secrets }: InternalContext,
  text: string,
): string => {
  let safeText = text;

  for (const secret of secrets) {
    safeText = safeText
      .split(secret)
      .join("*".repeat(Math.min(20, secret.length)));
  }

  return safeText;
};
