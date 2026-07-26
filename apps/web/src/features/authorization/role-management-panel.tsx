"use client";

import { useMemo, useState } from "react";
import {
  KeyRoundIcon,
  LockKeyholeIcon,
  PlusIcon,
  SaveIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";

import type {
  AuthorizationCapability,
  AuthorizationRole,
  AuthorizationRoleScope,
  CreateAuthorizationRole,
  UpdateAuthorizationRole,
} from "@event-hub/contracts";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const protectedAdministratorCapabilities = new Set([
  "system.administrator",
  "authorization.manage",
]);
const roleKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

type RoleDraft = {
  key: string;
  name: string;
  description: string;
  scope: AuthorizationRoleScope;
  capabilityKeys: string[];
};

type RoleManagementPanelProps = Readonly<{
  capabilities: readonly AuthorizationCapability[];
  roles: readonly AuthorizationRole[];
  pending: boolean;
  onCreate: (role: CreateAuthorizationRole) => Promise<boolean>;
  onDelete: (roleKey: string) => Promise<boolean>;
  onUpdate: (
    roleKey: string,
    role: UpdateAuthorizationRole,
  ) => Promise<boolean>;
}>;

function roleDraft(role: AuthorizationRole): RoleDraft {
  return {
    key: role.key,
    name: role.name,
    description: role.description,
    scope: role.scope,
    capabilityKeys: [...role.capabilityKeys],
  };
}

function newRoleDraft(): RoleDraft {
  return {
    key: "",
    name: "",
    description: "",
    scope: "fir",
    capabilityKeys: [],
  };
}

function sortedKeys(keys: readonly string[]) {
  return [...keys].sort();
}

export function RoleManagementPanel({
  capabilities,
  roles,
  pending,
  onCreate,
  onDelete,
  onUpdate,
}: RoleManagementPanelProps) {
  const [creating, setCreating] = useState(false);
  const [selectedRoleKey, setSelectedRoleKey] = useState(
    roles[0]?.key ?? "",
  );
  const selectedRole =
    roles.find((role) => role.key === selectedRoleKey) ?? roles[0];
  const [draft, setDraft] = useState<RoleDraft>(() =>
    selectedRole === undefined
      ? newRoleDraft()
      : roleDraft(selectedRole),
  );

  const availableCapabilities = useMemo(
    () =>
      capabilities.filter(
        (capability) =>
          draft.scope === "global" ||
          capability.scope === "global-or-fir",
      ),
    [capabilities, draft.scope],
  );
  const selectedKeys = sortedKeys(draft.capabilityKeys);
  const originalKeys =
    selectedRole === undefined
      ? []
      : sortedKeys(selectedRole.capabilityKeys);
  const capabilityChanged =
    selectedKeys.length !== originalKeys.length ||
    selectedKeys.some((key, index) => key !== originalKeys[index]);
  const dirty = creating
    ? draft.key !== "" ||
      draft.name !== "" ||
      draft.description !== "" ||
      draft.capabilityKeys.length > 0
    : selectedRole !== undefined &&
      (draft.name !== selectedRole.name ||
        draft.description !== selectedRole.description ||
        capabilityChanged);
  const keyInvalid =
    draft.key !== "" && !roleKeyPattern.test(draft.key);
  const valid =
    draft.key.length >= 2 &&
    !keyInvalid &&
    draft.name.trim() !== "" &&
    draft.description.trim() !== "";
  const removedCapabilities = originalKeys.filter(
    (key) => !selectedKeys.includes(key),
  );

  function selectRole(role: AuthorizationRole) {
    setCreating(false);
    setSelectedRoleKey(role.key);
    setDraft(roleDraft(role));
  }

  function startCreating() {
    setCreating(true);
    setSelectedRoleKey("");
    setDraft(newRoleDraft());
  }

  function setScope(scope: AuthorizationRoleScope) {
    setDraft((current) => ({
      ...current,
      scope,
      capabilityKeys:
        scope === "global"
          ? current.capabilityKeys
          : current.capabilityKeys.filter((key) => {
              const capability = capabilities.find(
                (candidate) => candidate.key === key,
              );
              return capability?.scope === "global-or-fir";
            }),
    }));
  }

  function toggleCapability(key: string, checked: boolean) {
    setDraft((current) => ({
      ...current,
      capabilityKeys: checked
        ? sortedKeys([...current.capabilityKeys, key])
        : current.capabilityKeys.filter(
            (capabilityKey) => capabilityKey !== key,
          ),
    }));
  }

  async function saveRole() {
    if (!valid) {
      return;
    }

    if (creating) {
      const nextDraft = {
        key: draft.key,
        name: draft.name.trim(),
        description: draft.description.trim(),
        scope: draft.scope,
        capabilityKeys: selectedKeys,
      };
      const created = await onCreate(nextDraft);
      if (created) {
        setCreating(false);
        setSelectedRoleKey(draft.key);
        setDraft(nextDraft);
      }
      return;
    }

    if (selectedRole !== undefined) {
      const nextDraft = {
        ...draft,
        name: draft.name.trim(),
        description: draft.description.trim(),
        capabilityKeys: selectedKeys,
      };
      const updated = await onUpdate(selectedRole.key, {
        name: nextDraft.name,
        description: nextDraft.description,
        capabilityKeys: nextDraft.capabilityKeys,
      });
      if (updated) {
        setDraft(nextDraft);
      }
    }
  }

  async function deleteRole() {
    if (selectedRole === undefined) {
      return;
    }

    const deleted = await onDelete(selectedRole.key);
    if (deleted) {
      const nextRole = roles.find(
        (role) => role.key !== selectedRole.key,
      );
      setSelectedRoleKey(nextRole?.key ?? "");
      setDraft(
        nextRole === undefined
          ? newRoleDraft()
          : roleDraft(nextRole),
      );
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Roles</CardTitle>
          <CardDescription>
            Protected defaults and custom access bundles.
          </CardDescription>
          <CardAction>
            <Button
              size="sm"
              variant="outline"
              className="min-h-11"
              onClick={startCreating}
              disabled={pending}
            >
              <PlusIcon data-icon="inline-start" />
              New
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1">
            {roles.map((role) => (
              <Button
                key={role.key}
                variant={
                  !creating && selectedRoleKey === role.key
                    ? "secondary"
                    : "ghost"
                }
                className="h-auto min-h-12 justify-start px-3 py-2 text-left"
                onClick={() => selectRole(role)}
              >
                {role.protected ? (
                  <LockKeyholeIcon data-icon="inline-start" />
                ) : (
                  <KeyRoundIcon data-icon="inline-start" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{role.name}</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">
                    {role.scope === "global"
                      ? "Global"
                      : "FIR scoped"}{" "}
                    · {role.assignmentCount} assignment
                    {role.assignmentCount === 1 ? "" : "s"}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {creating
              ? "Create role"
              : (selectedRole?.name ?? "Role details")}
          </CardTitle>
          <CardDescription>
            Configure the role metadata and explicit capabilities.
          </CardDescription>
          {!creating && selectedRole !== undefined ? (
            <CardAction>
              <div className="flex flex-wrap justify-end gap-2">
                <Badge variant="outline">
                  {selectedRole.scope === "global"
                    ? "Global"
                    : "FIR scoped"}
                </Badge>
                {selectedRole.protected ? (
                  <Badge variant="secondary">
                    <LockKeyholeIcon data-icon="inline-start" />
                    Protected
                  </Badge>
                ) : null}
              </div>
            </CardAction>
          ) : null}
        </CardHeader>

        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 md:grid-cols-2">
              <Field data-invalid={keyInvalid}>
                <FieldLabel htmlFor="role-key">Stable key</FieldLabel>
                <Input
                  id="role-key"
                  value={draft.key}
                  disabled={!creating || pending}
                  aria-invalid={keyInvalid}
                  placeholder="event-planner"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      key: event.target.value.toLowerCase(),
                    }))
                  }
                />
                <FieldDescription>
                  Lowercase letters, numbers, and single hyphens.
                </FieldDescription>
                {keyInvalid ? (
                  <FieldError>
                    Enter a canonical key such as event-planner.
                  </FieldError>
                ) : null}
              </Field>

              <Field>
                <FieldLabel htmlFor="role-scope">
                  Assignment scope
                </FieldLabel>
                <Select
                  value={draft.scope}
                  onValueChange={(value) =>
                    setScope(value as AuthorizationRoleScope)
                  }
                  disabled={!creating || pending}
                  items={[
                    { label: "Global", value: "global" },
                    { label: "FIR scoped", value: "fir" },
                  ]}
                >
                  <SelectTrigger
                    id="role-scope"
                    className="h-11 w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="global">Global</SelectItem>
                      <SelectItem value="fir">FIR scoped</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Scope is immutable after the role is created.
                </FieldDescription>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="role-name">Display name</FieldLabel>
              <Input
                id="role-name"
                value={draft.name}
                disabled={pending}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="role-description">
                Description
              </FieldLabel>
              <Textarea
                id="role-description"
                value={draft.description}
                disabled={pending}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
              <FieldDescription>
                Explain the operational access this role is intended to grant.
              </FieldDescription>
            </Field>

            <FieldSet>
              <FieldLegend>Capability matrix</FieldLegend>
              <FieldDescription>
                {draft.scope === "fir"
                  ? "Only capabilities valid within FIR scope are available."
                  : "Global roles apply each selected capability across Event Hub."}
              </FieldDescription>
              <div
                data-slot="checkbox-group"
                className="grid gap-2 xl:grid-cols-2"
              >
                {availableCapabilities.map((capability) => {
                  const checked = draft.capabilityKeys.includes(
                    capability.key,
                  );
                  const protectedMarker =
                    selectedRole?.protected === true &&
                    protectedAdministratorCapabilities.has(capability.key) &&
                    selectedRole.capabilityKeys.includes(capability.key);

                  return (
                    <Field
                      key={capability.key}
                      orientation="horizontal"
                      data-disabled={protectedMarker || pending}
                      className={cn(
                        "rounded-lg border p-3",
                        checked && "bg-primary/5",
                      )}
                    >
                      <Checkbox
                        id={`capability-${capability.key}`}
                        checked={checked}
                        disabled={protectedMarker || pending}
                        onCheckedChange={(nextChecked) =>
                          toggleCapability(
                            capability.key,
                            nextChecked === true,
                          )
                        }
                      />
                      <FieldContent>
                        <FieldLabel
                          htmlFor={`capability-${capability.key}`}
                        >
                          {capability.name}
                        </FieldLabel>
                        <FieldDescription>
                          {capability.description}
                        </FieldDescription>
                        <span className="font-mono text-xs text-muted-foreground">
                          {capability.key}
                        </span>
                      </FieldContent>
                    </Field>
                  );
                })}
              </div>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Effective role preview</FieldLegend>
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex flex-wrap gap-2">
                  {selectedKeys.length === 0 ? (
                    <span className="text-sm text-muted-foreground">
                      This role will not grant any capabilities.
                    </span>
                  ) : (
                    selectedKeys.map((key) => (
                      <Badge key={key} variant="secondary">
                        {key}
                      </Badge>
                    ))
                  )}
                </div>
                {!creating && selectedRole !== undefined ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Saving affects {selectedRole.assignmentCount} current
                    assignment
                    {selectedRole.assignmentCount === 1 ? "" : "s"}.
                    {removedCapabilities.length > 0
                      ? ` ${removedCapabilities.length} capability grant${removedCapabilities.length === 1 ? "" : "s"} will be removed.`
                      : ""}
                  </p>
                ) : null}
              </div>
            </FieldSet>
          </FieldGroup>
        </CardContent>

        <CardFooter className="flex flex-wrap justify-between gap-3">
          {!creating &&
          selectedRole !== undefined &&
          !selectedRole.protected ? (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    variant="destructive"
                    className="min-h-11"
                    disabled={pending}
                  />
                }
              >
                <Trash2Icon data-icon="inline-start" />
                Delete role
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogMedia>
                    <Trash2Icon />
                  </AlertDialogMedia>
                  <AlertDialogTitle>
                    Delete {selectedRole.name}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    The role can only be deleted when it has no assignments.
                    Its audit history will remain.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => void deleteRole()}
                  >
                    Delete role
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <span />
          )}

          {creating ? (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    className="min-h-11"
                    disabled={!valid || !dirty || pending}
                  />
                }
              >
                {pending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <PlusIcon data-icon="inline-start" />
                )}
                Review and create
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogMedia>
                    <ShieldCheckIcon />
                  </AlertDialogMedia>
                  <AlertDialogTitle>
                    Create {draft.name || "this role"}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    The role will grant {selectedKeys.length}{" "}
                    {selectedKeys.length === 1
                      ? "capability"
                      : "capabilities"}{" "}
                    with{" "}
                    {draft.scope === "global" ? "global" : "FIR"} scope. The
                    change will be recorded in the audit log.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep editing</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void saveRole()}>
                    Create role
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    className="min-h-11"
                    disabled={!valid || !dirty || pending}
                  />
                }
              >
                <SaveIcon data-icon="inline-start" />
                Review and save
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogMedia>
                    <ShieldCheckIcon />
                  </AlertDialogMedia>
                  <AlertDialogTitle>
                    Save permission changes?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {removedCapabilities.length > 0
                      ? `${removedCapabilities.length} capability grant${removedCapabilities.length === 1 ? "" : "s"} will be removed for every current assignment. `
                      : ""}
                    The API will validate administrator safety and record this
                    change in the audit log.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep editing</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void saveRole()}>
                    Save changes
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
