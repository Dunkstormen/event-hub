# ADR 0004: Local file storage for the MVP

- Status: Accepted for MVP
- Date: 2026-07-24

## Context

Event banners, charts, briefings, and other resources need durable storage. The
MVP will start on infrastructure where persistent local disk is sufficient;
introducing object storage now would add operational work before it is needed.

## Decision

Store uploaded files on a configurable persistent local volume behind a storage
interface.

- The API streams uploads into storage and records metadata in MySQL.
- Generated opaque keys determine storage paths. User filenames are metadata
  only.
- Files are not written beneath the Next.js `public` directory.
- Downloads go through an API route that applies event visibility and
  authorization.
- MIME type, extension, and file-size rules are validated before a file becomes
  available.
- Partial, replaced, and orphaned files can be identified and cleaned safely.
- Database and file-volume backups must be coordinated and restorable.

The storage interface exposes operations such as put, open/read, delete, and
metadata inspection without exposing absolute paths to domain or contract
code.

## Consequences

- The first production topology needs one durable shared volume for the API and
  worker processes that access files.
- Horizontal API scaling is constrained until storage moves to a shared
  provider.
- Database rollback and file rollback are not automatically atomic, so cleanup
  and reconciliation jobs are required.
- File access cannot be delegated directly to a CDN in the first version.
- A later S3-compatible adapter can replace local storage without changing the
  event API.

## Follow-up work

- Issue #31 implements the storage boundary and upload safeguards.
- Issue #32 implements series- and occurrence-scoped resources.
- Issue #42 defines administrator-managed file limits and allowed types.
- Issues #47 and #48 cover backup, restore, security, and production topology.
