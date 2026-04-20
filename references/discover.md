# /act discover

## Purpose

Cold-start skill that reads a codebase and drafts an initial test suite. Designed-for but not built in v1. Source: functional spec SS5.6.

## Status

This mode is designed-for but not built in v1. If the user invokes `/act discover`, respond:

> Discover is not available in v1 — designed for v1+. Use `/act new` for individual tests.

Then stop. Do not attempt to execute a discover flow.
