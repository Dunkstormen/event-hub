import {
  type Static,
  type TProperties,
  type TSchema,
  Type,
} from "@sinclair/typebox";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export const CursorPaginationProperties = {
  cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
  limit: Type.Optional(
    Type.Integer({
      default: DEFAULT_PAGE_SIZE,
      minimum: 1,
      maximum: MAX_PAGE_SIZE,
    }),
  ),
};

export function listQuerySchema<TFilters extends TProperties>(filters: TFilters) {
  return Type.Object(
    {
      ...CursorPaginationProperties,
      ...filters,
    },
    { additionalProperties: false },
  );
}

export const PaginationQuerySchema = listQuerySchema({});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

export const PageInfoSchema = Type.Object(
  {
    hasNextPage: Type.Boolean(),
    nextCursor: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
  },
  { additionalProperties: false },
);

export type PageInfo = Static<typeof PageInfoSchema>;

export function paginatedResponseSchema<TItem extends TSchema>(item: TItem) {
  return Type.Object(
    {
      items: Type.Array(item),
      pageInfo: PageInfoSchema,
    },
    { additionalProperties: false },
  );
}
