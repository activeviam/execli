import deepFreeze from "deep-freeze";

type SharedContext = Readonly<{
  debug: boolean;
}>;

type Context<CustomContext> = SharedContext & Readonly<CustomContext>;

type ContextLike<V = unknown> = Record<string, V>;

type InternalContext = Context<{
  dryRun: boolean;
  only: readonly string[];
  skip: readonly string[];
  tag: readonly string[];
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
    only,
    skip,
    tag,
    ...userContext
  } = context;
  // @ts-expect-error
  return deepFreeze(userContext);
};

export { Context, ContextLike, SharedContext, InternalContext, getUserContext };
