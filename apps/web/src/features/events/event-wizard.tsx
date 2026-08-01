"use client";

import type { Airport, EventSchedule, Fir } from "@event-hub/contracts";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CircleAlertIcon,
  Clock3Icon,
  ImageIcon,
  SaveIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import {
  eventWizardSteps,
  validateEventWizard,
  type EventWizardErrors,
  type EventWizardStep,
  type EventWizardValues,
} from "./event-wizard-model";

const timeZones = [
  "Europe/Copenhagen",
  "Europe/Stockholm",
  "Europe/Oslo",
  "Europe/Helsinki",
  "Atlantic/Reykjavik",
  "Atlantic/Faroe",
  "America/Nuuk",
  "UTC",
] as const;

const stepCopy: Readonly<
  Record<EventWizardStep, Readonly<{ title: string; description: string }>>
> = {
  basics: {
    title: "Event basics",
    description: "Name the event and choose the FIR responsible for it.",
  },
  schedule: {
    title: "Schedule",
    description: "Set local civil times and the time zone used to resolve them.",
  },
  participants: {
    title: "Participants",
    description: "Choose the FIRs and airports taking part in the event.",
  },
  content: {
    title: "Event content",
    description: "Add the full public description and review the banner status.",
  },
  rostering: {
    title: "Rostering",
    description: "Choose how controller positions will be assigned.",
  },
  review: {
    title: "Review draft",
    description: "Check required details before saving the event as a draft.",
  },
};

type EventWizardProps = Readonly<{
  mode: "create" | "edit";
  values: EventWizardValues;
  ownerFirs: readonly Fir[];
  firs: readonly Fir[];
  airports: readonly Airport[];
  step: EventWizardStep;
  errors: EventWizardErrors;
  schedule: EventSchedule | undefined;
  scheduleError: string | undefined;
  canEditParticipatingFirs: boolean;
  pending: boolean;
  onChange(values: EventWizardValues): void;
  onStepChange(step: EventWizardStep): void;
  onBack(): void;
  onContinue(): void;
  onSaveAndExit(): void;
  onCancel(): void;
  onSubmit(): void;
}>;

function requiredLabel(label: string) {
  return (
    <>
      {label} <span className="text-destructive">Required</span>
    </>
  );
}

function ReviewRow({
  label,
  value,
  required = true,
}: Readonly<{
  label: string;
  value: string | undefined;
  required?: boolean;
}>) {
  const present = value !== undefined && value.trim() !== "";

  return (
    <div className="grid gap-1 border-b py-4 last:border-b-0 sm:grid-cols-[10rem_1fr_auto] sm:items-center sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm font-medium break-words">
        {present ? value : required ? "Not provided" : "Not added"}
      </dd>
      <dd
        className={cn(
          "w-fit rounded-full border px-2 py-0.5 text-xs font-medium",
          present
            ? "border-success/40 text-success"
            : required
              ? "border-destructive/40 text-destructive"
              : "text-muted-foreground",
        )}
      >
        {present ? "Ready" : required ? "Required" : "Optional"}
      </dd>
    </div>
  );
}

