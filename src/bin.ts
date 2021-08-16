#!/usr/bin/env node

import "loud-rejection/register.js";

import { createCli } from "./cli.js";

void createCli().argv;
