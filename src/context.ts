type SharedContext = Readonly<{
  debug: boolean;
}>;

type InternalContext = SharedContext &
  Readonly<{
    dryRun: boolean;
    only: readonly string[];
    skip: readonly string[];
    tag: readonly string[];
  }>;

export { SharedContext, InternalContext };