export function EventWizard({
  mode,
  values,
  ownerFirs,
  firs,
  airports,
  step,
  errors,
  schedule,
  scheduleError,
  canEditParticipatingFirs,
  pending,
  onChange,
  onStepChange,
  onBack,
  onContinue,
  onSaveAndExit,
  onCancel,
  onSubmit,
}: EventWizardProps) {
  const stepIndex = eventWizardSteps.findIndex(({ id }) => id === step);
  const currentCopy = stepCopy[step];
  const fullErrors = validateEventWizard(values);
  const availableTimeZones = [
    ...new Set([values.timeZone, ...timeZones].filter(Boolean)),
  ];
  const selectedFirCodes = new Set(values.participatingFirIcaoCodes);
  const visibleAirports = airports.filter((airport) =>
    selectedFirCodes.has(airport.fir.icaoCode),
  );

  function change(patch: Partial<EventWizardValues>) {
    onChange({ ...values, ...patch });
  }

  function changeOwner(ownerFirIcaoCode: string) {
    const participatingFirIcaoCodes = [
      ...new Set([
        ownerFirIcaoCode,
        ...values.participatingFirIcaoCodes.filter(
          (icaoCode) => icaoCode !== values.ownerFirIcaoCode,
        ),
      ]),
    ];
    change({ ownerFirIcaoCode, participatingFirIcaoCodes });
  }

  function toggleFir(firIcaoCode: string, checked: boolean) {
    if (!canEditParticipatingFirs || firIcaoCode === values.ownerFirIcaoCode) {
      return;
    }

    const participatingFirIcaoCodes = checked
      ? [...new Set([...values.participatingFirIcaoCodes, firIcaoCode])]
      : values.participatingFirIcaoCodes.filter(
          (icaoCode) => icaoCode !== firIcaoCode,
        );
    const participatingAirportIcaoCodes = checked
      ? values.participatingAirportIcaoCodes
      : values.participatingAirportIcaoCodes.filter((icaoCode) => {
          const airport = airports.find((item) => item.icaoCode === icaoCode);
          return airport?.fir.icaoCode !== firIcaoCode;
        });

    change({ participatingFirIcaoCodes, participatingAirportIcaoCodes });
  }

  function toggleAirport(airportIcaoCode: string, checked: boolean) {
    change({
      participatingAirportIcaoCodes: checked
        ? [
            ...new Set([
              ...values.participatingAirportIcaoCodes,
              airportIcaoCode,
            ]),
          ]
        : values.participatingAirportIcaoCodes.filter(
            (icaoCode) => icaoCode !== airportIcaoCode,
          ),
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10">
      <nav aria-label="Event setup steps" className="hidden lg:block">
        <ol className="space-y-1">
          {eventWizardSteps.map((item, index) => {
            const active = item.id === step;
            const complete = index < stepIndex;

            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    active
                      ? "bg-primary/12 font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  onClick={() => onStepChange(item.id)}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums",
                      active && "border-primary text-primary",
                      complete && "border-success/40 text-success",
                    )}
                  >
                    {complete ? <CheckIcon aria-hidden="true" /> : index + 1}
                  </span>
                  {item.label}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="min-w-0 overflow-hidden rounded-xl border bg-card/25">
        <div className="border-b px-5 py-5 sm:px-7">
          <Progress
            value={((stepIndex + 1) / eventWizardSteps.length) * 100}
            max={100}
            aria-label={`Step ${stepIndex + 1} of ${eventWizardSteps.length}: ${currentCopy.title}`}
            aria-valuetext={`Step ${stepIndex + 1} of ${eventWizardSteps.length}`}
          >
            <ProgressLabel>
              <span className="lg:hidden">{eventWizardSteps[stepIndex]?.label}</span>
              <span className="hidden lg:inline">Event setup</span>
            </ProgressLabel>
            <span className="ml-auto text-sm text-muted-foreground tabular-nums">
              Step {stepIndex + 1} of {eventWizardSteps.length}
            </span>
          </Progress>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (step === "review") {
              onSubmit();
            } else {
              onContinue();
            }
          }}
        >
          <div className="px-5 py-7 sm:px-7 sm:py-8">
            <div className="max-w-2xl">
              <h2
                id="event-wizard-step-heading"
                tabIndex={-1}
                className="text-2xl font-semibold tracking-[-0.025em] outline-none"
              >
                {currentCopy.title}
              </h2>
              <p className="mt-2 leading-7 text-muted-foreground">
                {currentCopy.description}
              </p>
            </div>

            <div className="mt-8">
              {step === "basics" ? (
                <FieldGroup>
                  <Field data-invalid={errors.ownerFirIcaoCode !== undefined}>
                    <FieldLabel htmlFor="event-owner-fir">
                      {requiredLabel("Owning FIR")}
                    </FieldLabel>
                    {mode === "create" ? (
                      <Select
                        value={values.ownerFirIcaoCode || null}
                        onValueChange={(value) => changeOwner(String(value))}
                        items={ownerFirs.map((fir) => ({
                          label: `${fir.icaoCode} · ${fir.name}`,
                          value: fir.icaoCode,
                        }))}
                        disabled={pending}
                      >
                        <SelectTrigger
                          id="event-owner-fir"
                          className="h-11 w-full"
                          aria-invalid={errors.ownerFirIcaoCode !== undefined}
                        >
                          <SelectValue placeholder="Select owning FIR" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {ownerFirs.map((fir) => (
                              <SelectItem key={fir.icaoCode} value={fir.icaoCode}>
                                {fir.icaoCode} · {fir.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="event-owner-fir"
                        className="h-11"
                        value={values.ownerFirIcaoCode}
                        readOnly
                      />
                    )}
                    <FieldDescription>
                      Ownership controls participant FIR changes and later publishing.
                    </FieldDescription>
                    <FieldError>{errors.ownerFirIcaoCode}</FieldError>
                  </Field>

                  <Field data-invalid={errors.name !== undefined}>
                    <FieldLabel htmlFor="event-name">
                      {requiredLabel("Event name")}
                    </FieldLabel>
                    <Input
                      id="event-name"
                      className="h-11"
                      value={values.name}
                      maxLength={191}
                      aria-invalid={errors.name !== undefined}
                      onChange={(event) => change({ name: event.target.value })}
                      placeholder="Cross the Pond Nordic"
                    />
                    <FieldError>{errors.name}</FieldError>
                  </Field>

                  <Field data-invalid={errors.shortDescription !== undefined}>
                    <FieldLabel htmlFor="event-short-description">
                      {requiredLabel("Short description")}
                    </FieldLabel>
                    <Textarea
                      id="event-short-description"
                      className="min-h-24"
                      value={values.shortDescription}
                      maxLength={500}
                      aria-invalid={errors.shortDescription !== undefined}
                      onChange={(event) =>
                        change({ shortDescription: event.target.value })
                      }
                      placeholder="A concise summary shown in event listings."
                    />
                    <FieldDescription>
                      {values.shortDescription.length}/500 characters
                    </FieldDescription>
                    <FieldError>{errors.shortDescription}</FieldError>
                  </Field>
                </FieldGroup>
              ) : null}

              {step === "schedule" ? (
                <FieldGroup>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field data-invalid={errors.localStart !== undefined}>
                      <FieldLabel htmlFor="event-local-start">
                        {requiredLabel("Local start")}
                      </FieldLabel>
                      <Input
                        id="event-local-start"
                        type="datetime-local"
                        className="h-11"
                        value={values.localStart}
                        aria-invalid={errors.localStart !== undefined}
                        onChange={(event) =>
                          change({ localStart: event.target.value })
                        }
                      />
                      <FieldError>{errors.localStart}</FieldError>
                    </Field>
                    <Field data-invalid={errors.localEnd !== undefined}>
                      <FieldLabel htmlFor="event-local-end">
                        {requiredLabel("Local end")}
                      </FieldLabel>
                      <Input
                        id="event-local-end"
                        type="datetime-local"
                        className="h-11"
                        value={values.localEnd}
                        aria-invalid={errors.localEnd !== undefined}
                        onChange={(event) =>
                          change({ localEnd: event.target.value })
                        }
                      />
                      <FieldError>{errors.localEnd}</FieldError>
                    </Field>
                  </div>
                  <Field data-invalid={errors.timeZone !== undefined}>
                    <FieldLabel htmlFor="event-time-zone">
                      {requiredLabel("Time zone")}
                    </FieldLabel>
                    <Select
                      value={values.timeZone}
                      onValueChange={(value) => change({ timeZone: String(value) })}
                      items={availableTimeZones.map((timeZone) => ({
                        label: timeZone,
                        value: timeZone,
                      }))}
                    >
                      <SelectTrigger
                        id="event-time-zone"
                        className="h-11 w-full"
                        aria-invalid={errors.timeZone !== undefined}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {availableTimeZones.map((timeZone) => (
                            <SelectItem key={timeZone} value={timeZone}>
                              {timeZone}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      The API rejects ambiguous or nonexistent daylight-saving times.
                    </FieldDescription>
                    <FieldError>{errors.timeZone}</FieldError>
                  </Field>
                  {schedule ? (
                    <Alert variant="success">
                      <Clock3Icon aria-hidden="true" />
                      <AlertTitle>Schedule resolved</AlertTitle>
                      <AlertDescription>
                        {schedule.startInstant} to {schedule.endInstant} (UTC)
                      </AlertDescription>
                    </Alert>
                  ) : scheduleError ? (
                    <Alert variant="destructive">
                      <CircleAlertIcon aria-hidden="true" />
                      <AlertTitle>Schedule needs attention</AlertTitle>
                      <AlertDescription>{scheduleError}</AlertDescription>
                    </Alert>
                  ) : null}
                </FieldGroup>
              ) : null}

              {step === "participants" ? (
                <FieldGroup>
                  {!canEditParticipatingFirs ? (
                    <Alert>
                      <CircleAlertIcon aria-hidden="true" />
                      <AlertTitle>Owning FIR controls FIR participation</AlertTitle>
                      <AlertDescription>
                        You can edit airports and event content, but only the owning FIR can add or remove participating FIRs.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <FieldSet>
                    <FieldLegend>Participating FIRs</FieldLegend>
                    <FieldDescription>
                      The owning FIR is always included. Additional FIRs can collaborate on this draft.
                    </FieldDescription>
                    <FieldGroup data-slot="checkbox-group" className="grid sm:grid-cols-2">
                      {firs.map((fir) => {
                        const isOwner = fir.icaoCode === values.ownerFirIcaoCode;
                        const checked = selectedFirCodes.has(fir.icaoCode);
                        const inputId = `event-fir-${fir.icaoCode}`;

                        return (
                          <Field key={fir.icaoCode} orientation="horizontal">
                            <Checkbox
                              id={inputId}
                              checked={checked}
                              disabled={isOwner || !canEditParticipatingFirs}
                              onCheckedChange={(nextChecked) =>
                                toggleFir(fir.icaoCode, nextChecked)
                              }
                            />
                            <FieldLabel htmlFor={inputId} className="flex-1">
                              <span>{fir.icaoCode} · {fir.name}</span>
                              {isOwner ? (
                                <span className="text-xs text-muted-foreground">Owner</span>
                              ) : null}
                            </FieldLabel>
                          </Field>
                        );
                      })}
                    </FieldGroup>
                  </FieldSet>

                  <Separator />

                  <FieldSet>
                    <FieldLegend>Participating airports</FieldLegend>
                    <FieldDescription>
                      Airports are optional and follow the selected FIRs.
                    </FieldDescription>
                    {visibleAirports.length > 0 ? (
                      <FieldGroup data-slot="checkbox-group" className="grid sm:grid-cols-2">
                        {visibleAirports.map((airport) => {
                          const inputId = `event-airport-${airport.icaoCode}`;
                          return (
                            <Field key={airport.icaoCode} orientation="horizontal">
                              <Checkbox
                                id={inputId}
                                checked={values.participatingAirportIcaoCodes.includes(
                                  airport.icaoCode,
                                )}
                                onCheckedChange={(checked) =>
                                  toggleAirport(airport.icaoCode, checked)
                                }
                              />
                              <FieldLabel htmlFor={inputId} className="flex-1">
                                {airport.icaoCode} · {airport.name}
                              </FieldLabel>
                            </Field>
                          );
                        })}
                      </FieldGroup>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Select at least one FIR to see its airports.
                      </p>
                    )}
                  </FieldSet>
                </FieldGroup>
              ) : null}

              {step === "content" ? (
                <FieldGroup>
                  <Field data-invalid={errors.description !== undefined}>
                    <FieldLabel htmlFor="event-description">
                      {requiredLabel("Full description")}
                    </FieldLabel>
                    <Textarea
                      id="event-description"
                      className="min-h-56"
                      value={values.description}
                      maxLength={65_535}
                      aria-invalid={errors.description !== undefined}
                      onChange={(event) =>
                        change({ description: event.target.value })
                      }
                      placeholder="Describe the event, recommended routes, and what pilots can expect."
                    />
                    <FieldError>{errors.description}</FieldError>
                  </Field>
                  <Field>
                    <FieldLabel>Event banner · Optional</FieldLabel>
                    <Alert>
                      <ImageIcon aria-hidden="true" />
                      <AlertTitle>
                        {values.bannerStorageKey
                          ? "Existing banner retained"
                          : "Banner upload is not available yet"}
                      </AlertTitle>
                      <AlertDescription>
                        {values.bannerStorageKey
                          ? values.bannerStorageKey
                          : "You can complete the draft without a banner. Secure local uploads are tracked separately."}
                      </AlertDescription>
                    </Alert>
                    {values.bannerStorageKey ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-fit"
                        onClick={() => change({ bannerStorageKey: null })}
                      >
                        Remove existing banner
                      </Button>
                    ) : null}
                  </Field>
                </FieldGroup>
              ) : null}

              {step === "rostering" ? (
                <Field data-invalid={errors.rosteringType !== undefined}>
                  <FieldLabel>{requiredLabel("Rostering approach")}</FieldLabel>
                  <ToggleGroup
                    value={values.rosteringType ? [values.rosteringType] : []}
                    onValueChange={(nextValues) => {
                      const selected = nextValues.at(-1);
                      if (selected === "open-interest" || selected === "predefined") {
                        change({ rosteringType: selected });
                      }
                    }}
                    className="grid w-full gap-3 sm:grid-cols-2"
                    aria-invalid={errors.rosteringType !== undefined}
                  >
                    <ToggleGroupItem
                      value="open-interest"
                      variant="outline"
                      className="h-auto min-h-28 w-full flex-col items-start justify-start gap-2 p-4 text-left whitespace-normal"
                    >
                      <span className="font-medium">Open interest</span>
                      <span className="text-sm font-normal text-muted-foreground">
                        Controllers express interest before positions are assigned.
                      </span>
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="predefined"
                      variant="outline"
                      className="h-auto min-h-28 w-full flex-col items-start justify-start gap-2 p-4 text-left whitespace-normal"
                    >
                      <span className="font-medium">Predefined roster</span>
                      <span className="text-sm font-normal text-muted-foreground">
                        Coordinators build the roster directly from known controllers.
                      </span>
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <FieldError>{errors.rosteringType}</FieldError>
                </Field>
              ) : null}

              {step === "review" ? (
                <div className="space-y-8">
                  {Object.keys(fullErrors).length > 0 || scheduleError || !schedule ? (
                    <Alert variant="destructive">
                      <CircleAlertIcon aria-hidden="true" />
                      <AlertTitle>Required details are missing</AlertTitle>
                      <AlertDescription>
                        Return to the highlighted setup step before creating the draft.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert variant="success">
                      <CheckIcon aria-hidden="true" />
                      <AlertTitle>Ready to create as a draft</AlertTitle>
                      <AlertDescription>
                        This does not publish the event. You can continue editing it in the workspace.
                      </AlertDescription>
                    </Alert>
                  )}

                  <section aria-labelledby="review-basics-heading">
                    <h3 id="review-basics-heading" className="text-lg font-medium">Basics</h3>
                    <dl className="mt-2 border-t">
                      <ReviewRow label="Owning FIR" value={values.ownerFirIcaoCode} />
                      <ReviewRow label="Event name" value={values.name} />
                      <ReviewRow label="Short description" value={values.shortDescription} />
                    </dl>
                  </section>
                  <section aria-labelledby="review-schedule-heading">
                    <h3 id="review-schedule-heading" className="text-lg font-medium">Schedule</h3>
                    <dl className="mt-2 border-t">
                      <ReviewRow label="Local time" value={
                        values.localStart && values.localEnd
                          ? `${values.localStart} to ${values.localEnd}`
                          : undefined
                      } />
                      <ReviewRow label="Time zone" value={values.timeZone} />
                      <ReviewRow label="Resolved UTC" value={
                        schedule
                          ? `${schedule.startInstant} to ${schedule.endInstant}`
                          : undefined
                      } />
                    </dl>
                  </section>
                  <section aria-labelledby="review-participants-heading">
                    <h3 id="review-participants-heading" className="text-lg font-medium">Participants</h3>
                    <dl className="mt-2 border-t">
                      <ReviewRow
                        label="FIRs"
                        value={values.participatingFirIcaoCodes.join(", ")}
                      />
                      <ReviewRow
                        label="Airports"
                        value={values.participatingAirportIcaoCodes.join(", ")}
                        required={false}
                      />
                    </dl>
                  </section>
                  <section aria-labelledby="review-content-heading">
                    <h3 id="review-content-heading" className="text-lg font-medium">Content</h3>
                    <dl className="mt-2 border-t">
                      <ReviewRow label="Description" value={values.description} />
                      <ReviewRow
                        label="Banner"
                        value={values.bannerStorageKey ?? undefined}
                        required={false}
                      />
                    </dl>
                  </section>
                  <section aria-labelledby="review-rostering-heading">
                    <h3 id="review-rostering-heading" className="text-lg font-medium">Rostering</h3>
                    <dl className="mt-2 border-t">
                      <ReviewRow
                        label="Approach"
                        value={
                          values.rosteringType === "open-interest"
                            ? "Open interest"
                            : values.rosteringType === "predefined"
                              ? "Predefined roster"
                              : undefined
                        }
                      />
                    </dl>
                  </section>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t bg-background/35 px-5 py-5 sm:flex-row sm:items-center sm:px-7">
            <Button type="button" size="lg" variant="ghost" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={onSaveAndExit}
              disabled={pending}
            >
              <SaveIcon data-icon="inline-start" />
              Save and exit
            </Button>
            <div className="hidden flex-1 sm:block" />
            {stepIndex > 0 ? (
              <Button type="button" size="lg" variant="outline" onClick={onBack} disabled={pending}>
                <ArrowLeftIcon data-icon="inline-start" />
                Back
              </Button>
            ) : null}
            <Button type="submit" size="lg" disabled={pending}>
              {step === "review" ? (
                mode === "create" ? "Create draft" : "Save draft"
              ) : (
                <>
                  Continue
                  <ArrowRightIcon data-icon="inline-end" />
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
