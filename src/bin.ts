#!/usr/bin/env node

import "loud-rejection/register";

import { createCli } from "./cli";

// eslint-disable-next-line @typescript-eslint/no-unused-expressions
createCli().argv;
