# Prompt: add a Zod schema

```
Context: FlowBoard API, Zod 3 (not 4), TypeScript strict. Validation contract: ADR-007.

Task: add <SchemaName> to api/src/schemas/<file>.ts for <what it validates>.
Fields:
- <field>: <type and limits, e.g. string 1-255 trimmed / enum LOW|MEDIUM|HIGH default MEDIUM / uuid>
- ...

Constraints:
- Plain z.object(): unknown keys must be stripped, so no .passthrough() and no .strict().
- Export the inferred type: export type <Name>Input = z.infer<typeof <SchemaName>>.
- Query and number fields use z.coerce. IDs use z.string().uuid().
- PATCH-style schemas: every field optional, plus a .refine requiring at least one field.
- A failed parse must produce a ZodError (globalErrorHandler maps it to 422 VALIDATION_ERROR).
```

## Verify follow-up

```
For <SchemaName>, list inputs that should be rejected and inputs that should be stripped, and
confirm each behaves that way. Does any field allow more than the brief permits (mass assignment)?
```
