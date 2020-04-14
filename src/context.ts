type SharedContext = Readonly<{
  debug: boolean;
}>;

type Context<CustomContext> = SharedContext & CustomContext;

type InternalContext = Context<
  Readonly<{
    dryRun: boolean;
    only: readonly string[];
    skip: readonly string[];
    tag: readonly string[];
  }>
>;

export { Context, SharedContext, InternalContext };
