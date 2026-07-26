import { type Static, Type } from "@sinclair/typebox";

export const VatsimCidSchema = Type.String({
  minLength: 1,
  maxLength: 16,
  pattern: "^[0-9]+$",
});

export type VatsimCid = Static<typeof VatsimCidSchema>;

export const AuthenticatedUserSchema = Type.Object(
  {
    cid: VatsimCidSchema,
    displayName: Type.String({ minLength: 1, maxLength: 191 }),
  },
  { additionalProperties: false },
);

export type AuthenticatedUser = Static<typeof AuthenticatedUserSchema>;

export const AuthenticatedSessionSchema = Type.Object(
  {
    user: AuthenticatedUserSchema,
    expiresAt: Type.String({
      minLength: 20,
      maxLength: 30,
      pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$",
    }),
  },
  { additionalProperties: false },
);

export type AuthenticatedSession = Static<typeof AuthenticatedSessionSchema>;
