type SharedContext = Readonly<{
  debug: boolean;
}>;

type Context<CustomContext> = SharedContext & Readonly<CustomContext>;

type ContextLike<V = unknown> = Record<string, V>;

type InternalOptionsContext = Context<{
  dryRun: boolean;
  from: string | undefined;
  only: readonly string[];
  skip: readonly string[];
  tag: readonly string[];
  until: string | undefined;
}>;

type InternalContext = InternalOptionsContext &
  Readonly<{
    secrets: readonly string[];
  }>;

const getUserContext = <CustomContext>(
  context: Context<CustomContext> & InternalContext,
): Context<CustomContext> => {
  const {
    // @ts-expect-error
    $0: _0,
    // @ts-expect-error
    _: _1,
    // @ts-expect-error
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
  // @ts-expect-error
  return userContext;
};

/** Hold a mutable reference to some context to prevent destructuring it too early. */
type ContextHolder<C> = Readonly<{
  add: (addedContext: Readonly<ContextLike>) => void;
  addSecret: (secret: string) => void;
  copy: () => ContextHolder<C>;
  get: () => Context<C> & InternalContext;
}>;

const createContextHolder = <C>(
  initialContext: Context<C> & InternalContext,
) => {
  let context = { ...initialContext, secrets: initialContext.secrets || [] };

  const contextHolder: ContextHolder<C> = {
    add(addedContext) {
      const { debug: _debug, ...cleanedAddedContext } = getUserContext(
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

const hideSecrets = ({ secrets }: InternalContext, text: string): string =>
  // eslint-disable-next-line unicorn/no-reduce
  secrets.reduce(
    (safeText, secret) =>
      safeText.split(secret).join("*".repeat(Math.min(20, secret.length))),
    text,
  );

export {
  Context,
  ContextHolder,
  ContextLike,
  createContextHolder,
  hideSecrets,
  SharedContext,
  InternalOptionsContext,
  InternalContext,
  getUserContext,
};
