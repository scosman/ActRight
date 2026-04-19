import { test as base } from "@playwright/test";

// This file has a syntax error — missing closing brace
export const test = base.extend({
  broken: async ({}, use) => {
    await use();

